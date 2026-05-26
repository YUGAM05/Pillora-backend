import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Hospital from '../models/Hospital';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import Appointment from '../models/Appointment';
import User from '../models/User';
import PatientNote from '../models/PatientNote';
import mongoose from 'mongoose';
import redis from '../utils/redisMock';
import { createHold, releaseHold, isHeldByUser } from '../utils/holdManager';
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
        const { name, email, phone, specialty, fee, availability, isSpecialtyGroup, department, maxAppointmentsPerSlot, doctorsCount, description } = req.body;

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

        const startOfDay = new Date(`${date}T00:00:00+05:30`);
        const endOfDay = new Date(`${date}T23:59:59.999+05:30`);

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
    const { doctorId, hospitalId, slotId, slotTime, bookingRequestId, patientName, patientPhone, patientEmail, patientAge } = req.body;
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

            // Step 2: Check booked_count < max_appointments & active holds
            const userHasHold = await isHeldByUser(slotId.toString(), patientId.toString());

            if (slot.status === 'booked' || slot.booked_count >= maxAppts) {
                throw new Error('SLOT_FULL');
            }

            if (slot.status === 'locked' && !userHasHold) {
                throw new Error('SLOT_ON_HOLD');
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
                tokenNumber,
                patientName,
                patientPhone,
                patientEmail,
                patientAge: patientAge ? Number(patientAge) : undefined
            });

            await appointment.save({ session });

            // Step 4: Increment booked_count atomically only if booked_count < max_appointments and is available/locked
            const updatedSlot = await Slot.findOneAndUpdate(
                { 
                    _id: slotId, 
                    status: { $in: ['available', 'locked'] },
                    booked_count: { $lt: maxAppts } 
                },
                { 
                    $inc: { booked_count: 1, hold_count: userHasHold ? -1 : 0 },
                    $set: { 
                        status: 'booked',
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
                    maxAppointments: maxAppts,
                    status: 'booked'
                });
            }

            try {
                const hospitalDoc = await Hospital.findById(hospitalId);
                const hospitalNameStr = hospitalDoc ? hospitalDoc.name : 'Pillora Hospital';
                // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
                const dateStr = formatDateIST(slotTime);
                const timeSlotStr = formatTimeIST(slotTime);
                
                await sendBookingConfirmationEmail({
                    toEmail: patientEmail,
                    patientName: patientName,
                    hospitalName: hospitalNameStr,
                    date: dateStr,
                    timeSlot: timeSlotStr,
                    bookingId: appointment._id.toString()
                });

                if (hospitalDoc && hospitalDoc.email) {
                    try {
                        await sendHospitalNotificationEmail({
                            hospitalEmail: hospitalDoc.email,
                            hospitalName: hospitalDoc.name,
                            patientName: patientName,
                            patientEmail: patientEmail,
                            patientPhone: patientPhone,
                            date: dateStr,
                            timeSlot: timeSlotStr,
                            bookingId: appointment._id.toString()
                        });
                    } catch (emailError: any) {
                        console.error('Hospital email failed (non-critical):', emailError.message);
                    }
                }
            } catch (emailError: any) {
                console.error('Email failed (non-critical):', emailError.message);
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
        } else if (error.message === 'SLOT_ON_HOLD') {
            res.status(400).json({
                code: 'SLOT_ON_HOLD',
                message: 'This slot is temporarily held by another user. Please choose another slot.'
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

        // Delete associated bookings
        await Appointment.deleteMany({ slot: slot._id });

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

// @desc    Create manual appointment by hospital admin
// @route   POST /api/hospital/appointments/manual
// @access  Private/Hospital
export const createManualAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { patientName, patientEmail, patientPhone, doctorId, slotId, slotTime, notes, paymentStatus } = req.body;

        if (!patientName || !patientEmail || !doctorId || !slotId || !slotTime) {
            res.status(400).json({ message: 'Missing required manual booking fields' });
            return;
        }

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
            const slot = await Slot.findById(slotId).session(session);
            if (!slot) {
                throw new Error('SLOT_NOT_FOUND');
            }

            if (slot.status === 'cancelled') {
                throw new Error('SLOT_CANCELLED');
            }

            const doctor = await Doctor.findById(doctorId).session(session);
            const maxAppts = slot.max_appointments || (doctor?.maxAppointmentsPerSlot) || 1;

            if (slot.booked_count >= maxAppts) {
                throw new Error('SLOT_FULL');
            }

            // Generate Token Number
            const activeAppointmentsCount = await Appointment.countDocuments({
                slot: slotId,
                status: { $ne: 'cancelled' }
            }).session(session);

            const tokenNumber = activeAppointmentsCount + 1;

            const appointment = new Appointment({
                patient: patientId,
                doctor: doctorId,
                hospital: hospital._id,
                slot: slotId,
                slotTime: new Date(slotTime),
                status: 'confirmed',
                paymentStatus: paymentStatus || 'pending',
                notes: notes || '',
                tokenNumber
            });

            await appointment.save({ session });

            // Increment booked_count atomically
            const updatedSlot = await Slot.findOneAndUpdate(
                { 
                    _id: slotId, 
                    booked_count: { $lt: maxAppts } 
                },
                { 
                    $inc: { booked_count: 1 },
                    $set: { 
                        status: (slot.booked_count + 1 >= maxAppts) ? 'booked' : 'available',
                        appointment: appointment._id
                    }
                },
                { session, new: true }
            );

            if (!updatedSlot) {
                throw new Error('SLOT_FULL');
            }

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

        // Delete associated appointments
        await Appointment.deleteMany({ doctor: doctor._id });

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
        const { amount } = req.body;

        const appointment = await Appointment.findOne({ _id: id, hospital: hospital._id }).populate('patient');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

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

        appointment.invoiceUrl = invoiceUrl;
        appointment.paymentStatus = 'paid';
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
            // Find specific booking and then find all other bookings for that patient
            const initialBooking = await Appointment.findOne({ _id: bookingId as string, hospital: hospital._id }).populate('patient');
            if (!initialBooking) {
                res.status(404).json({ message: 'No patient found with this booking ID' });
                return;
            }
            query.patient = initialBooking.patient;
        } else if (name) {
            // Find patients matching the name
            const matchingUsers = await User.find({ name: { $regex: name as string, $options: 'i' } });
            if (!matchingUsers.length) {
                res.status(404).json({ message: 'No patient found with this name' });
                return;
            }
            query.patient = { $in: matchingUsers.map(u => u._id) };
        } else {
            res.status(400).json({ message: 'Provide either bookingId or name to search' });
            return;
        }

        const appointments = await Appointment.find(query)
            .populate('patient')
            .populate('doctor', 'name specialty')
            .sort({ bookingDate: -1 });

        if (!appointments.length) {
            res.status(404).json({ message: 'No matching appointments found' });
            return;
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
            patientData.totalVisits += 1;
            
            // Adjust dates
            if (new Date(appt.bookingDate) < new Date(patientData.patientInfo.firstVisit)) {
                patientData.patientInfo.firstVisit = appt.bookingDate;
            }
            if (new Date(appt.bookingDate) > new Date(patientData.patientInfo.lastVisit)) {
                patientData.patientInfo.lastVisit = appt.bookingDate;
            }

            // In our system, the amount paid might be in the invoice, or if fee is on slot. 
            // We'll just sum up if paymentStatus is paid. (Mock fee or actual fee).
            // Usually consulting fee is attached to doctor or slot. We will add 0 for now unless we have fee logic.
            // Wait, we can extract amount from invoice logic or just assume 500 for paid
            const mockFee = appt.paymentStatus === 'paid' ? 500 : 0; // Assuming 500 or adjust if you have a fee field
            patientData.patientInfo.totalSpent += mockFee;

            patientData.bookings.push(appt);
        }

        const results = Array.from(patientsMap.values());
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ message: 'Error searching patients', error: error.message });
    }
};

// @desc    Upload Prescription PDF
// @route   POST /api/hospital/dashboard/appointments/:id/prescription
export const uploadAppointmentPrescription = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const { id } = req.params;

        if (!req.file) {
            res.status(400).json({ message: 'No PDF file uploaded' });
            return;
        }

        if (req.file.mimetype !== 'application/pdf') {
            res.status(400).json({ message: 'Only PDF files are allowed' });
            return;
        }

        const appointment = await Appointment.findOne({ _id: id, hospital: hospital._id }).populate('patient');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        // Check first 4 bytes — valid PDF starts with %PDF
        const header = req.file.buffer.subarray(0, 4).toString();
        if (header !== '%PDF') {
            res.status(400).json({ message: 'File is not a valid PDF — header check failed' });
            return;
        }

        // Convert buffer to base64
        const base64File = req.file.buffer.toString('base64');
        const dataUri = `data:${req.file.mimetype};base64,${base64File}`;

        // If prescription already exists delete old one from Cloudinary first
        if (appointment.prescriptionUrl) {
            try {
                const oldPublicId = appointment.prescriptionUrl
                    .split('/').slice(-2).join('/')  // extract folder/filename
                    .replace('.pdf', '');            // remove extension
                await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'raw' });
                console.log('Old prescription deleted from Cloudinary');
            } catch (err: any) {
                console.error('Could not delete old prescription:', err.message);
            }
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataUri, {
            resource_type: 'raw',
            upload_preset: 'pillora-uploads',
            folder: 'pillora-prescriptions',
            access_mode: 'public',
            type: 'upload',
            format: 'pdf',
            public_id: `prescription-${appointment._id}`,
            use_filename: false,
            unique_filename: true
        });

        console.log('Prescription URL:', result.secure_url);
        // Must contain /raw/upload/ not /image/upload/

        let prescriptionUrl = result.secure_url;
        if (!prescriptionUrl.endsWith('.pdf')) {
            prescriptionUrl += '.pdf';
        }

        appointment.prescriptionUrl = prescriptionUrl;
        appointment.prescriptionUploadedAt = new Date();
        await appointment.save();

        const patientEmail = (appointment.patient as any)?.email || appointment.patientEmail;
        const patientName = (appointment.patient as any)?.name || appointment.patientName || 'Patient';

        if (patientEmail) {
            try {
                // Add fl_attachment to force download as PDF in email
                const downloadUrl = appointment.prescriptionUrl.includes('/raw/upload/')
                    ? appointment.prescriptionUrl.replace('/raw/upload/', '/raw/upload/fl_attachment:prescription/')
                    : appointment.prescriptionUrl;

                await sendPrescriptionEmail({
                    toEmail: patientEmail,
                    patientName: patientName,
                    hospitalName: hospital.name,
                    prescriptionUrl: downloadUrl,
                    // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
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
        const hospital = (req as any).hospital;
        const { id } = req.params;

        const appointment = await Appointment.findOne({ _id: id, hospital: hospital._id });
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }

        if (!appointment.prescriptionUrl) {
            res.status(404).json({ message: 'Prescription not uploaded yet' });
            return;
        }

        // Redirect to Cloudinary URL directly
        res.setHeader('Content-Type', 'application/pdf');
        res.redirect(appointment.prescriptionUrl);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching prescription', error: error.message });
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
        const patients = await User.find({
            _id: { $in: bookingPatientIds },
            name: { $regex: query, $options: 'i' }
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
