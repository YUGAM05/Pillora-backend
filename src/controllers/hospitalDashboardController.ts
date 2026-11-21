import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/authMiddleware';
import Hospital from '../models/Hospital';
import { resolveHospitalAccess, hasHospitalPermission, permissionsForRole } from '../utils/hospitalAccess';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import Appointment from '../models/Appointment';
import User from '../models/User';
import PatientNote from '../models/PatientNote';
import Payment from '../models/Payment';
import Settlement from '../models/Settlement';
import mongoose from 'mongoose';
import { createHold, releaseHold } from '../utils/holdManager';
import { claimSeat, releaseSeat, liveSlotView, slotCapacity, holdFailureResponse, HoldFailure } from '../utils/slotBooking';
import { cancelAppointmentWithPolicy, refundRazorpayPayment, applyRefundToRecords } from '../utils/bookingCancellation';
import PDFDocument from 'pdfkit';
import { v2 as cloudinary } from 'cloudinary';
import { sendInvoiceEmail } from '../services/emailService';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djlttfqje',
    api_key: process.env.CLOUDINARY_API_KEY || '372769319742221',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'JZ88aoet4iKXegIT19PKqDoL2nU'
});
import { sendBookingConfirmationEmail, sendHospitalNotificationEmail, sendPrescriptionEmail } from '../services/emailService';
import { formatDateIST, formatTimeIST } from '../utils/dateHelper';
import { sendCountedTemplate, doctorLimit } from '../services/usageService';
import HospitalSubscriptionPayment from '../models/HospitalSubscriptionPayment';
import { computeSubscriptionStatus } from '../services/subscriptionService';
import { getHospitalFinancialOverview } from './financialController';
import { getJwtSecret } from '../config/security';

/** Escape user text before using it in a RegExp (prevents regex injection / ReDoS). */
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Hospital a hospital user (owner or active staff) may open appointment files
 * for, or null when their role has no appointments access.
 */
const hospitalForAppointmentAccess = async (user: any): Promise<any> => {
    const access = await resolveHospitalAccess(user);
    return access.ok && hasHospitalPermission(access.staffRole, 'appointments') ? access.hospital : null;
};

// @desc    Get hospital dashboard stats
// @route   GET /api/hospital/dashboard/stats
// @access  Private/Hospital
export const getHospitalStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        
        const doctorCount = await Doctor.countDocuments({ hospital: hospital._id });
        const appointmentCount = await Appointment.countDocuments({ hospital: hospital._id });
        const pendingAppointments = await Appointment.countDocuments({ hospital: hospital._id, status: 'pending' });
        
        const staffRole: string = (req as any).staffRole || 'owner';
        const permissions: string[] = (req as any).hospitalPermissions || permissionsForRole(staffRole);
        const canSeeAppointments = hasHospitalPermission(staffRole, 'appointments');

        const recentAppointments = canSeeAppointments
            ? await Appointment.find({ hospital: hospital._id })
                .populate('patient', 'name email')
                .populate('doctor', 'name specialty')
                .sort({ createdAt: -1 })
                .limit(5)
            : [];

        // Owners get the hospital document as before; staff get it without
        // owner-only fields (bank details, temp password, billing notes).
        let hospitalOut: any = hospital;
        if (staffRole !== 'owner') {
            hospitalOut = typeof hospital.toObject === 'function' ? hospital.toObject() : { ...hospital };
            for (const k of ['tempPassword', 'adminNotes', 'bankDetails', 'lastPaymentAmount', 'lastPaymentMethod', 'lastPaymentReference']) {
                delete hospitalOut[k];
            }
        }

        res.json({
            stats: {
                doctors: doctorCount,
                appointments: appointmentCount,
                pending: pendingAppointments,
                hospital: hospitalOut
            },
            recentAppointments,
            management_type: hospital.management_type,
            staffRole,
            permissions,
            user: { _id: req.user?._id, name: req.user?.name, email: req.user?.email }
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
};

// @desc    Get all doctors for a hospital
// @route   GET /api/hospital/doctors
export const getHospitalDoctors = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const doctors = await Doctor.find({ hospital: hospital._id });
        res.json(doctors);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching doctors', error: error.message });
    }
};

// @desc    Add a doctor or specialty group (Self-Managed only)
// @route   POST /api/hospital/doctors
export const addDoctor = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { name, email, phone, specialty, fee, availability, isSpecialtyGroup, department, maxAppointmentsPerSlot, doctorsCount, description } = req.body;

        // Plan limit: Clinic 5 doctors, Hospital 25, Enterprise unlimited.
        const limit = await doctorLimit(hospital._id);
        if (!limit.allowed) {
            res.status(403).json({
                message: `Your ${limit.plan} plan allows up to ${limit.max} doctors. Please upgrade your plan to add more.`,
                code: 'doctor_limit_reached',
                limit,
            });
            return;
        }

        const doctor = await Doctor.create({
            hospital: hospital._id,
            name,
            email,
            phone,
            specialty,
            fee,
            availability: availability || [],
            isSpecialtyGroup: Boolean(isSpecialtyGroup),
            department,
            maxAppointmentsPerSlot: maxAppointmentsPerSlot ? Number(maxAppointmentsPerSlot) : 1,
            doctorsCount: doctorsCount ? Number(doctorsCount) : 1,
            description
        });

        res.status(201).json(doctor);
    } catch (error: any) {
        res.status(500).json({ message: 'Error adding doctor', error: error.message });
    }
};

// @desc    Update doctor or specialty group (Self-Managed only)
// @route   PUT /api/hospital/doctors/:id
export const updateDoctor = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;
        const updateData = { ...req.body };

        if (updateData.fee !== undefined) updateData.fee = Number(updateData.fee);
        if (updateData.maxAppointmentsPerSlot !== undefined) updateData.maxAppointmentsPerSlot = Number(updateData.maxAppointmentsPerSlot);
        if (updateData.doctorsCount !== undefined) updateData.doctorsCount = Number(updateData.doctorsCount);
        if (updateData.isSpecialtyGroup !== undefined) updateData.isSpecialtyGroup = Boolean(updateData.isSpecialtyGroup);
        if (updateData.is_active !== undefined) updateData.is_active = Boolean(updateData.is_active);

        const doctor = await Doctor.findOneAndUpdate(
            { _id: id, hospital: hospital._id },
            updateData,
            { new: true }
        );

        if (!doctor) {
            res.status(404).json({ message: 'Doctor or Specialty Group not found' });
            return;
        }

        res.json(doctor);
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating doctor', error: error.message });
    }
};

// @desc    Bulk Generate Slots
// @route   POST /api/hospital/slots/generate
export const bulkGenerateSlots = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;

        // Verify active 30-day subscription
        const sub = computeSubscriptionStatus(hospital);
        if (!sub.isValid || !sub.canGenerateSlots) {
            res.status(403).json({
                code: 'SUBSCRIPTION_REQUIRED',
                status: sub.status,
                daysRemaining: sub.daysRemaining,
                message: 'Your Pillora subscription has expired or your payment is pending. Please contact the Pillora Admin to renew your subscription before generating new appointment slots.'
            });
            return;
        }

        const { doctorId, date, startTime, endTime, duration } = req.body; // duration in minutes

        if (!doctorId || !date || !startTime || !endTime || !duration) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }

        const start = new Date(`${date}T${startTime}:00+05:30`);
        const end = new Date(`${date}T${endTime}:00+05:30`);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            res.status(400).json({ message: 'Invalid date or time format' });
            return;
        }

        const durationMinutes = parseInt(duration.toString(), 10);
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
            res.status(400).json({ message: 'Invalid slot duration' });
            return;
        }

        // The doctor must belong to this hospital
        const doctorDoc = await Doctor.findOne({ _id: doctorId, hospital: hospital._id });
        if (!doctorDoc) {
            res.status(404).json({ message: 'Doctor not found for this hospital' });
            return;
        }

        // Slots cannot be opened beyond the paid subscription period
        if (sub.subscriptionExpiryDate && end > sub.subscriptionExpiryDate) {
            res.status(403).json({
                code: 'SUBSCRIPTION_REQUIRED',
                message: `Your subscription ends on ${formatDateIST(sub.subscriptionExpiryDate)}. Slots can only be created up to that date — please renew to open later dates.`
            });
            return;
        }

        // Check for existing slots for this doctor in the time range to prevent duplicate slots
        const existingSlots = await Slot.countDocuments({
            doctor: doctorDoc._id,
            status: { $ne: 'cancelled' },
            startTime: { $lt: end },
            endTime: { $gt: start }
        });

        if (existingSlots > 0) {
            res.status(400).json({ message: 'Slots have already been generated for this doctor within this time range.' });
            return;
        }

        const maxAppts = doctorDoc.maxAppointmentsPerSlot || 1;

        const slots = [];
        let current = new Date(start);

        while (current < end) {
            const next = new Date(current.getTime() + durationMinutes * 60000);
            if (next > end) break;

            slots.push({
                doctor: doctorId,
                hospital: hospital._id,
                startTime: new Date(current),
                endTime: new Date(next),
                status: 'available',
                max_appointments: maxAppts,
                booked_count: 0,
                hold_count: 0
            });

            current = next;
        }

        if (slots.length > 0) {
            await Slot.insertMany(slots);
            
            // Emit socket event for real-time update
            const io = req.app.get('io');
            if (io) {
                io.emit('slotsUpdated', { doctorId, date });
            }
        }

        res.status(201).json({ message: `Successfully generated ${slots.length} slots`, count: slots.length });
    } catch (error: any) {
        res.status(500).json({ message: 'Error generating slots', error: error.message });
    }
};

// @desc    Get appointments for hospital
// @route   GET /api/hospital/appointments
export const getHospitalAppointments = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const appointments = await Appointment.find({ hospital: hospital._id })
            .populate('patient', 'name email phone')
            .populate('doctor', 'name specialty fee')
            .populate('slot', 'startTime endTime')
            .sort({ slotTime: 1 });
        
        const appointmentIds = appointments.map(app => app._id);
        const payments = await Payment.find({ appointmentId: { $in: appointmentIds } });

        const appointmentsWithPayments = appointments.map(app => {
            const payment = payments.find(p => p.appointmentId.toString() === app._id.toString());
            return {
                ...app.toObject(),
                paymentDetails: payment ? { amount: payment.amount, mode: payment.mode } : null
            };
        });

        res.json(appointmentsWithPayments);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching appointments', error: error.message });
    }
};

// @desc    Update Appointment Status
// @route   PUT /api/hospital/appointments/:id/status
export const updateAppointmentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { status, reason } = req.body || {};

        const ALLOWED = ['pending', 'confirmed', 'checked-in', 'in-consultation', 'completed', 'cancelled'];
        if (!ALLOWED.includes(status)) {
            res.status(400).json({ message: `Invalid status. Allowed values: ${ALLOWED.join(', ')}` });
            return;
        }

        const appointment: any = await Appointment.findOne({ _id: req.params.id, hospital: hospital._id });
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }
        const priorStatus = appointment.status;
        if (priorStatus === status) {
            res.json(appointment);
            return;
        }

        // Cancelling goes through the shared logic: frees the slot seat and refunds a paid online advance.
        if (status === 'cancelled') {
            const result = await cancelAppointmentWithPolicy(appointment._id, 'hospital', typeof reason === 'string' ? reason.slice(0, 500) : undefined);
            if (!result.ok) {
                res.status(result.status || 400).json({ message: result.message });
                return;
            }
            const io = req.app.get('io');
            if (io) io.emit('slotsUpdated', { doctorId: appointment.doctor });
            res.json(result.appointment);
            return;
        }

        if (status === 'pending' && priorStatus !== 'pending') {
            res.status(400).json({ message: 'An appointment cannot be moved back to pending.' });
            return;
        }

        // A booking that did not occupy a seat yet (unpaid online hold, or reopened after cancelling) takes one now,
        // with the same atomic capacity check as every other booking.
        if (priorStatus === 'pending' || priorStatus === 'cancelled') {
            const doctor: any = await Doctor.findById(appointment.doctor).select('maxAppointmentsPerSlot').lean();
            const seat = await claimSeat(appointment.slot, {
                holderUserId: appointment.patient,
                fallbackCap: doctor?.maxAppointmentsPerSlot || 1,
                appointmentId: appointment._id
            });
            if (!seat) {
                res.status(409).json({ code: 'SLOT_FULL', message: 'This slot is already full (or cancelled), so the appointment cannot be confirmed.' });
                return;
            }
            appointment.slotSeatHeld = true;
        }

        appointment.status = status;
        await appointment.save();

        res.json(appointment);
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating appointment', error: error.message });
    }
};

// @desc    Get slots for a doctor on a specific date
// @route   GET /api/hospital/dashboard/doctors/:id/slots
export const getDoctorSlots = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { date } = req.query;

        if (!date) {
            res.status(400).json({ message: 'Date is required' });
            return;
        }

        const startOfDay = new Date(`${date}T00:00:00+05:30`);
        const endOfDay = new Date(`${date}T23:59:59.999+05:30`);

        const slots = await Slot.find({
            doctor: id,
            startTime: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ startTime: 1 }).lean();

        // status/hold_count as of now (expired checkout holds no longer count); holder ids removed
        const now = new Date();
        res.json(slots.map((slot) => liveSlotView(slot, now)));
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching slots', error: error.message });
    }
};

// @desc    Create a pending online appointment for a slot (patient), to be paid at /checkout
// @route   POST /api/hospital/dashboard/appointments
// Hospital, doctor and time are taken from the slot (body values are ignored). The seat itself is
// taken atomically when the advance payment is verified (paymentController.verifyPayment); until
// then the patient's checkout hold reserves it, so abandoned checkouts never leave the slot full.
export const createAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    const { slotId, patientName, patientPhone, patientEmail, patientAge } = req.body || {};
    const patientId = req.user?.id || req.user?._id;

    if (!patientId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
    }

    if (!slotId || !mongoose.Types.ObjectId.isValid(String(slotId))) {
        res.status(400).json({ message: 'Missing required booking fields' });
        return;
    }

    try {
        const slot: any = await Slot.findById(slotId);
        if (!slot) {
            res.status(404).json({ code: 'NOT_FOUND', message: 'Slot not found. Please choose another.' });
            return;
        }

        const existingActiveBooking = await Appointment.findOne({
            patient: patientId,
            slot: slot._id,
            status: { $nin: ['cancelled', 'pending'] }
        });
        if (existingActiveBooking) {
            res.status(400).json({ code: 'ALREADY_BOOKED', message: 'You already have an appointment for this slot.' });
            return;
        }

        const doctor: any = await Doctor.findOne({ _id: slot.doctor, hospital: slot.hospital });
        if (!doctor) {
            res.status(404).json({ code: 'NOT_FOUND', message: 'Doctor not found for this slot.' });
            return;
        }

        // Reserve (or refresh) the patient's hold — atomic capacity check
        const io = req.app.get('io');
        const hold = await createHold(slot._id.toString(), patientId.toString(), io);
        if (!hold.success) {
            const r = holdFailureResponse((hold.reason || 'UNAVAILABLE') as HoldFailure);
            res.status(r.status).json({ code: r.code, message: r.message });
            return;
        }

        let appointment: any = await Appointment.findOne({ patient: patientId, slot: slot._id, status: 'pending' });
        if (!appointment) {
            const activeAppointmentsCount = await Appointment.countDocuments({ slot: slot._id, status: { $ne: 'cancelled' } });
            appointment = new Appointment({
                patient: patientId,
                doctor: slot.doctor,
                hospital: slot.hospital,
                slot: slot._id,
                slotTime: slot.startTime,
                status: 'pending',
                paymentStatus: 'unpaid',
                paymentSource: 'gateway',
                bookingSource: 'online',
                tokenNumber: activeAppointmentsCount + 1,
                doctorName: `Dr. ${doctor.name}`,
                consultationFee: doctor.fee || 500
            });
        }
        if (typeof patientName === 'string' && patientName.trim()) appointment.patientName = patientName.trim().slice(0, 100);
        if (typeof patientPhone === 'string' && patientPhone.trim()) appointment.patientPhone = patientPhone.trim().slice(0, 20);
        if (typeof patientEmail === 'string' && patientEmail.trim()) appointment.patientEmail = patientEmail.trim().slice(0, 200);
        if (Number(patientAge) > 0) appointment.patientAge = Number(patientAge);
        await appointment.save();

        res.status(201).json({
            success: true,
            message: 'Appointment booking initiated. Please proceed to payment.',
            appointment: appointment.toObject()
        });
    } catch (error: any) {
        console.error('[BookingError]', error.message);
        res.status(500).json({ code: 'SERVER_ERROR', message: 'An unexpected booking error occurred. Please try again.' });
    }
};


// @desc    Get current user's (patient's) bookings
// @route   GET /api/hospital/dashboard/appointments/my-bookings
export const getMyBookings = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const patientId = req.user?.id || req.user?._id;
        if (!patientId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }

        const appointments = await Appointment.find({ patient: patientId })
            .populate('doctor', 'name specialty specialization')
            .populate('hospital', 'name address city')
            .populate('slot', 'startTime endTime')
            .sort({ slotTime: -1 });

        res.json(appointments);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching patient bookings', error: error.message });
    }
};

// ─── Slot Management Controllers ───────────────────────────────────────────────

// @desc    Get all slots for the authenticated hospital
// @route   GET /api/hospital/dashboard/slots
export const getHospitalSlots = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const slots = await Slot.find({ hospital: hospital._id })
            .populate('doctor', 'name specialty isSpecialtyGroup department')
            .sort({ startTime: 1 });

        // Query active appointments to count booking occurrences per slot
        const appointments = await Appointment.find({ hospital: hospital._id, status: { $ne: 'cancelled' } });
        
        const now = new Date();
        const slotsWithCount = slots.map(slot => {
            const bookingCount = appointments.filter(app => app.slot.toString() === slot._id.toString()).length;
            return {
                ...liveSlotView(slot, now),
                bookingCount
            };
        });

        res.json(slotsWithCount);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching hospital slots', error: error.message });
    }
};

// @desc    Add individual or recurrent slot(s) for a doctor/specialty group
// @route   POST /api/hospital/dashboard/slots/add
export const addSingleSlot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;

        // Verify active 30-day subscription
        const sub = computeSubscriptionStatus(hospital);
        if (!sub.isValid || !sub.canGenerateSlots) {
            res.status(403).json({
                code: 'SUBSCRIPTION_REQUIRED',
                status: sub.status,
                daysRemaining: sub.daysRemaining,
                message: 'Your Pillora subscription has expired or your payment is pending. Please contact the Pillora Admin to renew your subscription before generating new appointment slots.'
            });
            return;
        }

        const { doctorId, date, startTime, endTime, recurrence } = req.body;

        if (!doctorId || !date || !startTime || !endTime) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }

        const now = new Date();

        // Helper to generate target dates based on recurrence pattern
        const generateDates = (baseDateStr: string, recPattern: any): Date[] => {
            const datesList: Date[] = [new Date(baseDateStr)];
            if (!recPattern || recPattern.type === 'none') {
                return datesList;
            }

            const startDate = new Date(baseDateStr);
            const endDate = recPattern.until ? new Date(recPattern.until) : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

            if (endDate < startDate) return datesList;

            const current = new Date(startDate);
            current.setDate(current.getDate() + 1); // Move past baseDate

            while (current <= endDate) {
                if (recPattern.type === 'daily') {
                    datesList.push(new Date(current));
                } else if (recPattern.type === 'weekly') {
                    const dayOfWeek = current.toLocaleDateString('en-US', { weekday: 'long' });
                    if (recPattern.days && recPattern.days.includes(dayOfWeek)) {
                        datesList.push(new Date(current));
                    }
                }
                current.setDate(current.getDate() + 1);
            }
            return datesList;
        };

        // The doctor must belong to this hospital
        const doctorDoc = await Doctor.findOne({ _id: doctorId, hospital: hospital._id });
        if (!doctorDoc) {
            res.status(404).json({ message: 'Doctor not found for this hospital' });
            return;
        }
        const maxAppts = doctorDoc.maxAppointmentsPerSlot || 1;

        const targetDates = generateDates(date, recurrence);
        const slotsToInsert = [];
        let skippedAfterExpiry = 0;

        for (const targetDate of targetDates) {
            const dateStr = targetDate.toISOString().split('T')[0];
            const start = new Date(`${dateStr}T${startTime}:00+05:30`);
            const end = new Date(`${dateStr}T${endTime}:00+05:30`);

            // Past date/time validation
            if (start < now) {
                if (targetDates.length === 1) {
                    res.status(400).json({ message: 'Cannot create a slot for a past date or past time on today\'s date' });
                    return;
                }
                continue; // Skip past dates silently in batch recurrences
            }

            // Slots cannot be opened beyond the paid subscription period
            if (sub.subscriptionExpiryDate && end > sub.subscriptionExpiryDate) {
                if (targetDates.length === 1) {
                    res.status(403).json({
                        code: 'SUBSCRIPTION_REQUIRED',
                        message: `Your subscription ends on ${formatDateIST(sub.subscriptionExpiryDate)}. Slots can only be created up to that date — please renew to open later dates.`
                    });
                    return;
                }
                skippedAfterExpiry++;
                continue;
            }

            // Check overlap
            const overlap = await Slot.findOne({
                doctor: doctorId,
                status: { $ne: 'cancelled' },
                startTime: { $lt: end },
                endTime: { $gt: start }
            }).populate('doctor', 'name');

            if (overlap) {
                const overlapStartStr = new Date(overlap.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const overlapEndStr = new Date(overlap.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                res.status(400).json({ 
                    message: `Conflict warning: An overlapping slot already exists on ${dateStr} from ${overlapStartStr} to ${overlapEndStr} for ${(overlap.doctor as any).name || 'this specialty'}.` 
                });
                return;
            }

            slotsToInsert.push({
                doctor: doctorId,
                hospital: hospital._id,
                startTime: start,
                endTime: end,
                status: 'available',
                max_appointments: maxAppts,
                booked_count: 0,
                hold_count: 0
            });
        }

        if (slotsToInsert.length > 0) {
            await Slot.insertMany(slotsToInsert);

            // Emit socket update event for first date in slots
            const io = req.app.get('io');
            if (io) {
                io.emit('slotsUpdated', { doctorId, date });
            }
        }

        res.status(201).json({
            message: `Successfully created ${slotsToInsert.length} slots${skippedAfterExpiry ? ` (${skippedAfterExpiry} dates after your subscription end were skipped)` : ''}`,
            count: slotsToInsert.length
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error creating slot', error: error.message });
    }
};

// @desc    Cancel a specific slot with booking cancellations
// @route   POST /api/hospital/dashboard/slots/:id/cancel
export const cancelSlot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;
        const { reason } = req.body;

        const slot = await Slot.findOne({ _id: id, hospital: hospital._id });
        if (!slot) {
            res.status(404).json({ message: 'Slot not found' });
            return;
        }

        const now = new Date();

        // Restriction check: Cannot cancel a slot in history
        if (slot.endTime < now) {
            res.status(400).json({ message: 'Cannot cancel a slot that has already passed' });
            return;
        }

        // Restriction check: Cannot cancel slot currently in progress
        if (slot.startTime < now && slot.endTime > now) {
            res.status(400).json({ message: 'Cannot cancel a slot that is currently in progress' });
            return;
        }

        // Mark slot as cancelled and store metadata
        slot.status = 'cancelled';
        slot.cancelledAt = now;
        slot.cancellationReason = reason || 'Doctor unavailable';
        slot.cancelledBy = (req.user?._id || req.user?.id) as any;
        await slot.save();

        // Cancel affected bookings and refund online advances (hospital initiated).
        // A failed Razorpay refund is NOT recorded as refunded: the payment stays 'completed' with
        // settlement 'Under Review' and the booking keeps paymentStatus 'partial', so it appears in the
        // admin refund queue. The failures are returned to the caller.
        const affectedAppointments: any[] = await Appointment.find({ slot: slot._id, status: { $ne: 'cancelled' } });
        const refundFailures: { appointmentId: string; patientName?: string; error: string }[] = [];
        let refundedCount = 0;
        const cancelReason = reason || 'Slot cancelled by hospital (doctor unavailable)';

        for (const app of affectedAppointments) {
            const payment: any = await Payment.findOne({
                appointmentId: app._id,
                paymentSource: 'pillora_online',
                status: { $in: ['completed', 'paid', 'pending'] }
            }).sort({ createdAt: -1 });

            if (payment && (payment.status === 'completed' || payment.status === 'paid')) {
                const refund = await refundRazorpayPayment(payment, Number(payment.amount) || 0, {
                    reason: cancelReason,
                    appointmentId: app._id.toString()
                });
                if (refund.ok) {
                    applyRefundToRecords(payment, app, refund, cancelReason);
                    refundedCount++;
                } else {
                    console.error(`[SlotCancelRefundError] Failed to refund appointment ${app._id}:`, refund.error);
                    payment.settlementStatus = 'Under Review';
                    payment.notes = `${payment.notes ? payment.notes + '\n' : ''}Refund failed on slot cancel: ${refund.error}`;
                    refundFailures.push({ appointmentId: app._id.toString(), patientName: app.patientName, error: refund.error || 'Refund failed' });
                }
                await payment.save();
            } else if (payment && payment.status === 'pending') {
                payment.status = 'failed';
                payment.settlementStatus = 'not_applicable';
                await payment.save();
            }

            app.status = 'cancelled';
            app.notes = app.notes ? `${app.notes}\nCancellation reason: ${cancelReason}` : `Cancellation reason: ${cancelReason}`;
            if (refundFailures.some((f) => f.appointmentId === app._id.toString())) {
                app.notes += '\nRefund of the online advance FAILED — Pillora admin must refund manually.';
            }
            await app.save();
            // Mark the seat released on the appointment (the slot itself is cancelled, so its counts no longer matter)
            await Appointment.updateOne({ _id: app._id }, { $set: { slotSeatHeld: false } });
        }

        // Emit socket update for real-time lists
        const io = req.app.get('io');
        if (io) {
            io.emit('slotsUpdated', { 
                doctorId: slot.doctor, 
                date: new Date(slot.startTime).toISOString().split('T')[0] 
            });
        }

        res.status(refundFailures.length ? 207 : 200).json({
            message: refundFailures.length
                ? `Slot cancelled. ${refundFailures.length} online refund(s) FAILED and need a manual refund by Pillora admin.`
                : 'Slot and all associated bookings cancelled successfully.',
            cancelledAppointments: affectedAppointments.length,
            refunded: refundedCount,
            refundFailures
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error cancelling slot', error: error.message });
    }
};

// @desc    Delete a specific slot completely
// @route   DELETE /api/hospital/dashboard/slots/:id
export const deleteSlot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;

        const slot = await Slot.findOne({ _id: id, hospital: hospital._id });
        if (!slot) {
            res.status(404).json({ message: 'Slot not found' });
            return;
        }

        // Never hard-delete real bookings or anything with money attached (H4).
        const slotAppointments: any[] = await Appointment.find({ slot: slot._id }).select('_id status');
        const appointmentIds = slotAppointments.map((a) => a._id);
        const hasMoney = appointmentIds.length > 0 && await Payment.exists({
            appointmentId: { $in: appointmentIds },
            status: { $nin: ['pending', 'failed'] }
        });
        const hasActiveBooking = slotAppointments.some((a) => a.status !== 'cancelled' && a.status !== 'pending');
        if (hasMoney || hasActiveBooking) {
            res.status(409).json({
                message: 'This slot has bookings or payments and cannot be deleted. Use "Cancel slot" instead — it cancels the bookings and refunds online advances.'
            });
            return;
        }

        // Only unpaid abandoned holds / cancelled unpaid bookings remain: remove them with the slot (previous behaviour)
        if (appointmentIds.length > 0) {
            await Payment.deleteMany({ appointmentId: { $in: appointmentIds }, status: { $in: ['pending', 'failed'] } });
            await Appointment.deleteMany({ _id: { $in: appointmentIds } });
        }

        // Delete the slot document itself
        await Slot.deleteOne({ _id: slot._id });

        // Emit socket update for real-time lists
        const io = req.app.get('io');
        if (io) {
            io.emit('slotsUpdated', { 
                doctorId: slot.doctor, 
                date: new Date(slot.startTime).toISOString().split('T')[0] 
            });
        }

        res.json({ message: 'Slot deleted successfully.' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error deleting slot', error: error.message });
    }
};

// @desc    Create temporary hold on a slot
// @route   POST /api/hospital/dashboard/slots/hold
export const holdSlot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { slotId } = req.body;
        const patientId = req.user?.id || req.user?._id;

        if (!patientId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }

        if (!slotId) {
            res.status(400).json({ message: 'Slot ID is required' });
            return;
        }

        // Check if already booked (an unpaid pending checkout of the same patient does not count)
        const existingActiveBooking = await Appointment.findOne({
            patient: patientId,
            slot: slotId,
            status: { $nin: ['cancelled', 'pending'] }
        });

        if (existingActiveBooking) {
            res.status(400).json({
                code: 'ALREADY_BOOKED',
                message: 'You already have an appointment for this slot.'
            });
            return;
        }

        const io = req.app.get('io');
        const holdResult = await createHold(slotId, patientId.toString(), io);

        if (!holdResult.success) {
            const r = holdFailureResponse((holdResult.reason || 'UNAVAILABLE') as HoldFailure);
            res.status(r.status).json({ code: r.code, message: r.message });
            return;
        }

        res.json({
            success: true,
            message: holdResult.message,
            expiryMs: holdResult.expiryMs
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error holding slot', error: error.message });
    }
};

// @desc    Release temporary hold on a slot
// @route   POST /api/hospital/dashboard/slots/release-hold
export const releaseSlotHold = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { slotId } = req.body;
        const patientId = req.user?.id || req.user?._id;

        if (!patientId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }

        if (!slotId) {
            res.status(400).json({ message: 'Slot ID is required' });
            return;
        }

        const io = req.app.get('io');
        const released = await releaseHold(slotId, patientId.toString(), io);

        res.json({
            success: true,
            released
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error releasing slot hold', error: error.message });
    }
};

// @desc    Create manual appointment by hospital admin
// @route   POST /api/hospital/appointments/manual
// @access  Private/Hospital
export const createManualAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { patientName, patientEmail, patientPhone, doctorId, slotId, notes } = req.body;
        // Only roles with payments access may mark a walk-in as paid; others book it as pending
        const paymentStatus = hasHospitalPermission((req as any).staffRole || 'owner', 'payments') ? req.body.paymentStatus : undefined;

        if (!patientName || !patientEmail || !doctorId || !slotId || !mongoose.Types.ObjectId.isValid(String(slotId)) || !mongoose.Types.ObjectId.isValid(String(doctorId))) {
            res.status(400).json({ message: 'Missing required manual booking fields' });
            return;
        }

        // Slot and doctor must belong to the caller's own hospital (H3)
        const ownSlot: any = await Slot.findOne({ _id: slotId, hospital: hospital._id }).select('doctor startTime status');
        const ownDoctor: any = await Doctor.findOne({ _id: doctorId, hospital: hospital._id }).select('_id');
        if (!ownSlot || !ownDoctor || String(ownSlot.doctor) !== String(ownDoctor._id)) {
            res.status(404).json({ code: 'NOT_FOUND', message: 'Slot not found for this doctor at your hospital.' });
            return;
        }
        // Appointment time always comes from the slot
        const slotTime = ownSlot.startTime;

        // 1. Find or create the patient
        let patient = await User.findOne({ email: patientEmail.toLowerCase().trim() });
        if (!patient) {
            patient = await User.create({
                name: patientName,
                email: patientEmail.toLowerCase().trim(),
                phone: patientPhone || '',
                role: 'customer',
                status: 'approved',
                agreedToTerms: true
            });
        } else if (patientPhone && !patient.phone) {
            // Update phone if not previously set
            patient.phone = patientPhone;
            await patient.save();
        }

        const patientId = patient._id;

        // 2. Start Transaction to prevent double booking
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const slot: any = await Slot.findOne({ _id: slotId, hospital: hospital._id }).session(session);
            if (!slot) {
                throw new Error('SLOT_NOT_FOUND');
            }

            if (slot.status === 'cancelled') {
                throw new Error('SLOT_CANCELLED');
            }

            const doctor = await Doctor.findOne({ _id: doctorId, hospital: hospital._id }).session(session);
            const maxAppts = slotCapacity(slot, doctor);

            // Take the seat first — atomic capacity check (patients' unexpired checkout holds count too)
            const updatedSlot = await claimSeat(slotId, { fallbackCap: maxAppts, session });
            if (!updatedSlot) {
                throw new Error('SLOT_FULL');
            }

            // Generate Token Number
            const activeAppointmentsCount = await Appointment.countDocuments({
                slot: slotId,
                status: { $ne: 'cancelled' }
            }).session(session);

            const tokenNumber = activeAppointmentsCount + 1;

            const docFee = doctor?.fee || 500;
            const isPaid = paymentStatus === 'paid';
            const method = req.body.paymentMethod || 'cash';

            const appointment = new Appointment({
                patient: patientId,
                doctor: doctorId,
                hospital: hospital._id,
                slot: slotId,
                slotTime: new Date(slotTime),
                status: 'confirmed',
                consultationFee: docFee,
                advanceRequired: 0,
                advancePaid: 0,
                balancePaid: isPaid ? docFee : 0,
                balanceDue: isPaid ? 0 : docFee,
                paymentStatus: isPaid ? 'paid' : 'unpaid',
                paymentSource: 'manual',
                bookingSource: 'walk_in',
                slotSeatHeld: true,
                notes: notes || '',
                tokenNumber
            });

            await appointment.save({ session });

            if (isPaid) {
                const payment = new Payment({
                    appointmentId: appointment._id,
                    hospitalId: hospital._id,
                    userId: patientId,
                    patientName,
                    amount: docFee,
                    amountInPaise: docFee * 100,
                    consultationFee: docFee,
                    paymentType: 'full',
                    paymentSource: 'clinic_collection',
                    paymentMethod: method,
                    mode: method === 'cash' ? 'offline' : 'online',
                    status: 'completed',
                    settlementStatus: 'not_applicable',
                    recordedBy: req.user!._id,
                    notes: `Walk-in payment recorded via ${method.toUpperCase()}`
                });
                await payment.save({ session });
            }

            await Slot.updateOne({ _id: slotId }, { $set: { appointment: appointment._id } }, { session });

            await session.commitTransaction();
            session.endSession();

            // Emit real-time socket updates for availability
            const io = req.app.get('io');
            if (io) {
                io.emit('slotBooked', {
                    slotId,
                    doctorId,
                    date: new Date(slotTime).toISOString().split('T')[0],
                    bookedCount: updatedSlot.booked_count,
                    maxAppointments: maxAppts
                });
                io.emit('appointmentsUpdated', { hospitalId: hospital._id });
            }

            const targetPhone = patient.phone || patient.phoneNumber;
            if (targetPhone) {
                try {
                    const patName = patient.name || 'Patient';
                    const docName = (doctor as any)?.name ? `Dr. ${(doctor as any).name}` : 'Doctor';
                    const hospName = hospital.name || 'Pillora Hospital';

                    const d = new Date(slotTime);
                    const formattedApptDate = !isNaN(d.getTime())
                        ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
                        : '28 Aug 2026';

                    const formattedApptTime = !isNaN(d.getTime())
                        ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
                        : '4:00 PM';

                    console.log(`[WhatsApp Service] 🚀 Dispatching manual appointment_confirmation template to ${targetPhone}...`);
                    const waResult = await sendCountedTemplate(
                        { hospitalId: hospital._id, kind: 'confirmation' },
                        targetPhone,
                        'appointment_confirmation',
                        'en',
                        [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: patName },
                                    { type: 'text', text: docName },
                                    { type: 'text', text: hospName },
                                    { type: 'text', text: formattedApptDate },
                                    { type: 'text', text: formattedApptTime }
                                ]
                            }
                        ]
                    );

                    if (!waResult.success) {
                        console.error('[WhatsApp Service] ❌ Failed to deliver manual appointment_confirmation WhatsApp message:', waResult.error);
                    } else {
                        console.log(`[WhatsApp Service] ✅ Manual appointment_confirmation WhatsApp template delivered successfully to ${targetPhone}`);
                    }
                } catch (waErr: any) {
                    console.error('[WhatsApp Service] ❌ Walking appointment WhatsApp failed (non-critical):', waErr.message || waErr);
                }
            }

            if (patient.email) {
                try {
                    const hospitalNameStr = hospital.name || 'Pillora Hospital';
                    // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
                    const dateStr = formatDateIST(slotTime);
                    const timeSlotStr = formatTimeIST(slotTime);

                    await sendBookingConfirmationEmail({
                        toEmail: patient.email,
                        patientName: patient.name,
                        hospitalName: hospitalNameStr,
                        date: dateStr,
                        timeSlot: timeSlotStr,
                        bookingId: appointment._id.toString()
                    });
                    console.log('Walking appointment confirmation email sent to', patient.email);
                } catch (emailError: any) {
                    console.error('Walking appointment email failed (non-critical):', emailError.message);
                }
            }

            res.status(201).json({
                success: true,
                message: 'Manual appointment booked successfully',
                appointment: {
                    ...appointment.toObject(),
                    patient: {
                        name: patient.name,
                        email: patient.email,
                        phone: patient.phone
                    },
                    tokenNumber
                }
            });

        } catch (error: any) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }

    } catch (error: any) {
        console.error('[ManualBookingError]', error.message);
        if (error.message === 'SLOT_FULL') {
            res.status(400).json({ code: 'SLOT_FULL', message: 'Sorry, this slot is fully booked.' });
        } else if (error.message === 'SLOT_CANCELLED') {
            res.status(400).json({ code: 'SLOT_CANCELLED', message: 'This slot has been cancelled.' });
        } else if (error.message === 'SLOT_NOT_FOUND') {
            res.status(404).json({ code: 'NOT_FOUND', message: 'Slot not found.' });
        } else {
            res.status(500).json({ code: 'SERVER_ERROR', message: 'An unexpected booking error occurred.', error: error.message });
        }
    }
};

// @desc    Delete doctor or specialty group (Self-Managed only)
// @route   DELETE /api/hospital/doctors/:id
export const deleteDoctor = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;

        const doctor = await Doctor.findOne({ _id: id, hospital: hospital._id });
        if (!doctor) {
            res.status(404).json({ message: 'Doctor or Specialty Group not found' });
            return;
        }

        // Never hard-delete real bookings or payment history (H4). Doctors with history are deactivated instead.
        const doctorAppointments: any[] = await Appointment.find({ doctor: doctor._id }).select('_id status');
        const appointmentIds = doctorAppointments.map((a) => a._id);
        const hasMoney = appointmentIds.length > 0 && await Payment.exists({
            appointmentId: { $in: appointmentIds },
            status: { $nin: ['pending', 'failed'] }
        });
        const hasBookings = doctorAppointments.some((a) => a.status !== 'cancelled' && a.status !== 'pending');
        if (hasMoney || hasBookings) {
            res.status(409).json({
                message: 'This doctor has appointments or payments on record, so it cannot be deleted. Deactivate the doctor instead (records are kept), and cancel any upcoming slots to refund patients.'
            });
            return;
        }

        // Only unpaid abandoned holds / cancelled unpaid bookings remain: remove them (previous behaviour)
        if (appointmentIds.length > 0) {
            await Payment.deleteMany({ appointmentId: { $in: appointmentIds }, status: { $in: ['pending', 'failed'] } });
            await Appointment.deleteMany({ _id: { $in: appointmentIds } });
        }

        // Delete associated slots
        await Slot.deleteMany({ doctor: doctor._id });

        // Delete doctor document itself
        await Doctor.deleteOne({ _id: doctor._id });

        // Emit socket update for real-time list refreshing
        const io = req.app.get('io');
        if (io) {
            io.emit('doctorsUpdated', { hospitalId: hospital._id });
        }

        res.json({ message: 'Doctor and all associated slots/appointments deleted successfully.' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error deleting doctor', error: error.message });
    }
};

// @desc    Get booking hours analytics for the current week
// @route   GET /api/hospital/dashboard/analytics/booking-hours
export const getBookingHoursAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
        endOfWeek.setHours(23, 59, 59, 999);

        const appointments = await Appointment.find({
            hospital: hospital._id,
            slotTime: { $gte: startOfWeek, $lte: endOfWeek }
        });

        const hourCounts: { [key: string]: number } = {};
        appointments.forEach(app => {
            const hour = new Date(app.slotTime).getHours();
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const formattedHour = `${hour % 12 || 12}${ampm}`;
            hourCounts[formattedHour] = (hourCounts[formattedHour] || 0) + 1;
        });

        // Format as array
        const result = Object.keys(hourCounts).map(hour => ({
            hour,
            count: hourCounts[hour]
        }));

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching booking hours analytics', error: error.message });
    }
};

// @desc    Get cancellation rate for the current month
// @route   GET /api/hospital/dashboard/analytics/cancellation-rate
export const getCancellationRate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const totalAppointments = await Appointment.countDocuments({
            hospital: hospital._id,
            slotTime: { $gte: startOfMonth, $lte: endOfMonth }
        });

        const cancelledAppointments = await Appointment.countDocuments({
            hospital: hospital._id,
            slotTime: { $gte: startOfMonth, $lte: endOfMonth },
            status: 'cancelled'
        });

        const rate = totalAppointments > 0 ? ((cancelledAppointments / totalAppointments) * 100).toFixed(1) : 0;

        res.json({
            total: totalAppointments,
            cancelled: cancelledAppointments,
            rate: Number(rate)
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching cancellation rate', error: error.message });
    }
};

// @desc    Assign doctor to appointment
// @route   PUT /api/hospital/dashboard/appointments/:id/assign-doctor
export const assignDoctorToAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;
        const { doctorId } = req.body;

        if (!doctorId) {
            res.status(400).json({ message: 'doctorId is required' });
            return;
        }

        const doctor = await Doctor.findOne({ _id: doctorId, hospital: hospital._id });
        if (!doctor) {
            res.status(404).json({ message: 'Doctor not found in this hospital' });
            return;
        }

        const appointment = await Appointment.findOneAndUpdate(
            { _id: id, hospital: hospital._id },
            { doctor: doctor._id },
            { new: true }
        ).populate('doctor', 'name specialty');

        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        res.json({ message: 'Doctor assigned successfully', appointment });
    } catch (error: any) {
        res.status(500).json({ message: 'Error assigning doctor', error: error.message });
    }
};

// @desc    Get notes for a specific patient
// @route   GET /api/hospital/dashboard/patients/:patientId/notes
export const getPatientNotes = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { patientId } = req.params;

        const notes = await PatientNote.find({ patient: patientId, hospital: hospital._id })
            .populate('doctor', 'name specialty')
            .sort({ createdAt: -1 });

        res.json(notes);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching patient notes', error: error.message });
    }
};

// @desc    Add a note for a patient
// @route   POST /api/hospital/dashboard/patients/:patientId/notes
export const addPatientNote = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { patientId } = req.params;
        const { note, doctorId } = req.body;

        if (!note) {
            res.status(400).json({ message: 'Note content is required' });
            return;
        }

        const patientNote = await PatientNote.create({
            patient: patientId,
            hospital: hospital._id,
            doctor: doctorId || undefined,
            note
        });

        const populatedNote = await PatientNote.findById(patientNote._id).populate('doctor', 'name specialty');

        res.status(201).json(populatedNote);
    } catch (error: any) {
        res.status(500).json({ message: 'Error adding patient note', error: error.message });
    }
};

// @desc    Upload Prescription URL
// @route   PUT /api/hospital/dashboard/appointments/:id/prescription
export const updateAppointmentPrescription = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;
        const { prescriptionUrl } = req.body;

        const appointment = await Appointment.findOne({ _id: id, hospital: hospital._id });
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        appointment.prescriptionUrl = prescriptionUrl;
        await appointment.save();

        res.json(appointment);
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating prescription', error: error.message });
    }
};

// @desc    Generate and Send Invoice
// @route   POST /api/hospital/dashboard/appointments/:id/invoice
export const generateAndSendInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;
        const appointment = await Appointment.findOne({ _id: id, hospital: hospital._id }).populate('patient', 'name email phone');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        // Invoice amount is worked out on the server (client `amount` is ignored):
        // consultation fee from the appointment (or the doctor's fee), and what was really paid from Payment rows.
        const doctorForFee: any = await Doctor.findById(appointment.doctor).select('fee').lean();
        const fee = Number(appointment.consultationFee) > 0 ? Number(appointment.consultationFee) : Number(doctorForFee?.fee) || 0;
        if (!(fee > 0)) {
            res.status(400).json({ message: 'Consultation fee is not set for this appointment or doctor.' });
            return;
        }
        const paidRows = await Payment.find({ appointmentId: appointment._id, status: { $in: ['completed', 'paid'] } }).select('amount').lean();
        const paidSoFar = Math.round((paidRows as any[]).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100) / 100;
        const balance = Math.max(0, Math.round((fee - paidSoFar) * 100) / 100);
        const amount = fee;

        const patientName = appointment.patientName || (appointment.patient as any)?.name || 'Patient';
        const patientEmail = (appointment.patient as any)?.email;

        if (!patientEmail) {
            res.status(400).json({ message: 'Patient email not found for sending invoice. Cannot send email.' });
            return;
        }

        // Generate PDF
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];
        
        doc.on('data', buffers.push.bind(buffers));
        
        const invoiceName = `INV-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${appointment._id}`;

        // Header
        doc.fontSize(20).text(hospital.name, { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('INVOICE', { align: 'center', underline: true });
        doc.moveDown();

        // Invoice Details
        doc.fontSize(12);
        doc.text(`Invoice No: ${invoiceName}`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.text(`Patient: ${patientName}`);
        doc.moveDown();

        // Table Header
        doc.text('Description', 50, doc.y, { continued: true });
        doc.text('Amount', 400, doc.y, { align: 'right' });
        doc.moveDown(0.5);
        
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        // Table Row
        doc.text('Consultation Fee', 50, doc.y, { continued: true });
        doc.text(`Rs. ${amount}`, 400, doc.y, { align: 'right' });
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        // Total
        doc.fontSize(14).text('Total:', 50, doc.y, { continued: true });
        doc.text(`Rs. ${amount}`, 400, doc.y, { align: 'right' });
        doc.moveDown(0.5);
        doc.fontSize(12).text('Paid:', 50, doc.y, { continued: true });
        doc.text(`Rs. ${paidSoFar}`, 400, doc.y, { align: 'right' });
        doc.moveDown(0.5);
        doc.text('Balance due:', 50, doc.y, { continued: true });
        doc.text(`Rs. ${balance}`, 400, doc.y, { align: 'right' });

        doc.end();

        // Wait for PDF to finish
        const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            doc.on('end', () => {
                resolve(Buffer.concat(buffers));
            });
            doc.on('error', reject);
        });

        const base64File = pdfBuffer.toString('base64');
        const dataUri = `data:application/pdf;base64,${base64File}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataUri, {
            resource_type: 'raw',
            upload_preset: 'pillora-uploads',
            folder: 'pillora-invoices',
            access_mode: 'public',
            type: 'upload',
            public_id: invoiceName
        });

        console.log('Invoice URL:', result.secure_url);
        // Must contain /raw/upload/ not /image/upload/

        const invoiceUrl = result.secure_url;

        // Issuing an invoice does not change the payment status — only recorded payments do.
        appointment.invoiceUrl = invoiceUrl;
        await appointment.save();

        try {
            await sendInvoiceEmail({
                toEmail: patientEmail,
                patientName: patientName,
                hospitalName: hospital.name,
                invoiceUrl: invoiceUrl,
                // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
                date: formatDateIST(appointment.bookingDate),
                amount: Number(amount)
            });
        } catch (emailError: any) {
            console.error('Invoice email failed (non-critical):', emailError.message);
        }

        res.json(appointment);
    } catch (error: any) {
        res.status(500).json({ message: 'Error generating invoice', error: error.message });
    }
};

// @desc    Search patients by booking ID or name
// @route   GET /api/hospital/dashboard/patients/search
export const searchPatients = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { bookingId, name } = req.query;

        let query: any = { hospital: hospital._id };

        if (bookingId) {
            // Find booking by partial or exact ID (case-insensitive)
            const lowerQuery = (bookingId as string).toLowerCase().trim();
            
            // First try exact match if valid ObjectId
            let initialBooking;
            if (mongoose.Types.ObjectId.isValid(lowerQuery) && lowerQuery.length === 24) {
                initialBooking = await Appointment.findOne({ _id: lowerQuery, hospital: hospital._id }).populate('patient', 'name email phone');
            }
            
            // If not found, fetch recent and do partial match like autocomplete
            if (!initialBooking) {
                const recentAppts = await Appointment.find({ hospital: hospital._id })
                    .populate('patient', 'name email phone')
                    .sort({ createdAt: -1 })
                    .limit(500);
                initialBooking = recentAppts.find(a => a._id.toString().toLowerCase().includes(lowerQuery));
            }

            if (!initialBooking) {
                res.status(404).json({ message: 'No patient found with this booking ID' });
                return;
            }
            
            if (initialBooking.patient) {
                query.patient = (initialBooking.patient as any)._id;
            } else if (initialBooking.patientEmail) {
                query.patientEmail = initialBooking.patientEmail;
            } else {
                query.patientName = initialBooking.patientName;
            }
        } else if (name) {
            const searchName = String(name).trim().slice(0, 100);
            const regex = new RegExp(escapeRegex(searchName), 'i');
            
            // Find patients matching the name — only among this hospital's own patients
            const hospitalPatientIds = await Appointment.distinct('patient', { hospital: hospital._id });
            const matchingUsers = await User.find({ _id: { $in: hospitalPatientIds }, name: regex }).select('_id');
            
            // We want to match either the user account OR the name directly on the appointment
            query.$or = [
                { patientName: regex }
            ];
            
            if (matchingUsers.length > 0) {
                query.$or.push({ patient: { $in: matchingUsers.map(u => u._id) } });
            }
        } else {
            res.status(400).json({ message: 'Provide either bookingId or name to search' });
            return;
        }

        const appointments = await Appointment.find(query)
            .populate('patient', 'name email phone')
            .populate('doctor', 'name specialty fee')
            .sort({ bookingDate: -1 });

        if (!appointments.length) {
            res.status(404).json({ message: 'No matching appointments found' });
            return;
        }

        // Real money collected per appointment (online advance + clinic payments), refunded ones excluded
        const paidRows = await Payment.find({
            appointmentId: { $in: appointments.map((a) => a._id) },
            status: { $in: ['completed', 'paid'] }
        }).select('appointmentId amount').lean();
        const paidByAppointment = new Map<string, number>();
        for (const p of paidRows as any[]) {
            const key = String(p.appointmentId);
            paidByAppointment.set(key, (paidByAppointment.get(key) || 0) + (Number(p.amount) || 0));
        }

        // Group by patient
        const patientsMap = new Map();
        
        for (const appt of appointments) {
            const patientId = appt.patient?._id.toString();
            if (!patientId) continue;

            if (!patientsMap.has(patientId)) {
                patientsMap.set(patientId, {
                    patientInfo: {
                        _id: patientId,
                        name: appt.patientName || (appt.patient as any)?.name || 'Unknown',
                        email: appt.patientEmail || (appt.patient as any)?.email || '',
                        phone: appt.patientPhone || (appt.patient as any)?.phone || '',
                        totalVisits: 0,
                        firstVisit: appt.bookingDate,
                        lastVisit: appt.bookingDate,
                        totalSpent: 0
                    },
                    bookings: []
                });
            }

            const patientData = patientsMap.get(patientId);
            if (appt.status !== 'cancelled') patientData.patientInfo.totalVisits += 1;
            
            // Adjust dates
            if (new Date(appt.bookingDate) < new Date(patientData.patientInfo.firstVisit)) {
                patientData.patientInfo.firstVisit = appt.bookingDate;
            }
            if (new Date(appt.bookingDate) > new Date(patientData.patientInfo.lastVisit)) {
                patientData.patientInfo.lastVisit = appt.bookingDate;
            }

            patientData.patientInfo.totalSpent += paidByAppointment.get(appt._id.toString()) || 0;

            patientData.bookings.push(appt);
        }

        const results = Array.from(patientsMap.values());
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ message: 'Error searching patients', error: error.message });
    }
};

// @desc    Upload Prescription (PDF, JPG, PNG — max 5 MB)
// @route   POST /api/hospital/dashboard/appointments/:id/prescription
export const uploadAppointmentPrescription = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const user = req.user;

        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }

        const ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!ALLOWED_MIMETYPES.includes(req.file.mimetype)) {
            res.status(400).json({ message: 'Only PDF, JPG, and PNG files are allowed' });
            return;
        }

        const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
        if (req.file.size > MAX_SIZE_BYTES) {
            res.status(400).json({ message: 'File too large — maximum size is 5 MB' });
            return;
        }

        const appointment = await Appointment.findById(id).populate('patient');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        // Perform authorization check (only doctor or hospital_admin can upload)
        let isAuthorized = false;
        let userHospital: any = null;

        // a) requesting user.role === "doctor" AND user.id === appointment.doctorId
        if (
            (user.role === 'doctor') && 
            (user._id.toString() === appointment.doctor.toString())
        ) {
            isAuthorized = true;
        }

        // b) requesting user.role === "hospital_admin" AND user belongs to appointment.hospitalId
        if (user.role === 'hospital' || user.role === 'hospital_admin') {
            userHospital = await hospitalForAppointmentAccess(user);
            if (userHospital && userHospital._id.toString() === appointment.hospital.toString()) {
                isAuthorized = true;
                // Set req.hospital so downstream logic continues to work
                (req as any).hospital = userHospital;
            }
        }

        if (!isAuthorized) {
            res.status(403).json({ message: 'You do not have access to this prescription' });
            return;
        }

        // For PDFs: validate magic bytes (%PDF)
        if (req.file.mimetype === 'application/pdf') {
            const header = req.file.buffer.subarray(0, 4).toString();
            if (header !== '%PDF') {
                res.status(400).json({ message: 'File is not a valid PDF — header check failed' });
                return;
            }
        }

        const isPdf = req.file.mimetype === 'application/pdf';
        const isImage = ['image/jpeg', 'image/png'].includes(req.file.mimetype);

        // If prescription already exists, delete old one from Cloudinary (only if it was stored on Cloudinary)
        if (appointment.prescriptionUrl && appointment.prescriptionUrl.includes('res.cloudinary.com')) {
            try {
                // Determine old resource type from URL path
                const isOldRaw = appointment.prescriptionUrl.includes('/raw/upload/');
                const isOldImage = appointment.prescriptionUrl.includes('/image/upload/');
                const oldResourceType = isOldRaw ? 'raw' : isOldImage ? 'image' : 'raw';
                // Extract public_id (last two path segments, strip extension)
                const urlParts = appointment.prescriptionUrl.split('/');
                const filenameWithExt = urlParts[urlParts.length - 1];
                const filename = filenameWithExt.replace(/\.[^.]+$/, '');
                const folder = urlParts[urlParts.length - 2];
                const oldPublicId = `${folder}/${filename}`;
                await cloudinary.uploader.destroy(oldPublicId, { resource_type: oldResourceType });
            } catch (err: any) {
                console.error('Could not delete old prescription from Cloudinary:', err.message);
            }
        }

        // Convert buffer to base64 data URI
        const base64File = req.file.buffer.toString('base64');
        const dataUri = `data:${req.file.mimetype};base64,${base64File}`;

        // Generate a cryptographically secure random suffix to make public URL unguessable
        const crypto = require('crypto');
        const randomSuffix = crypto.randomBytes(16).toString('hex');

        // Construct backend file URL with secure query key
        const prescriptionUrl = `${req.protocol}://${req.get('host')}/api/hospital/dashboard/appointments/${appointment._id}/prescription/file?key=${randomSuffix}`;

        console.log('Local Prescription URL:', prescriptionUrl);

        appointment.prescriptionUrl = prescriptionUrl;
        appointment.prescriptionBase64 = dataUri;
        appointment.prescriptionUploadedAt = new Date();
        await appointment.save();

        const patientEmail = (appointment.patient as any)?.email || appointment.patientEmail;
        const patientName = (appointment.patient as any)?.name || appointment.patientName || 'Patient';

        if (patientEmail && isPdf) {
            try {
                const downloadUrl = prescriptionUrl.includes('/raw/upload/')
                    ? prescriptionUrl.replace('/raw/upload/', '/raw/upload/fl_attachment:prescription/')
                    : prescriptionUrl;

                let hospitalName = 'Hospital';
                if ((req as any).hospital) {
                    hospitalName = (req as any).hospital.name;
                } else {
                    const hDoc = await Hospital.findById(appointment.hospital);
                    if (hDoc) hospitalName = hDoc.name;
                }

                await sendPrescriptionEmail({
                    toEmail: patientEmail,
                    patientName,
                    hospitalName,
                    prescriptionUrl: downloadUrl,
                    date: formatDateIST(appointment.bookingDate)
                });
            } catch (emailError: any) {
                console.error('Prescription email failed (non-critical):', emailError.message);
            }
        }

        res.json(appointment);
    } catch (error: any) {
        console.error('Prescription upload error:', error);
        res.status(500).json({ message: 'Error uploading prescription', error: error.message });
    }
};

// @desc    Get Prescription URL
// @route   GET /api/hospital/dashboard/appointments/:id/prescription
export const getAppointmentPrescription = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const user = req.user;

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        // Perform authorization check: doctor, hospital_admin, patient
        let isAuthorized = false;

        // a) requesting user.role === "doctor" AND user.id === appointment.doctorId
        if (
            (user.role === 'doctor') && 
            (user._id.toString() === appointment.doctor.toString())
        ) {
            isAuthorized = true;
        }

        // b) requesting user.role === "hospital_admin" AND user belongs to appointment.hospitalId
        if (user.role === 'hospital' || user.role === 'hospital_admin') {
            const userHospital = await hospitalForAppointmentAccess(user);
            if (userHospital && userHospital._id.toString() === appointment.hospital.toString()) {
                isAuthorized = true;
            }
        }

        // c) requesting user.role === "patient" AND user.id === appointment.patientId
        if (
            (user.role === 'patient' || user.role === 'customer') && 
            (user._id.toString() === appointment.patient.toString())
        ) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            res.status(403).json({ message: 'You do not have access to this prescription' });
            return;
        }

        if (!appointment.prescriptionUrl) {
            res.status(404).json({ message: 'Prescription not uploaded yet' });
            return;
        }

        // Get the auth token from req headers to pass to the query string for window.open query auth
        let token = '';
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(/\s+/)[1];
        }

        let finalUrl = appointment.prescriptionUrl;
        if (finalUrl && finalUrl.includes('/prescription/file')) {
            // Append token for query auth if not already present
            if (!finalUrl.includes('token=')) {
                finalUrl += `&token=${token}`;
            }
        }

        // Return JSON response as expected by both frontends (Pillora and Pillora-hospital)
        res.json({
            success: true,
            prescriptionUrl: finalUrl,
            url: finalUrl
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching prescription', error: error.message });
    }
};

// @desc    Stream prescription file directly to bypass Cloudinary ACL/401 blocks
// @route   GET /api/hospital/dashboard/appointments/:id/prescription/file
export const getAppointmentPrescriptionFile = async (req: any, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        let token = req.query.token as string;
        
        if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(/\s+/)[1];
        }

        if (!token) {
            res.status(401).json({ message: 'Not authorized, no token' });
            return;
        }

        // Validate token exactly like the protect middleware (env secret only, HS256)
        let decoded: any = null;
        try {
            decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
        } catch (err) {
            decoded = null;
        }

        if (!decoded) {
            res.status(401).json({ message: 'Not authorized, token failed' });
            return;
        }

        const userId = decoded.id || decoded.userId;
        const user: any = await User.findById(userId);
        if (!user) {
            res.status(401).json({ message: 'Not authorized, user not found' });
            return;
        }
        // Tokens issued before "log out all devices" / password change are no longer valid (same rule as protect)
        const revokedAt = user.tokensRevokedAt ? new Date(user.tokensRevokedAt).getTime() : 0;
        if (revokedAt && typeof decoded.iat === 'number' && decoded.iat * 1000 < revokedAt - 1000) {
            res.status(401).json({ message: 'Not authorized, session expired' });
            return;
        }

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        // Perform authorization check: doctor, hospital_admin, patient
        let isAuthorized = false;

        if ((user.role as any) === 'doctor' && user._id.toString() === appointment.doctor.toString()) {
            isAuthorized = true;
        }
        if (user.role === 'hospital' || (user.role as any) === 'hospital_admin') {
            const userHospital = await hospitalForAppointmentAccess(user);
            if (userHospital && userHospital._id.toString() === appointment.hospital.toString()) {
                isAuthorized = true;
            }
        }
        if (((user.role as any) === 'patient' || user.role === 'customer') && user._id.toString() === appointment.patient.toString()) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            res.status(403).json({ message: 'You do not have access to this prescription' });
            return;
        }

        if (!appointment.prescriptionUrl) {
            res.status(404).json({ message: 'Prescription not uploaded yet' });
            return;
        }

        // Secure key check
        let expectedKey: string | null = null;
        try {
            if (appointment.prescriptionUrl.startsWith('http')) {
                const urlObj = new URL(appointment.prescriptionUrl);
                expectedKey = urlObj.searchParams.get('key');
            }
        } catch (e) {
            // Ignore
        }
        const providedKey = req.query.key as string;

        if (expectedKey && expectedKey !== providedKey) {
            res.status(403).json({ message: 'Invalid or expired secure access key' });
            return;
        }

        // Serve base64 PDF/image data from DB if available
        if (appointment.prescriptionBase64 && appointment.prescriptionBase64.startsWith('data:')) {
            const matches = appointment.prescriptionBase64.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                const contentType = matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                res.contentType(contentType);
                if (contentType === 'application/pdf') {
                    res.setHeader('Content-Disposition', 'inline; filename="prescription.pdf"');
                } else {
                    res.setHeader('Content-Disposition', 'inline; filename="prescription"');
                }
                res.send(buffer);
                return;
            }
        }

        // Fallback for legacy Cloudinary URLs
        res.redirect(appointment.prescriptionUrl);
    } catch (error: any) {
        res.status(500).json({ message: 'Error streaming prescription file', error: error.message });
    }
};

// @desc    Update payment status manually (placeholder — gateway-ready)
// @route   PATCH /api/hospital/dashboard/appointments/:id/payment-status
// @access  Private/Hospital
// Design note: sets paymentSource='manual' so a future gateway webhook can override
// by setting paymentSource='gateway' without a schema rewrite.
export const updatePaymentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;
        const { status } = req.body;

        const ALLOWED_STATUSES = ['unpaid', 'paid', 'waived'];
        if (!status || !ALLOWED_STATUSES.includes(status)) {
            res.status(400).json({
                message: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
            });
            return;
        }

        const existing: any = await Appointment.findOne({ _id: id, hospital: hospital._id });
        if (!existing) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        // Payment records are never deleted (H6). The online advance collected by Pillora cannot be undone
        // here — it is refunded through cancellation. Clinic collections are reversed, not removed.
        const onlineAdvance = await Payment.findOne({
            appointmentId: existing._id,
            paymentSource: 'pillora_online',
            status: { $in: ['completed', 'paid'] }
        }).select('_id');
        if (status === 'unpaid' && onlineAdvance) {
            res.status(409).json({
                message: 'This booking has an online advance paid through Pillora, so it cannot be marked unpaid. Cancel the appointment to refund the advance instead.'
            });
            return;
        }

        const fee = Number(existing.consultationFee) || 0;
        const advancePaid = onlineAdvance ? Number(existing.advancePaid) || 0 : 0;
        const update: any = {
            paymentStatus: status,
            paymentSource: 'manual',
            paymentUpdatedAt: new Date(),
            paymentUpdatedBy: req.user?._id || req.user?.id
        };

        if (status === 'unpaid' || status === 'waived') {
            const actor = String(req.user?._id || req.user?.id || '');
            await Payment.updateMany(
                { appointmentId: existing._id, paymentSource: 'clinic_collection', status: { $in: ['completed', 'paid'] } },
                [{
                    $set: {
                        status: 'refunded',
                        notes: { $concat: [{ $ifNull: ['$notes', ''] }, ` | Reversed: booking marked ${status} by hospital user ${actor} on ${new Date().toISOString()}`] }
                    }
                }],
                { updatePipeline: true }
            );
            update.balancePaid = 0;
            update.balanceDue = status === 'waived' ? 0 : Math.max(0, fee - advancePaid);
        }

        const appointment = await Appointment.findOneAndUpdate(
            { _id: existing._id, hospital: hospital._id },
            update,
            { new: true }
        );

        res.json({ message: 'Payment status updated', appointment });
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating payment status', error: error.message });
    }
};

// @desc    Autocomplete patient names (≥2 chars) scoped to this hospital
// @route   GET /api/hospital/dashboard/patients/autocomplete?q=yu
// @access  Private/Hospital
export const autocompletePatients = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const query = (req.query.q as string || '').trim();

        if (query.length < 2) {
            res.json([]);
            return;
        }

        // Get distinct patient IDs who have bookings at this hospital
        const bookingPatientIds = await Appointment.distinct('patient', { hospital: hospital._id });

        // Partial case-insensitive name match, limited to this hospital's patients
        const regex = new RegExp(escapeRegex(query.slice(0, 100)), 'i');
        const patients = await User.find({
            _id: { $in: bookingPatientIds },
            name: regex
        })
        .select('name email phone')
        .limit(8)
        .lean();

        const suggestions = (patients as any[]).map((p) => ({
            id: p._id.toString(),
            name: p.name,
            email: p.email || '',
            phone: p.phone || ''
        }));

        res.json(suggestions);
    } catch (error: any) {
        res.status(500).json({ message: 'Autocomplete error', error: error.message });
    }
};

// @desc    Autocomplete booking IDs (≥4 chars) scoped to this hospital
// @route   GET /api/hospital/dashboard/bookings/autocomplete?q=abc1
// @access  Private/Hospital
export const autocompleteBookingIds = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const query = (req.query.q as string || '').trim();

        if (query.length < 4) {
            res.json([]);
            return;
        }

        // Fetch recent appointments for this hospital
        const appointments = await Appointment.find({ hospital: hospital._id })
            .populate('patient', 'name')
            .select('_id slotTime patientName patient')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        // Filter by partial ID match anywhere in the full ObjectId string
        const lowerQuery = query.toLowerCase();
        const matched = (appointments as any[])
            .filter((a) => a._id.toString().toLowerCase().includes(lowerQuery))
            .slice(0, 8)
            .map((a) => ({
                id: a._id.toString(),
                bookingId: a._id.toString(),
                patientName: a.patientName || (a.patient as any)?.name || 'Unknown',
                date: a.slotTime
                    ? new Date(a.slotTime).toLocaleDateString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                      })
                    : ''
            }));

        res.json(matched);
    } catch (error: any) {
        res.status(500).json({ message: 'Autocomplete error', error: error.message });
    }
};

// @desc    Record a clinic collection for a booking (Scenario B & C)
// @route   POST /api/hospital/dashboard/appointments/:id/payment
// @access  Private/Hospital
export const recordPayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;
        const { amount, mode, paymentMethod, notes } = req.body;

        if (amount === undefined || amount < 0) {
            res.status(400).json({ message: 'Valid amount is required' });
            return;
        }

        const effectiveMethod = paymentMethod || (mode === 'offline' ? 'cash' : 'upi');
        const effectiveMode = effectiveMethod === 'cash' ? 'offline' : 'online';

        const appointment = await Appointment.findOne({ _id: id, hospital: hospital._id }).populate('patient');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        const patientName = appointment.patientName || (appointment.patient as any)?.name || 'Unknown Patient';
        const fee = appointment.consultationFee || 500;
        const advance = appointment.advancePaid || 0;
        const prevBalance = appointment.balancePaid || 0;

        // Check if there's already an online advance payment
        const hasOnlineAdvance = (advance > 0) || await Payment.exists({
            appointmentId: appointment._id,
            paymentSource: 'pillora_online',
            status: { $in: ['completed', 'paid'] }
        });

        const paymentType = hasOnlineAdvance ? 'balance' : 'full';

        // Create new immutable Payment record
        const payment = new Payment({
            appointmentId: appointment._id,
            hospitalId: hospital._id,
            userId: appointment.patient,
            patientName,
            amount,
            amountInPaise: Math.round(amount * 100),
            consultationFee: fee,
            paymentType,
            paymentSource: 'clinic_collection',
            paymentMethod: effectiveMethod,
            mode: effectiveMode,
            status: 'completed',
            settlementStatus: 'not_applicable',
            recordedBy: req.user!._id,
            notes: notes || `Clinic collection via ${effectiveMethod.toUpperCase()}`
        });
        await payment.save();

        // Update appointment status and balances
        const newBalancePaid = prevBalance + amount;
        const newBalanceDue = Math.max(0, fee - advance - newBalancePaid);

        appointment.balancePaid = newBalancePaid;
        appointment.balanceDue = newBalanceDue;
        appointment.paymentStatus = (newBalanceDue <= 0) ? 'paid' : 'partial';
        appointment.paymentUpdatedAt = new Date();
        appointment.paymentUpdatedBy = req.user!._id;
        await appointment.save();

        res.json({ 
            message: 'Payment recorded successfully', 
            payment, 
            appointment: {
                _id: appointment._id,
                consultationFee: fee,
                advancePaid: advance,
                balancePaid: newBalancePaid,
                balanceDue: newBalanceDue,
                paymentStatus: appointment.paymentStatus
            }
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error recording payment', error: error.message });
    }
};

// @desc    Get payment summary and analytics (delegates to central getHospitalFinancialOverview)
// @route   GET /api/hospital/dashboard/payments/summary
// @access  Private/Hospital
export const getPaymentSummary = async (req: AuthRequest, res: Response): Promise<void> => {
    return getHospitalFinancialOverview(req, res);
};

// @desc    Get Hospital Subscription Status, Expiry, Days Remaining & Payment History
// @route   GET /api/hospital/dashboard/subscription
export const getHospitalSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }

        const computed = computeSubscriptionStatus(hospital);

        // Fetch complete payment history for this hospital
        const payments = await HospitalSubscriptionPayment.find({ hospital: hospital._id })
            .sort({ paymentDate: -1 })
            .populate('recordedBy', 'name email');

        res.json({
            hospital: {
                _id: hospital._id,
                name: hospital.name,
                city: hospital.city,
                email: hospital.email,
                joiningDate: hospital.joiningDate || hospital.createdAt,
                paymentStatus: hospital.paymentStatus || 'Pending',
                subscriptionStatus: computed.status,
                subscriptionStartDate: computed.subscriptionStartDate,
                subscriptionExpiryDate: computed.subscriptionExpiryDate,
                daysRemaining: computed.daysRemaining,
                isValid: computed.isValid,
                canGenerateSlots: computed.canGenerateSlots,
                lastPaymentDate: computed.lastPaymentDate,
                nextPaymentDueDate: computed.subscriptionExpiryDate,
                lastPaymentAmount: hospital.lastPaymentAmount || null,
                lastPaymentMethod: hospital.lastPaymentMethod || null,
                subscriptionDurationDays: hospital.subscriptionDurationDays || 30,
            },
            payments,
            contactAdmin: {
                email: 'team@pillora.in',
                phone: '+91 94291 67856',
                instructions: 'To renew or activate your 30-day slot generation subscription, please contact the Pillora Admin after making payment. Your 30-day slot generation privileges will be renewed immediately.'
            }
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching subscription details', error: error.message });
    }
};

