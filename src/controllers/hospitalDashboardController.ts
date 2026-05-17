import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Hospital from '../models/Hospital';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import Appointment from '../models/Appointment';
import mongoose from 'mongoose';

// @desc    Get hospital dashboard stats
// @route   GET /api/hospital/dashboard/stats
// @access  Private/Hospital
export const getHospitalStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        
        const doctorCount = await Doctor.countDocuments({ hospital: hospital._id });
        const appointmentCount = await Appointment.countDocuments({ hospital: hospital._id });
        const pendingAppointments = await Appointment.countDocuments({ hospital: hospital._id, status: 'pending' });
        
        const recentAppointments = await Appointment.find({ hospital: hospital._id })
            .populate('patient', 'name email')
            .populate('doctor', 'name specialty')
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            stats: {
                doctors: doctorCount,
                appointments: appointmentCount,
                pending: pendingAppointments
            },
            recentAppointments,
            management_type: hospital.management_type
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
        const { name, specialty, fee, availability, isSpecialtyGroup, department, maxAppointmentsPerSlot, doctorsCount, description } = req.body;

        const doctor = await Doctor.create({
            hospital: hospital._id,
            name,
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
        const { doctorId, date, startTime, endTime, duration } = req.body; // duration in minutes

        if (!doctorId || !date || !startTime || !endTime || !duration) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }

        const start = new Date(`${date}T${startTime}:00`);
        const end = new Date(`${date}T${endTime}:00`);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            res.status(400).json({ message: 'Invalid date or time format' });
            return;
        }

        const durationMinutes = parseInt(duration.toString(), 10);
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
            res.status(400).json({ message: 'Invalid slot duration' });
            return;
        }

        // Check for existing slots for this doctor in the time range to prevent duplicate slots
        const existingSlots = await Slot.countDocuments({
            doctor: doctorId,
            startTime: { $gte: start, $lt: end }
        });

        if (existingSlots > 0) {
            res.status(400).json({ message: 'Slots have already been generated for this doctor within this time range.' });
            return;
        }

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
                status: 'available'
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
            .populate('doctor', 'name specialty')
            .populate('slot', 'startTime endTime')
            .sort({ slotTime: 1 });
        
        res.json(appointments);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching appointments', error: error.message });
    }
};

// @desc    Update Appointment Status
// @route   PUT /api/hospital/appointments/:id/status
export const updateAppointmentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { status } = req.body;

        const appointment = await Appointment.findOneAndUpdate(
            { _id: req.params.id, hospital: hospital._id },
            { status },
            { new: true }
        );

        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

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

        const startOfDay = new Date(date as string);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date as string);
        endOfDay.setHours(23, 59, 59, 999);

        const slots = await Slot.find({
            doctor: id,
            startTime: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ startTime: 1 });

        res.json(slots);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching slots', error: error.message });
    }
};

// @desc    Create appointment (Book slot)
// @route   POST /api/hospital/dashboard/appointments
export const createAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { doctorId, hospitalId, slotId, slotTime } = req.body;
        const patientId = req.user?.id;

        // Atomic check and update of slot status to prevent race conditions
        const slot = await Slot.findOneAndUpdate(
            { _id: slotId, status: 'available' },
            { status: 'booked' },
            { new: true }
        );

        if (!slot) {
            res.status(400).json({ message: 'Slot is no longer available or already booked' });
            return;
        }

        const appointment = await Appointment.create({
            patient: patientId as any,
            doctor: doctorId as any,
            hospital: hospitalId as any,
            slot: slotId as any,
            slotTime: new Date(slotTime),
            status: 'pending'
        });

        // Link appointment back to slot
        slot.appointment = appointment._id as mongoose.Types.ObjectId;
        await slot.save();

        // Emit socket event for real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('slotBooked', { 
                slotId, 
                doctorId, 
                date: new Date(slotTime).toISOString().split('T')[0] 
            });
        }

        res.status(201).json({ message: 'Appointment booked successfully', appointment });
    } catch (error: any) {
        res.status(500).json({ message: 'Error booking appointment', error: error.message });
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
