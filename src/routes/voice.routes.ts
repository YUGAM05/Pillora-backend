import express, { Request as ExpressRequest, Response } from 'express';

interface Request extends ExpressRequest {
    hospitalId?: string;
}
import mongoose from 'mongoose';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import Appointment from '../models/Appointment';
import User from '../models/User';
import Hospital from '../models/Hospital';
import VoiceCallLog from '../models/VoiceCallLog';
import { voiceAuth } from '../middleware/voiceAuth.middleware';
import { resolveVoiceHospital } from '../middleware/resolveVoiceHospital.middleware';
import { sendSms } from '../services/sms.service';

const router = express.Router();

// In-memory rate limiter map for booking requests: phone_number -> timestamps[]
const bookingRateLimiter = new Map<string, number[]>();

// Async Call Logger Middleware (Monkey-patches res.json to capture response)
router.use((req: Request, res: Response, next) => {
    const originalJson = res.json;
    res.json = function (body) {
        (res as any).bodyData = body;
        return originalJson.call(this, body);
    };

    res.on('finish', () => {
        const hospId = req.hospitalId ? new mongoose.Types.ObjectId(req.hospitalId) : undefined;
        VoiceCallLog.create({
            endpoint: req.originalUrl || req.path,
            hospitalId: hospId,
            requestBody: req.body,
            responseStatus: res.statusCode,
            responseBody: (res as any).bodyData || null,
            timestamp: new Date()
        }).catch(err => {
            console.error('[VoiceCallLog] Error saving log asynchronously:', err.message);
        });
    });

    next();
});

/**
 * 1. POST /api/voice/doctors
 * Body: { specialty?: string }
 * Returns active doctors for req.hospitalId, optionally filtered by specialty (case-insensitive partial match).
 */
router.post('/doctors', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    try {
        const { specialty } = req.body;
        const query: any = {
            hospital: new mongoose.Types.ObjectId(req.hospitalId),
            is_active: true
        };

        if (specialty && typeof specialty === 'string') {
            query.specialty = { $regex: new RegExp(specialty.trim(), 'i') };
        }

        const doctors = await Doctor.find(query).select('name specialty').lean();
        
        const responseDoctors = doctors.map(d => ({
            doctorId: d._id.toString(),
            name: d.name,
            specialty: d.specialty
        }));

        res.status(200).json({ doctors: responseDoctors });
    } catch (error: any) {
        console.error('[VoiceDoctorsError]', error.message);
        res.status(500).json({ error: "internal_server_error" });
    }
});

/**
 * 2. POST /api/voice/slots
 * Body: { doctorId: string, date: string } // YYYY-MM-DD
 * Returns available (unbooked) slots for that doctor on that date in HH:mm 24hr format.
 */
router.post('/slots', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    try {
        const { doctorId, date } = req.body;

        if (!doctorId || !date) {
            res.status(400).json({ error: "invalid_input", details: "Missing required fields (doctorId, date)" });
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            res.status(400).json({ error: "invalid_input", details: "Invalid doctorId format" });
            return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            res.status(400).json({ error: "invalid_input", details: "Date must be in YYYY-MM-DD format" });
            return;
        }

        // Validate doctor belongs to req.hospitalId
        const doctor = await Doctor.findOne({
            _id: new mongoose.Types.ObjectId(doctorId),
            hospital: new mongoose.Types.ObjectId(req.hospitalId)
        }).select('_id').lean();

        if (!doctor) {
            res.status(404).json({ error: "doctor_not_found" });
            return;
        }

        // Query slots on date (IST local timezone)
        const startOfDay = new Date(`${date}T00:00:00+05:30`);
        const endOfDay = new Date(`${date}T23:59:59.999+05:30`);
        const now = new Date();

        const slots = await Slot.find({
            doctor: new mongoose.Types.ObjectId(doctorId),
            hospital: new mongoose.Types.ObjectId(req.hospitalId),
            startTime: { $gte: startOfDay, $lte: endOfDay, $gt: now },
            status: { $in: ['available', 'locked'] }
        }).sort({ startTime: 1 }).lean();

        const availableSlots = slots.filter(slot => {
            const maxAppts = slot.max_appointments || 1;
            return slot.booked_count < maxAppts;
        });

        const formattedSlots = availableSlots.map(slot => {
            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(new Date(slot.startTime));

            return {
                slotId: slot._id.toString(),
                time: timeStr
            };
        });

        res.status(200).json({ slots: formattedSlots });
    } catch (error: any) {
        console.error('[VoiceSlotsError]', error.message);
        res.status(500).json({ error: "internal_server_error" });
    }
});

/**
 * 3. POST /api/voice/book
 * Body: { doctorId: string, slotId: string, patientName: string, patientPhone: string }
 * Books appointment, normalizes phone, limits rates, creates patient if needed, uses transaction for race check.
 */
router.post('/book', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    try {
        const { doctorId, slotId, patientName, patientPhone } = req.body;

        if (!doctorId || !slotId || !patientName || !patientPhone) {
            res.status(400).json({ error: "invalid_input", details: "Missing required booking fields (doctorId, slotId, patientName, patientPhone)" });
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(doctorId) || !mongoose.Types.ObjectId.isValid(slotId)) {
            res.status(400).json({ error: "invalid_input", details: "Invalid doctorId or slotId format" });
            return;
        }

        // Validate and normalize phone to E.164 (Indian mobile)
        const cleanPhone = patientPhone.replace(/[\s-()]/g, '');
        const phoneMatch = cleanPhone.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
        if (!phoneMatch) {
            res.status(400).json({ error: "invalid_input", details: "Invalid phone number format. Must be a valid 10-digit Indian mobile number." });
            return;
        }
        const tenDigitCore = phoneMatch[1];
        const normalizedPhone = `+91${tenDigitCore}`;

        // In-memory rate limiting check (max 3/hr/phone)
        const nowMs = Date.now();
        const timestamps = bookingRateLimiter.get(normalizedPhone) || [];
        const recentTimestamps = timestamps.filter(ts => nowMs - ts < 3600000);

        if (recentTimestamps.length >= 3) {
            res.status(429).json({ error: "rate_limit_exceeded", details: "Max 3 bookings per phone number per hour." });
            return;
        }

        recentTimestamps.push(nowMs);
        bookingRateLimiter.set(normalizedPhone, recentTimestamps);

        // Retrieve Doctor and check hospital association
        const doctor = await Doctor.findOne({
            _id: new mongoose.Types.ObjectId(doctorId),
            hospital: new mongoose.Types.ObjectId(req.hospitalId)
        }).lean();

        if (!doctor) {
            res.status(400).json({ error: "invalid_input", details: "Doctor not found or does not belong to this hospital" });
            return;
        }

        // Retrieve Hospital
        const hospital = await Hospital.findById(req.hospitalId).select('name').lean();
        const hospitalName = hospital?.name || 'Pillora Hospital';

        // Check if Patient user already exists by phone
        let patient = await User.findOne({ phone: normalizedPhone });
        if (!patient) {
            const dummyEmail = `${tenDigitCore}@voice.pillora.in`.toLowerCase();
            patient = await User.findOne({ email: dummyEmail });
            if (!patient) {
                patient = await User.create({
                    name: patientName.trim(),
                    email: dummyEmail,
                    phone: normalizedPhone,
                    role: 'customer',
                    status: 'approved',
                    agreedToTerms: true
                });
            }
        }

        // Mongoose Session Transaction for Atomic Booking
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const freshSlot = await Slot.findOne({
                _id: new mongoose.Types.ObjectId(slotId),
                doctor: new mongoose.Types.ObjectId(doctorId),
                hospital: new mongoose.Types.ObjectId(req.hospitalId)
            }).session(session);

            if (!freshSlot) {
                res.status(400).json({ error: "invalid_input", details: "Slot not found or mismatch" });
                await session.abortTransaction();
                session.endSession();
                return;
            }

            if (freshSlot.status === 'cancelled' || freshSlot.status === 'blocked') {
                res.status(409).json({ error: "slot_unavailable" });
                await session.abortTransaction();
                session.endSession();
                return;
            }

            const maxAppts = freshSlot.max_appointments || doctor.maxAppointmentsPerSlot || 1;
            if (freshSlot.booked_count >= maxAppts || freshSlot.status === 'booked') {
                res.status(409).json({ error: "slot_unavailable" });
                await session.abortTransaction();
                session.endSession();
                return;
            }

            const activeAppointmentsCount = await Appointment.countDocuments({
                slot: slotId,
                status: { $ne: 'cancelled' }
            }).session(session);

            const tokenNumber = activeAppointmentsCount + 1;

            const appointmentDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date(freshSlot.startTime));

            const appointmentTimeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(new Date(freshSlot.startTime));

            const appointment = new Appointment({
                patient: patient._id,
                doctor: doctorId,
                hospital: req.hospitalId,
                slot: slotId,
                slotTime: freshSlot.startTime,
                status: 'confirmed',
                paymentStatus: 'unpaid',
                paymentSource: 'manual',
                tokenNumber,
                patientName: patientName.trim(),
                patientPhone: normalizedPhone,
                doctorName: `Dr. ${doctor.name}`,
                hospitalName: hospitalName,
                consultationFee: doctor.fee || 500,
                appointmentDate: appointmentDateStr,
                appointmentTime: appointmentTimeStr
            });

            await appointment.save({ session });

            const newBookedCount = freshSlot.booked_count + 1;
            const updatedSlot = await Slot.findOneAndUpdate(
                {
                    _id: slotId,
                    booked_count: { $lt: maxAppts }
                },
                {
                    $inc: { booked_count: 1 },
                    $set: {
                        status: (newBookedCount >= maxAppts) ? 'booked' : 'available',
                        appointment: appointment._id
                    }
                },
                { session, new: true }
            );

            if (!updatedSlot) {
                res.status(409).json({ error: "slot_unavailable" });
                await session.abortTransaction();
                session.endSession();
                return;
            }

            await session.commitTransaction();
            session.endSession();

            // Emit Real-time Sockets
            const io = req.app.get('io');
            if (io) {
                io.emit('slotBooked', {
                    slotId,
                    doctorId,
                    date: appointmentDateStr,
                    bookedCount: updatedSlot.booked_count,
                    maxAppointments: maxAppts
                });
                io.emit('appointmentsUpdated', { hospitalId: req.hospitalId });
            }

            res.status(201).json({
                appointmentId: appointment._id.toString(),
                status: "confirmed",
                doctorName: `Dr. ${doctor.name}`,
                time: appointmentTimeStr,
                date: appointmentDateStr
            });

        } catch (txnError: any) {
            await session.abortTransaction();
            session.endSession();
            throw txnError;
        }

    } catch (error: any) {
        console.error('[VoiceBookError]', error.message);
        res.status(500).json({ error: "internal_server_error" });
    }
});

/**
 * 4. POST /api/voice/confirm
 * Body: { appointmentId: string }
 * Triggers SMS confirmation if appointment belongs to req.hospitalId.
 */
router.post('/confirm', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    try {
        const { appointmentId } = req.body;

        if (!appointmentId) {
            res.status(400).json({ error: "invalid_input", details: "Appointment ID is required" });
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
            res.status(400).json({ error: "invalid_input", details: "Invalid appointmentId format" });
            return;
        }

        const appointment = await Appointment.findOne({
            _id: new mongoose.Types.ObjectId(appointmentId),
            hospital: new mongoose.Types.ObjectId(req.hospitalId)
        }).lean();

        if (!appointment) {
            res.status(404).json({ error: "appointment_not_found" });
            return;
        }

        const phone = appointment.patientPhone;
        const msg = `Your appointment with ${appointment.doctorName} is confirmed for ${appointment.appointmentDate} at ${appointment.appointmentTime}. Thank you!`;

        if (phone) {
            await sendSms(phone, msg);
        }

        res.status(200).json({
            sent: true,
            appointmentId: appointment._id.toString()
        });
    } catch (error: any) {
        console.error('[VoiceConfirmError]', error.message);
        res.status(500).json({ error: "internal_server_error" });
    }
});

export default router;
