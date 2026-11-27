import express, { Request as ExpressRequest, Response } from 'express';

interface Request extends ExpressRequest {
    hospitalId?: string;
}
import mongoose from 'mongoose';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import { effectiveCapacityForDoctor } from '../utils/slotCapacity';
import Appointment from '../models/Appointment';
import User from '../models/User';
import Hospital from '../models/Hospital';
import VoiceCallLog from '../models/VoiceCallLog';
import VoiceCall from '../models/VoiceCall';
import { voiceAuth } from '../middleware/voiceAuth.middleware';
import { resolveVoiceHospital } from '../middleware/resolveVoiceHospital.middleware';
import { sendSms } from '../services/sms.service';
import { sendCountedTemplate, aiStatus, consumeAiSeconds, billableSeconds } from '../services/usageService';
import { aiReceptionistForVoice } from '../utils/aiReceptionist';
import { sendAdminAlertEmail } from '../services/emailService';
import { groupFreeSlots, checkedDates } from '../utils/voiceAvailability';

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
 * Body: { specialty?: string, name?: string }
 * Returns active doctors for req.hospitalId, optionally filtered by specialty or name (case-insensitive partial match).
 */
router.post('/doctors', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    const toolCall = req.body?.message?.toolCallList?.[0];
    const toolCallId = toolCall?.id;
    const args = toolCall?.function?.arguments || {};
    try {
        const { specialty, name } = args;
        const baseQuery: any = {
            hospital: new mongoose.Types.ObjectId(req.hospitalId),
            is_active: true
        };

        const filteredQuery: any = { ...baseQuery };
        if (specialty && typeof specialty === 'string') {
            filteredQuery.specialty = { $regex: new RegExp(specialty.trim(), 'i') };
        }
        if (name && typeof name === 'string') {
            filteredQuery.name = { $regex: new RegExp(name.trim(), 'i') };
        }

        let doctors = await Doctor.find(filteredQuery).select('name specialty').lean();

        // If a name or specialty filter was applied but matched nothing,
        // fall back to the full active doctor list so the caller/model
        // can still resolve a name that may have been mistranscribed.
        if (doctors.length === 0 && (name || specialty)) {
            doctors = await Doctor.find(baseQuery).select('name specialty').lean();
        }

        const responseDoctors = doctors.map(d => ({
            doctorId: d._id.toString(),
            name: d.name,
            specialty: d.specialty
        }));

        // Hospital name and AI receptionist settings (spoken name, greeting
        // language, information for callers), and whether the hospital still has
        // AI call minutes (plan + packs).
        const [hospital, ai] = await Promise.all([
            Hospital.findById(req.hospitalId).select('name aiReceptionist').lean(),
            aiStatus(req.hospitalId!).catch((e: any) => {
                console.error('[VoiceDoctors] AI minutes check failed, allowing the call:', e?.message);
                return { allowed: true, remainingMinutes: null as any, planMinutes: null as any };
            }),
        ]);

        res.status(200).json({
            results: [{ toolCallId, result: JSON.stringify({ doctors: responseDoctors, hospitalName: hospital?.name?.trim(), receptionist: aiReceptionistForVoice(hospital), ai }) }]
        });
    } catch (error: any) {
        console.error('[VoiceDoctorsError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
});

/**
 * 2. POST /api/voice/slots
 * Body: { doctorId: string, date: string } // YYYY-MM-DD
 * Returns available (unbooked) slots for that doctor on that date in HH:mm 24hr format.
 */
router.post('/slots', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    const toolCall = req.body?.message?.toolCallList?.[0];
    const toolCallId = toolCall?.id;
    const args = toolCall?.function?.arguments || {};
    try {
        const { doctorId, date } = args;
        console.log('[DEBUG] Slots query args:', JSON.stringify({ doctorId, date }));

        if (!doctorId || !date) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Missing required fields (doctorId, date)" }) }]
            });
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid doctorId format" }) }]
            });
            return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Date must be in YYYY-MM-DD format" }) }]
            });
            return;
        }

        // Validate doctor belongs to req.hospitalId
        const doctor = await Doctor.findOne({
            _id: new mongoose.Types.ObjectId(doctorId),
            hospital: new mongoose.Types.ObjectId(req.hospitalId)
        }).select('_id').lean();

        if (!doctor) {
            res.status(404).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "doctor_not_found" }) }]
            });
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

        res.status(200).json({
            results: [{ toolCallId, result: JSON.stringify({ slots: formattedSlots }) }]
        });
    } catch (error: any) {
        console.error('[VoiceSlotsError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
});

/**
 * 2b. POST /api/voice/availability
 * Body: { doctorIds?: string[], dates: string[] } // dates YYYY-MM-DD, 1-14, within 31 days
 * Free (unbooked) slots of several doctors on several days in ONE request:
 * { doctors: [{ doctorId, days: [{ date, slots: [{ slotId, time }] }] }] }.
 * No doctorIds = every active doctor of the hospital. The AI receptionist used
 * to call /slots once per doctor per day: 7+ requests per question, about 5 s
 * while the server started extra copies of itself.
 */
router.post('/availability', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    const toolCall = req.body?.message?.toolCallList?.[0];
    const toolCallId = toolCall?.id;
    const args = toolCall?.function?.arguments || {};
    const invalid = (details: string) => {
        res.status(400).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details }) }]
        });
    };
    try {
        const dates = checkedDates(args.dates);
        if (!dates) return invalid('dates must be 1-14 dates (YYYY-MM-DD) within 31 days');

        const { doctorIds } = args;
        const asked: string[] | undefined = doctorIds;
        if (asked !== undefined && (!Array.isArray(asked) || asked.length === 0 || asked.length > 50
            || !asked.every((id: unknown) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)))) {
            return invalid('doctorIds must be 1-50 valid doctor ids');
        }

        // Only this hospital's doctors: the ones asked for, else every active one.
        const hospital = new mongoose.Types.ObjectId(req.hospitalId);
        const doctorQuery: any = { hospital };
        if (asked) doctorQuery._id = { $in: asked.map((id) => new mongoose.Types.ObjectId(id)) };
        else doctorQuery.is_active = true;
        const doctors = await Doctor.find(doctorQuery).select('_id').lean();
        const found = new Set(doctors.map((d) => d._id.toString()));

        const slots = doctors.length
            ? await Slot.find({
                doctor: { $in: doctors.map((d) => d._id) },
                hospital,
                startTime: {
                    $gte: new Date(`${dates[0]}T00:00:00+05:30`),
                    $lte: new Date(`${dates[dates.length - 1]}T23:59:59.999+05:30`),
                    $gt: new Date()
                },
                status: { $in: ['available', 'locked'] }
            }).select('doctor startTime booked_count max_appointments').sort({ startTime: 1 }).lean()
            : [];

        // The order asked for; doctors of other hospitals are left out.
        const order = asked ? asked.filter((id) => found.has(id)) : [...found];
        res.status(200).json({
            results: [{ toolCallId, result: JSON.stringify({ doctors: groupFreeSlots(order, dates, slots as any[]) }) }]
        });
    } catch (error: any) {
        console.error('[VoiceAvailabilityError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
});

/**
 * 3. POST /api/voice/book
 * Body: { doctorId: string, slotId: string, patientName: string, patientPhone: string }
 * Books appointment, normalizes phone, limits rates, creates patient if needed, uses transaction for race check.
 */
router.post('/book', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    const toolCall = req.body?.message?.toolCallList?.[0];
    const toolCallId = toolCall?.id;
    const args = toolCall?.function?.arguments || {};
    try {
        const { doctorId, slotId, patientName, patientPhone } = args;

        if (!doctorId || !slotId || !patientName || !patientPhone) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Missing required booking fields (doctorId, slotId, patientName, patientPhone)" }) }]
            });
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(doctorId) || !mongoose.Types.ObjectId.isValid(slotId)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid doctorId or slotId format" }) }]
            });
            return;
        }

        // Validate and normalize phone to E.164 (Indian mobile)
        const cleanPhone = patientPhone.replace(/[\s-()]/g, '');
        const phoneMatch = cleanPhone.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
        if (!phoneMatch) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid phone number format. Must be a valid 10-digit Indian mobile number." }) }]
            });
            return;
        }
        const tenDigitCore = phoneMatch[1];
        const normalizedPhone = `+91${tenDigitCore}`;

        // In-memory rate limiting check (max 3/hr/phone)
        const nowMs = Date.now();
        const timestamps = bookingRateLimiter.get(normalizedPhone) || [];
        const recentTimestamps = timestamps.filter(ts => nowMs - ts < 3600000);

        if (recentTimestamps.length >= 3) {
            res.status(429).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "rate_limit_exceeded", details: "Max 3 bookings per phone number per hour." }) }]
            });
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
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Doctor not found or does not belong to this hospital" }) }]
            });
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
                res.status(400).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Slot not found or mismatch" }) }]
                });
                await session.abortTransaction();
                session.endSession();
                return;
            }

            if (freshSlot.status === 'cancelled' || freshSlot.status === 'blocked') {
                res.status(409).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "slot_unavailable" }) }]
                });
                await session.abortTransaction();
                session.endSession();
                return;
            }

            const maxAppts = freshSlot.max_appointments || await effectiveCapacityForDoctor(doctor);
            if (freshSlot.booked_count >= maxAppts || freshSlot.status === 'booked') {
                res.status(409).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "slot_unavailable" }) }]
                });
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
                bookingSource: 'ai_call',
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
                res.status(409).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "slot_unavailable" }) }]
                });
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

            // WhatsApp confirmation: same approved template and wording as walk-in
            // and online bookings. Awaited (serverless functions stop after the
            // response) but capped at 6 s, and never fails the booking.
            let whatsapp: 'sent' | 'failed' = 'failed';
            try {
                const slotDate = new Date(freshSlot.startTime);
                const waResult: any = await Promise.race([
                    sendCountedTemplate({ hospitalId: req.hospitalId, kind: 'confirmation', appointmentId: appointment._id }, normalizedPhone, 'appointment_confirmation', 'en', [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: patientName.trim() },
                                { type: 'text', text: `Dr. ${doctor.name}` },
                                { type: 'text', text: hospitalName },
                                { type: 'text', text: slotDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) },
                                { type: 'text', text: slotDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) }
                            ]
                        }
                    ]),
                    new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'timeout after 6s' }), 6000))
                ]);
                if (waResult?.success) whatsapp = 'sent';
                else console.error('[VoiceBook] WhatsApp confirmation failed (booking kept):', waResult?.error);
            } catch (waErr: any) {
                console.error('[VoiceBook] WhatsApp confirmation error (booking kept):', waErr?.message || waErr);
            }

            res.status(201).json({
                results: [{
                    toolCallId,
                    result: JSON.stringify({
                        appointmentId: appointment._id.toString(),
                        status: "confirmed",
                        doctorName: `Dr. ${doctor.name}`,
                        time: appointmentTimeStr,
                        date: appointmentDateStr,
                        whatsapp
                    })
                }]
            });

        } catch (txnError: any) {
            await session.abortTransaction();
            session.endSession();
            throw txnError;
        }

    } catch (error: any) {
        console.error('[VoiceBookError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
});

/**
 * 4. POST /api/voice/confirm
 * Body: { appointmentId: string }
 * Triggers SMS confirmation if appointment belongs to req.hospitalId.
 */
router.post('/confirm', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    const toolCall = req.body?.message?.toolCallList?.[0];
    const toolCallId = toolCall?.id;
    const args = toolCall?.function?.arguments || {};
    try {
        const { appointmentId } = args;

        if (!appointmentId) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Appointment ID is required" }) }]
            });
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid appointmentId format" }) }]
            });
            return;
        }

        const appointment = await Appointment.findOne({
            _id: new mongoose.Types.ObjectId(appointmentId),
            hospital: new mongoose.Types.ObjectId(req.hospitalId)
        }).lean();

        if (!appointment) {
            res.status(404).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "appointment_not_found" }) }]
            });
            return;
        }

        const phone = appointment.patientPhone;
        const msg = `Your appointment with ${appointment.doctorName} is confirmed for ${appointment.appointmentDate} at ${appointment.appointmentTime}. Thank you!`;

        if (phone) {
            await sendSms(phone, msg);
        }

        res.status(200).json({
            results: [{
                toolCallId,
                result: JSON.stringify({
                    sent: true,
                    appointmentId: appointment._id.toString()
                })
            }]
        });
    } catch (error: any) {
        console.error('[VoiceConfirmError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
});

/**
 * 5. POST /api/voice/call-usage
 * Sent by the voice server when an AI call ends:
 * { callUuid, durationSeconds, from?, outcome?, appointmentId?, language?, startedAt? }
 * Records the call (once per callUuid) and charges its AI minutes:
 * plan minutes first, then minute packs (30-second blocks, < 10 s free).
 */
router.post('/call-usage', voiceAuth, resolveVoiceHospital, async (req: Request, res: Response): Promise<void> => {
    const toolCall = req.body?.message?.toolCallList?.[0];
    const toolCallId = toolCall?.id;
    const args = toolCall?.function?.arguments || {};
    try {
        const { callUuid, durationSeconds, from, outcome, appointmentId, language, startedAt } = args;
        const duration = Number(durationSeconds);
        if (!callUuid || typeof callUuid !== 'string' || !Number.isFinite(duration) || duration < 0 || duration > 4 * 3600) {
            res.status(400).json({ results: [{ toolCallId, result: JSON.stringify({ error: 'invalid_input' }) }] });
            return;
        }
        const billed = billableSeconds(Math.round(duration));
        try {
            await VoiceCall.create({
                hospital: req.hospitalId,
                callUuid,
                from: typeof from === 'string' ? from.replace(/[^\d+]/g, '').slice(0, 16) : undefined,
                to: typeof req.body?.to === 'string' ? req.body.to.replace(/\D/g, '') : undefined,
                startedAt: startedAt ? new Date(startedAt) : undefined,
                durationSeconds: Math.round(duration),
                billedSeconds: billed,
                outcome: ['booked', 'no_booking', 'ended_early', 'unavailable'].includes(outcome) ? outcome : (appointmentId ? 'booked' : 'no_booking'),
                appointment: appointmentId && mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : undefined,
                language: typeof language === 'string' ? language.slice(0, 8) : undefined,
            });
        } catch (e: any) {
            if (e?.code === 11000) {
                res.status(200).json({ results: [{ toolCallId, result: JSON.stringify({ ok: true, duplicate: true }) }] });
                return;
            }
            throw e;
        }
        const charged = await consumeAiSeconds(req.hospitalId!, billed);
        res.status(200).json({ results: [{ toolCallId, result: JSON.stringify({ ok: true, billedSeconds: billed, charged }) }] });
    } catch (error: any) {
        console.error('[VoiceCallUsageError]', error.message);
        res.status(500).json({ results: [{ toolCallId, result: JSON.stringify({ error: 'internal_server_error' }) }] });
    }
});

/**
 * 6. POST /api/voice/alert
 * Sent by the voice server when the AI phone line stops or starts working
 * (Sarvam: no credits, quota, bad key). Emails Pillora's team.
 * Body: { kind: 'sarvam_down' | 'sarvam_up' | 'test', reason?, since? (ISO), failedCalls? }
 */
const lastAlertAt = new Map<string, number>(); // kind -> time of the last email sent
const ALERT_GAP_MS = 10 * 60_000; // the voice server limits too; this stops loops

router.post('/alert', voiceAuth, async (req: Request, res: Response): Promise<void> => {
    const { kind, reason, since, failedCalls } = req.body ?? {};
    if (!['sarvam_down', 'sarvam_up', 'test'].includes(kind)) {
        res.status(400).json({ error: 'invalid_kind' });
        return;
    }
    if (Date.now() - (lastAlertAt.get(kind) ?? 0) < ALERT_GAP_MS) {
        res.status(200).json({ ok: true, skipped: 'sent_recently' });
        return;
    }
    const ist = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(d);
    const sinceDate = since && !Number.isNaN(Date.parse(since)) ? new Date(since) : null;
    const missed = Number.isFinite(Number(failedCalls)) ? Math.max(0, Math.round(Number(failedCalls))) : 0;
    const why = typeof reason === 'string' ? reason.slice(0, 200) : '';

    let sent = false;
    if (kind === 'sarvam_down') {
        sent = await sendAdminAlertEmail({
            subject: 'Pillora AI phone line is DOWN',
            heading: 'The AI phone receptionist cannot take calls',
            lines: [
                `Since: ${ist(sinceDate ?? new Date())} (India time)`,
                `What Sarvam AI says: ${why || 'unknown error'}`,
                ...(missed ? [`Callers turned away so far: ${missed}`] : []),
                'Callers hear a short message (in Gujarati and Hindi) to call the hospital directly, then the call ends.',
                'If it says "No credits available": add credits in your Sarvam account (Settings → Billing). Turning on Auto-Recharge there stops this from happening again.',
                'You will get another email as soon as calls work again.',
            ],
        });
    } else if (kind === 'sarvam_up') {
        sent = await sendAdminAlertEmail({
            subject: 'Pillora AI phone line is working again',
            heading: 'The AI phone receptionist is taking calls again',
            lines: [
                `Working again since: ${ist(new Date())} (India time)`,
                ...(sinceDate ? [`It was down from: ${ist(sinceDate)}`] : []),
                `Callers turned away meanwhile: ${missed}`,
            ],
        });
    } else {
        sent = await sendAdminAlertEmail({
            subject: 'Pillora AI phone line: test alert',
            heading: 'Test alert from the Pillora voice server',
            lines: ['If you can read this, alerts about the AI phone line reach this inbox. Nothing is wrong.'],
        });
    }
    if (sent) lastAlertAt.set(kind, Date.now());
    res.status(sent ? 200 : 502).json({ ok: sent });
});

export default router;
