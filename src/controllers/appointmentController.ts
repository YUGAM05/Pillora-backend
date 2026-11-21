import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import Appointment from '../models/Appointment';
import Slot from '../models/Slot';
import Doctor from '../models/Doctor';
import Hospital from '../models/Hospital';
import { resolveHospitalAccess, hasHospitalPermission } from '../utils/hospitalAccess';
import { createHold } from '../utils/holdManager';
import { holdFailureResponse, HoldFailure } from '../utils/slotBooking';
import { cancelAppointmentWithPolicy, CancelActor } from '../utils/bookingCancellation';

const ADVANCE_RATE = 0.20;

const userIdOf = (req: AuthRequest): string => String(req.user?._id || req.user?.id || '');

/**
 * Who may act on an appointment: its patient, the hospital that owns it, or an admin.
 * Returns the actor type, or null when the caller has no right to it.
 */
const resolveActor = async (req: AuthRequest, appointment: any): Promise<CancelActor | null> => {
    const uid = userIdOf(req);
    if (!uid) return null;
    if (req.user?.role === 'admin') return 'admin';
    if (req.user?.role === 'hospital') {
        // Owner or active staff of that hospital whose role covers appointments
        const access = await resolveHospitalAccess(req.user);
        const owns = access.ok
            && String(access.hospital._id) === String(appointment.hospital)
            && hasHospitalPermission(access.staffRole, 'appointments');
        return owns ? 'hospital' : null;
    }
    return String(appointment.patient) === uid ? 'patient' : null;
};

/**
 * @desc    Cancel appointment (initiator-dependent refund/retention rules)
 * @route   POST /api/appointments/:appointmentId/cancel
 * @access  Private — the appointment's patient, its hospital, or an admin
 */
export const cancelAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { appointmentId } = req.params;
        const { reason } = req.body || {};

        if (!appointmentId || !mongoose.Types.ObjectId.isValid(String(appointmentId))) {
            res.status(400).json({ success: false, message: 'Valid appointment ID is required' });
            return;
        }

        const appointment = await Appointment.findById(appointmentId).select('patient hospital status');
        if (!appointment) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }

        const actor = await resolveActor(req, appointment);
        if (!actor) {
            // Same answer as "not found" so appointment ids cannot be probed
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }

        const result = await cancelAppointmentWithPolicy(appointment._id, actor, typeof reason === 'string' ? reason.slice(0, 500) : undefined);
        if (!result.ok) {
            res.status(result.status).json({ success: false, message: result.message });
            return;
        }

        const io = req.app.get('io');
        if (io) io.emit('appointmentsUpdated', { hospitalId: result.appointment.hospital });

        res.status(200).json({ success: true, message: result.message, refund: result.refund, appointment: result.appointment });
    } catch (error: any) {
        console.error('[AppointmentCancelError]', error.message);
        res.status(500).json({ success: false, message: 'Failed to cancel appointment' });
    }
};

/**
 * Hold an EXISTING slot for the patient and create (or reuse) their pending appointment.
 * Patients can never create slots; capacity is enforced atomically by the hold.
 */
const holdExistingSlot = async (req: AuthRequest, res: Response, slot: any, doctor: any, patientId: string, respond: (appointmentId: string) => void): Promise<void> => {
    // Already booked (paid / confirmed) for this slot?
    const existingBooked = await Appointment.findOne({
        patient: patientId,
        slot: slot._id,
        status: { $nin: ['cancelled', 'pending'] }
    }).select('_id');
    if (existingBooked) {
        res.status(400).json({ success: false, code: 'ALREADY_BOOKED', message: 'You already have an appointment for this slot.' });
        return;
    }

    const io = req.app.get('io');
    const holdResult = await createHold(slot._id.toString(), patientId, io);
    if (!holdResult.success) {
        const r = holdFailureResponse((holdResult.reason || 'UNAVAILABLE') as HoldFailure);
        res.status(r.status).json({ success: false, code: r.code, message: r.message });
        return;
    }

    let appointment = await Appointment.findOne({ patient: patientId, slot: slot._id, status: 'pending' });

    if (!appointment) {
        const activeAppointmentsCount = await Appointment.countDocuments({ slot: slot._id, status: { $ne: 'cancelled' } });
        const hospitalObj = await Hospital.findById(slot.hospital).select('name');

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
            hospitalName: hospitalObj ? hospitalObj.name : 'Hospital',
            consultationFee: doctor.fee || 500,
            appointmentDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(slot.startTime),
            appointmentTime: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(slot.startTime)
        });
        await appointment.save();
    }

    respond(appointment._id.toString());
};

/** Parse a client slot time: full ISO timestamps are exact; bare "HH:MM" is IST on `date`. */
const parseSlotStart = (value: any, date?: any): Date | null => {
    if (!value || typeof value !== 'string') return null;
    let d: Date;
    if (value.includes('T')) {
        d = new Date(value);
    } else if (/^\d{2}:\d{2}$/.test(value) && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        d = new Date(`${date}T${value}:00+05:30`);
    } else {
        return null;
    }
    return isNaN(d.getTime()) ? null : d;
};

/**
 * @desc    Book an existing slot (legacy endpoint; same rules as /hold)
 * @route   POST /api/appointments/create
 * @access  Private
 * Body: { doctorId, appointmentDate: 'YYYY-MM-DD', appointmentTime: 'HH:MM' (IST) } or { slotId }.
 * userId / consultationFee / hospitalId from the body are ignored.
 */
export const createAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const patientId = userIdOf(req);
        if (!patientId) {
            res.status(401).json({ error: 'User not authenticated' });
            return;
        }

        const { slotId, doctorId, appointmentDate, appointmentTime } = req.body || {};
        let slot: any = null;
        if (slotId && mongoose.Types.ObjectId.isValid(String(slotId))) {
            slot = await Slot.findById(slotId);
        } else if (doctorId && mongoose.Types.ObjectId.isValid(String(doctorId))) {
            const start = parseSlotStart(appointmentTime, appointmentDate);
            if (!start) {
                res.status(400).json({ error: 'Missing or invalid appointmentDate / appointmentTime' });
                return;
            }
            slot = await Slot.findOne({ doctor: doctorId, startTime: start });
        } else {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        if (!slot) {
            res.status(404).json({ error: 'No open slot exists at this time. Please pick one of the listed slots.' });
            return;
        }
        const doctor = await Doctor.findOne({ _id: slot.doctor, hospital: slot.hospital });
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        await holdExistingSlot(req, res, slot, doctor, patientId, (appointmentId) => {
            res.status(201).json({ success: true, appointmentId });
        });
    } catch (error: any) {
        console.error('[AppointmentCreateError]', error.message);
        res.status(500).json({ error: 'Failed to create appointment' });
    }
};

/**
 * @desc    Get appointment details by ID (checkout page)
 * @route   GET /api/appointments/:appointmentId
 * @access  Private — the appointment's patient, its hospital, or an admin
 */
export const getAppointmentDetails = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { appointmentId } = req.params;

        if (!appointmentId || !mongoose.Types.ObjectId.isValid(String(appointmentId))) {
            res.status(400).json({ error: "Appointment ID is required" });
            return;
        }

        const appointment = await Appointment.findById(appointmentId)
            .populate('doctor')
            .populate('hospital');

        if (!appointment || !(await resolveActor(req, { patient: appointment.patient, hospital: (appointment.hospital as any)?._id || appointment.hospital }))) {
            res.status(404).json({ error: "Appointment not found" });
            return;
        }

        const docObj = appointment.doctor as any;
        const hospObj = appointment.hospital as any;

        const doctorName = appointment.doctorName || (docObj ? `Dr. ${docObj.name}` : "") || "Doctor";
        const hospitalName = appointment.hospitalName || (hospObj ? hospObj.name : "") || "Hospital";
        const consultationFee = Number(docObj?.fee) > 0 ? Number(docObj.fee) : Number(appointment.consultationFee);

        let appointmentDate = appointment.appointmentDate;
        let appointmentTime = appointment.appointmentTime;

        if (appointment.slotTime) {
            const d = new Date(appointment.slotTime);
            appointmentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
            appointmentTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        }

        if (!(consultationFee > 0)) {
            res.status(400).json({ error: "Invalid appointment fee" });
            return;
        }

        res.status(200).json({
            appointmentId: appointment._id.toString(),
            doctorName,
            hospitalName,
            consultationFee,
            // Same amount /payments/create-order will charge (computed on the server)
            advanceFee: Math.round(consultationFee * ADVANCE_RATE * 100) / 100,
            status: appointment.status,
            paymentStatus: appointment.paymentStatus,
            appointmentDate: appointmentDate || "",
            appointmentTime: appointmentTime || "",
            doctorId: docObj ? docObj._id.toString() : (appointment.doctor ? appointment.doctor.toString() : ""),
            hospitalId: hospObj ? hospObj._id.toString() : (appointment.hospital ? appointment.hospital.toString() : "")
        });
    } catch (error: any) {
        console.error('[GetAppointmentDetailsError]', error.message);
        res.status(500).json({ error: 'Failed to load appointment' });
    }
};

/**
 * @desc    Hold an existing appointment slot temporarily before payment
 * @route   POST /api/appointments/hold
 * @access  Private
 * Body: { slotId } or { doctorId, slotStart (ISO, or 'HH:MM' IST with date), date }.
 * Only slots the hospital opened can be held; a missing slot is a 404 (patients never create slots).
 */
export const holdAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { slotId, doctorId, slotStart, date } = req.body || {};
        const patientId = userIdOf(req);

        if (!patientId) {
            res.status(401).json({ success: false, message: 'User not authenticated' });
            return;
        }

        let slot: any = null;
        if (slotId && mongoose.Types.ObjectId.isValid(String(slotId))) {
            slot = await Slot.findById(slotId);
        } else {
            if (!doctorId || !mongoose.Types.ObjectId.isValid(String(doctorId)) || !slotStart) {
                res.status(400).json({ success: false, message: 'Missing required fields' });
                return;
            }
            const start = parseSlotStart(slotStart, date);
            if (!start) {
                res.status(400).json({ success: false, message: 'Invalid slot time' });
                return;
            }
            slot = await Slot.findOne({ doctor: doctorId, startTime: start });
        }

        if (!slot || (doctorId && String(slot.doctor) !== String(doctorId))) {
            res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'This slot is not open for booking. Please choose one of the listed slots.' });
            return;
        }

        const doctor = await Doctor.findOne({ _id: slot.doctor, hospital: slot.hospital });
        if (!doctor) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }

        await holdExistingSlot(req, res, slot, doctor, patientId, (appointmentId) => {
            res.status(200).json({ success: true, appointmentId });
        });
    } catch (error: any) {
        console.error('[HoldAppointmentError]', error.message);
        res.status(500).json({ success: false, message: 'Failed to hold appointment' });
    }
};
