import { Request, Response } from 'express';
import Hospital from '../models/Hospital';
import Slot from '../models/Slot';
import Doctor from '../models/Doctor';
import { effectiveSlotCapacity, hospitalSlotCapacitySetting } from '../utils/slotCapacity';
import Appointment from '../models/Appointment';
import { AuthRequest } from '../middleware/authMiddleware';
import mongoose from 'mongoose';
import { computeSubscriptionStatus } from '../services/subscriptionService';
import { resolveHospitalAccess } from '../utils/hospitalAccess';

// Owner or active staff hospital (this router is not mounted in app.ts)
const hospitalOf = async (req: AuthRequest): Promise<any> => {
    const access = await resolveHospitalAccess(req.user);
    return access.ok ? access.hospital : null;
};

// @desc    Get hospital profile for logged-in hospital user
// @route   GET /api/hospital-panel/profile
// @access  Private/Hospital
export const getHospitalProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = await hospitalOf(req);
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        res.json(hospital);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Generate slots for a doctor
// @route   POST /api/hospital-panel/slots/generate
// @access  Private/Hospital
export const generateSlots = async (req: AuthRequest, res: Response): Promise<void> => {
    const { doctorId, date, startTime, endTime, slotDuration } = req.body;

    try {
        const hospital = await hospitalOf(req);
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }

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

        // Validate doctor belongs to this hospital
        const doctorExists = hospital.doctors.some((d: any) => d._id.toString() === doctorId);
        if (!doctorExists) {
            res.status(400).json({ message: 'Doctor not found in your hospital' });
            return;
        }

        const start = new Date(`${date}T${startTime}`);
        const end = new Date(`${date}T${endTime}`);
        const duration = parseInt(slotDuration);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            res.status(400).json({ message: 'Invalid date or time format' });
            return;
        }

        // Check for existing slots to prevent duplication
        const existingSlotsCount = await Slot.countDocuments({
            doctor: doctorId,
            startTime: { $gte: start, $lt: end }
        });

        if (existingSlotsCount > 0) {
            res.status(400).json({ message: 'Slots have already been generated for this doctor in this time range.' });
            return;
        }

        // Doctor's own limit (> 1), else the hospital's "Max patients per slot" setting, else 1
        const doctorDoc: any = mongoose.Types.ObjectId.isValid(String(doctorId))
            ? await Doctor.findById(doctorId).select('maxAppointmentsPerSlot').lean()
            : null;
        const maxAppts = effectiveSlotCapacity(doctorDoc, await hospitalSlotCapacitySetting(hospital._id));

        const slots = [];
        let current = new Date(start);

        while (current < end) {
            const next = new Date(current.getTime() + duration * 60000);
            if (next <= end) {
                slots.push({
                    doctor: doctorId,
                    hospital: hospital._id,
                    startTime: new Date(current),
                    endTime: next,
                    status: 'available',
                    max_appointments: maxAppts,
                    booked_count: 0,
                    hold_count: 0
                });
            }
            current = next;
        }

        // Bulk insert slots
        await Slot.insertMany(slots);

        res.status(201).json({ 
            message: `Successfully generated ${slots.length} slots`,
            count: slots.length 
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get appointments for the hospital
// @route   GET /api/hospital-panel/appointments
// @access  Private/Hospital
export const getHospitalAppointments = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = await hospitalOf(req);
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }

        const appointments = await Appointment.find({ hospital: hospital._id })
            .populate('patient', 'name email phone')
            .populate('doctor', 'name specialization')
            .sort({ slotTime: 1 });

        res.json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get slots for a doctor (to see availability)
// @route   GET /api/hospital-panel/slots/:doctorId
// @access  Private/Hospital
export const getDoctorSlots = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = await hospitalOf(req);
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }

        const slots = await Slot.find({ 
            doctor: req.params.doctorId, 
            hospital: hospital._id,
            startTime: { $gte: new Date() }
        }).sort({ startTime: 1 });

        res.json(slots);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};
