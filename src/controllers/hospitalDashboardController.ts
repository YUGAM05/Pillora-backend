import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Hospital from '../models/Hospital';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import Appointment from '../models/Appointment';
import mongoose from 'mongoose';
import redis from '../utils/redisMock';
import { createHold, releaseHold, isHeldByUser } from '../utils/holdManager';

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

        // Get maxAppointmentsPerSlot from Doctor model
        const doctorDoc = await Doctor.findById(doctorId);
        const maxAppts = doctorDoc?.maxAppointmentsPerSlot || 1;

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

// @desc    Create appointment (Book slot with Transaction & SELECT FOR UPDATE protection)
// @route   POST /api/hospital/dashboard/appointments
export const createAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    const { doctorId, hospitalId, slotId, slotTime, bookingRequestId } = req.body;
    const patientId = req.user?.id || req.user?._id;

    if (!patientId) {
        res.status(401).json({ message: 'User not authenticated' });
        return;
    }

    if (!slotId || !doctorId || !hospitalId || !slotTime) {
        res.status(400).json({ message: 'Missing required booking fields' });
        return;
    }

    // 4. DUPLICATE BOOKING PREVENTION
    try {
        const existingActiveBooking = await Appointment.findOne({
            patient: patientId,
            slot: slotId,
            status: { $ne: 'cancelled' }
        });

        if (existingActiveBooking) {
            res.status(400).json({ 
                code: 'ALREADY_BOOKED',
                message: 'You already have an appointment for this slot.' 
            });
            return;
        }

        // Idempotency check: prevent duplicate submissions from network retries
        if (bookingRequestId) {
            const idempotencyKey = `idempotency:${bookingRequestId}`;
            const existingKey = await redis.get(idempotencyKey);
            if (existingKey) {
                res.status(409).json({ 
                    code: 'DUPLICATE_SUBMISSION',
                    message: 'Your booking is already being processed. Please wait.' 
                });
                return;
            }
            // Set idempotency lock for 10 seconds
            await redis.setex(idempotencyKey, 10, 'processing');
        }

        // Start MongoDB Session for Transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Step 1: Lock the slot row (SELECT FOR UPDATE row-level locking equivalent)
            const slot = await Slot.findById(slotId).session(session);
            if (!slot) {
                throw new Error('SLOT_NOT_FOUND');
            }

            if (slot.status === 'cancelled') {
                throw new Error('SLOT_CANCELLED');
            }

            // Resolve max appointments
            const doctor = await Doctor.findById(doctorId).session(session);
            const maxAppts = slot.max_appointments || (doctor?.maxAppointmentsPerSlot) || 1;

            // Step 2: Check booked_count < max_appointments
            // Verify if slot has active holds or general space
            const userHasHold = await isHeldByUser(slotId.toString(), patientId.toString());

            if (slot.booked_count >= maxAppts) {
                throw new Error('SLOT_FULL');
            }

            // Step 3: Insert appointment record (Generate unique token number as Step 5)
            const activeAppointmentsCount = await Appointment.countDocuments({
                slot: slotId,
                status: { $ne: 'cancelled' }
            }).session(session);

            // Step 5: Generate unique token number
            const tokenNumber = activeAppointmentsCount + 1;

            const appointment = new Appointment({
                patient: patientId,
                doctor: doctorId,
                hospital: hospitalId,
                slot: slotId,
                slotTime: new Date(slotTime),
                status: 'confirmed',
                tokenNumber
            });

            await appointment.save({ session });

            // Step 4: Increment booked_count atomically only if booked_count < max_appointments
            const updatedSlot = await Slot.findOneAndUpdate(
                { 
                    _id: slotId, 
                    booked_count: { $lt: maxAppts } 
                },
                { 
                    $inc: { booked_count: 1, hold_count: userHasHold ? -1 : 0 },
                    $set: { 
                        status: (slot.booked_count + 1 >= maxAppts) ? 'booked' : 'available',
                        appointment: appointment._id
                    }
                },
                { session, new: true }
            );

            if (!updatedSlot) {
                throw new Error('SLOT_FULL'); // If 0 rows affected, reject with SLOT_FULL
            }

            // Step 6: Commit transaction
            await session.commitTransaction();
            session.endSession();

            // Release the temporary hold
            if (userHasHold) {
                await redis.del(`hold:${slotId}:${patientId}`);
            }

            // Real-time socket updates for availability
            const io = req.app.get('io');
            if (io) {
                io.emit('slotBooked', {
                    slotId,
                    doctorId,
                    date: new Date(slotTime).toISOString().split('T')[0],
                    bookedCount: updatedSlot.booked_count,
                    holdCount: updatedSlot.hold_count,
                    maxAppointments: maxAppts
                });
            }

            res.status(201).json({
                success: true,
                message: 'Appointment booked successfully',
                appointment: {
                    ...appointment.toObject(),
                    tokenNumber
                }
            });

        } catch (error: any) {
            await session.abortTransaction();
            session.endSession();

            if (bookingRequestId) {
                await redis.del(`idempotency:${bookingRequestId}`);
            }
            throw error;
        }

    } catch (error: any) {
        console.error('[BookingTransactionError]', error.message);

        // 5. USER-FACING ERROR MESSAGES based on scenario
        if (error.message === 'SLOT_FULL') {
            res.status(400).json({
                code: 'SLOT_FULL',
                message: 'Sorry, this slot was just booked by someone else. Please choose another slot.'
            });
        } else if (error.message === 'SLOT_CANCELLED') {
            res.status(400).json({
                code: 'SLOT_CANCELLED',
                message: 'This slot has been cancelled by the hospital. Please choose another.'
            });
        } else if (error.message === 'SLOT_NOT_FOUND') {
            res.status(404).json({
                code: 'NOT_FOUND',
                message: 'Slot not found. Please choose another.'
            });
        } else {
            res.status(500).json({
                code: 'SERVER_ERROR',
                message: 'An unexpected booking error occurred. Please try again.',
                error: error.message
            });
        }
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
        
        const slotsWithCount = slots.map(slot => {
            const bookingCount = appointments.filter(app => app.slot.toString() === slot._id.toString()).length;
            return {
                ...slot.toObject(),
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

        const targetDates = generateDates(date, recurrence);
        const slotsToInsert = [];

        for (const targetDate of targetDates) {
            const dateStr = targetDate.toISOString().split('T')[0];
            const start = new Date(`${dateStr}T${startTime}:00`);
            const end = new Date(`${dateStr}T${endTime}:00`);

            // Past date/time validation
            if (start < now) {
                if (targetDates.length === 1) {
                    res.status(400).json({ message: 'Cannot create a slot for a past date or past time on today\'s date' });
                    return;
                }
                continue; // Skip past dates silently in batch recurrences
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

            const doctorDoc = await Doctor.findById(doctorId);
            const maxAppts = doctorDoc?.maxAppointmentsPerSlot || 1;

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

        res.status(201).json({ message: `Successfully created ${slotsToInsert.length} slots`, count: slotsToInsert.length });
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

        // Update affected bookings to cancelled
        await Appointment.updateMany({ slot: slot._id }, { status: 'cancelled' });

        // Emit socket update for real-time lists
        const io = req.app.get('io');
        if (io) {
            io.emit('slotsUpdated', { 
                doctorId: slot.doctor, 
                date: new Date(slot.startTime).toISOString().split('T')[0] 
            });
        }

        res.json({ message: 'Slot and all associated bookings cancelled successfully.' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error cancelling slot', error: error.message });
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

        // Check if already booked
        const existingActiveBooking = await Appointment.findOne({
            patient: patientId,
            slot: slotId,
            status: { $ne: 'cancelled' }
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
            if (holdResult.message === 'Slot just became full') {
                res.status(400).json({
                    code: 'SLOT_FULL',
                    message: 'Sorry, this slot was just booked by someone else. Please choose another slot.'
                });
            } else if (holdResult.message === 'Slot on temporary hold') {
                res.status(400).json({
                    code: 'SLOT_ON_HOLD',
                    message: 'This slot is temporarily held. Please try again in a few minutes or choose another.'
                });
            } else if (holdResult.message === 'Slot cancelled by admin') {
                res.status(400).json({
                    code: 'SLOT_CANCELLED',
                    message: 'This slot has been cancelled by the hospital. Please choose another.'
                });
            } else {
                res.status(400).json({
                    code: 'HOLD_FAILED',
                    message: holdResult.message
                });
            }
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

