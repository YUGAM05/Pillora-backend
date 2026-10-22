import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import FollowUpReminder from '../models/FollowUpReminder';
import Appointment from '../models/Appointment';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import { calculateReminderDate, dispatchFollowUpReminder } from '../services/followUpService';

// Helper for start and end of current day in IST
const getTodayISTBounds = () => {
    const now = new Date();
    // Offset +5.5 hours for IST
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    const startOfTodayIST = new Date(Date.UTC(
        istTime.getUTCFullYear(),
        istTime.getUTCMonth(),
        istTime.getUTCDate(),
        0, 0, 0, 0
    ));
    // Subtract offset back to get UTC timestamp corresponding to 00:00 IST
    const startOfToday = new Date(startOfTodayIST.getTime() - istOffset);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

    return { startOfToday, endOfToday };
};

/**
 * @desc    Get all follow-up reminders for a hospital with filters & status counts
 * @route   GET /api/hospital/dashboard/follow-ups
 */
export const getFollowUpReminders = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }

        const { tab = 'all', search, channel, doctorId, startDate, endDate } = req.query;
        const { startOfToday, endOfToday } = getTodayISTBounds();

        // 1. Calculate overall counts for all tabs
        const [totalCount, upcomingCount, todayCount, sentCount, failedCount, cancelledCount] = await Promise.all([
            FollowUpReminder.countDocuments({ hospital: hospital._id }),
            FollowUpReminder.countDocuments({
                hospital: hospital._id,
                status: 'scheduled',
                followUpDate: { $gte: startOfToday }
            }),
            FollowUpReminder.countDocuments({
                hospital: hospital._id,
                reminderDate: { $gte: startOfToday, $lte: endOfToday }
            }),
            FollowUpReminder.countDocuments({ hospital: hospital._id, status: 'sent' }),
            FollowUpReminder.countDocuments({ hospital: hospital._id, status: 'failed' }),
            FollowUpReminder.countDocuments({ hospital: hospital._id, status: 'cancelled' })
        ]);

        // 2. Build filtered query
        const query: any = { hospital: hospital._id };

        if (tab === 'upcoming') {
            query.status = 'scheduled';
            query.followUpDate = { $gte: startOfToday };
        } else if (tab === 'today') {
            query.reminderDate = { $gte: startOfToday, $lte: endOfToday };
        } else if (tab === 'sent') {
            query.status = 'sent';
        } else if (tab === 'failed') {
            query.status = 'failed';
        } else if (tab === 'cancelled') {
            query.status = 'cancelled';
        }

        if (channel && channel !== 'all') {
            query.channel = channel;
        }

        if (doctorId && doctorId !== 'all') {
            query.doctor = doctorId;
        }

        if (startDate && endDate) {
            query.followUpDate = {
                $gte: new Date(startDate as string),
                $lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999))
            };
        }

        if (search) {
            const regex = new RegExp(search as string, 'i');
            query.$or = [
                { patientName: regex },
                { patientPhone: regex },
                { doctorName: regex },
                { reason: regex },
                { department: regex }
            ];
        }

        const reminders = await FollowUpReminder.find(query)
            .sort({ followUpDate: 1, reminderDate: 1 })
            .populate('doctor', 'name specialty department')
            .populate('originalAppointment', 'bookingDate status slotTime tokenNumber')
            .populate('followUpAppointment', 'bookingDate status slotTime tokenNumber');

        res.json({
            success: true,
            reminders,
            stats: {
                total: totalCount,
                upcoming: upcomingCount,
                today: todayCount,
                sent: sentCount,
                failed: failedCount,
                cancelled: cancelledCount
            }
        });
    } catch (error: any) {
        console.error('[getFollowUpReminders Error]:', error);
        res.status(500).json({ message: 'Error fetching follow-up reminders', error: error.message });
    }
};

/**
 * @desc    Create a new follow-up reminder
 * @route   POST /api/hospital/dashboard/follow-ups
 */
export const createFollowUpReminder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }

        const {
            patientName,
            patientPhone,
            patientEmail,
            originalAppointmentId,
            doctorId,
            doctorName: customDocName,
            department,
            followUpDate,
            followUpTime,
            reason,
            reminderTiming = '1_day_before',
            customReminderDate,
            channel = 'whatsapp',
            isConfirmedBooking = false,
            notes
        } = req.body;

        // Validation
        if (!patientName || !patientName.trim()) {
            res.status(400).json({ message: 'Patient name is required' });
            return;
        }

        if (!patientPhone || patientPhone.replace(/\D/g, '').length < 10) {
            res.status(400).json({ message: 'Valid 10-digit mobile number is required' });
            return;
        }

        if (!followUpDate) {
            res.status(400).json({ message: 'Follow-up date is required' });
            return;
        }

        const parsedFollowUpDate = new Date(followUpDate);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (parsedFollowUpDate < startOfToday) {
            res.status(400).json({ message: 'Follow-up date must be today or in the future' });
            return;
        }

        // Resolve doctor name
        let resolvedDoctorName = customDocName || 'Consultant Doctor';
        let resolvedDoctorId = undefined;
        let resolvedDept = department;

        if (doctorId) {
            const doc = await Doctor.findById(doctorId);
            if (doc) {
                resolvedDoctorName = doc.name;
                resolvedDoctorId = doc._id;
                if (!resolvedDept) resolvedDept = doc.department || doc.specialty;
            }
        }

        // Calculate reminder date automatically based on timing preference
        const calculatedReminderDate = calculateReminderDate(
            parsedFollowUpDate,
            reminderTiming,
            customReminderDate
        );

        const reminder = await FollowUpReminder.create({
            hospital: hospital._id,
            hospitalName: hospital.name,
            patientName: patientName.trim(),
            patientPhone: patientPhone.trim(),
            patientEmail: patientEmail?.trim() || undefined,
            originalAppointment: originalAppointmentId || undefined,
            doctor: resolvedDoctorId,
            doctorName: resolvedDoctorName,
            department: resolvedDept,
            followUpDate: parsedFollowUpDate,
            followUpTime: followUpTime || undefined,
            reason: reason?.trim() || undefined,
            reminderTiming,
            reminderDate: calculatedReminderDate,
            channel,
            status: 'scheduled',
            isConfirmedBooking: Boolean(isConfirmedBooking),
            notes: notes?.trim() || undefined,
            createdBy: req.user?._id
        });

        // Real-time socket emission if available
        const io = req.app.get('io');
        if (io) {
            io.emit('followUpReminderCreated', { hospitalId: hospital._id, reminder });
        }

        res.status(201).json({
            success: true,
            message: 'Follow-up reminder scheduled successfully',
            reminder
        });
    } catch (error: any) {
        console.error('[createFollowUpReminder Error]:', error);
        res.status(500).json({ message: 'Error scheduling follow-up reminder', error: error.message });
    }
};

/**
 * @desc    Get a single follow-up reminder
 * @route   GET /api/hospital/dashboard/follow-ups/:id
 */
export const getFollowUpReminderById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const reminder = await FollowUpReminder.findOne({
            _id: req.params.id,
            hospital: hospital._id
        }).populate('doctor').populate('originalAppointment').populate('followUpAppointment');

        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }

        res.json({ success: true, reminder });
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching reminder', error: error.message });
    }
};

/**
 * @desc    Update / Reschedule a follow-up reminder
 * @route   PUT /api/hospital/dashboard/follow-ups/:id
 */
export const updateFollowUpReminder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const reminder = await FollowUpReminder.findOne({
            _id: req.params.id,
            hospital: hospital._id
        });

        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }

        const {
            patientName,
            patientPhone,
            patientEmail,
            doctorId,
            doctorName,
            department,
            followUpDate,
            followUpTime,
            reason,
            reminderTiming,
            customReminderDate,
            channel,
            isConfirmedBooking,
            notes
        } = req.body;

        if (patientName) reminder.patientName = patientName.trim();
        if (patientPhone) reminder.patientPhone = patientPhone.trim();
        if (patientEmail !== undefined) reminder.patientEmail = patientEmail?.trim() || undefined;
        if (doctorName) reminder.doctorName = doctorName.trim();
        if (department !== undefined) reminder.department = department?.trim();
        if (followUpTime !== undefined) reminder.followUpTime = followUpTime;
        if (reason !== undefined) reminder.reason = reason?.trim();
        if (channel) reminder.channel = channel;
        if (isConfirmedBooking !== undefined) reminder.isConfirmedBooking = Boolean(isConfirmedBooking);
        if (notes !== undefined) reminder.notes = notes?.trim();

        if (doctorId) {
            const doc = await Doctor.findById(doctorId);
            if (doc) {
                reminder.doctor = doc._id;
                reminder.doctorName = doc.name;
                if (!department) reminder.department = doc.department || doc.specialty;
            }
        }

        let dateChanged = false;
        if (followUpDate) {
            const newDate = new Date(followUpDate);
            if (newDate.getTime() !== reminder.followUpDate.getTime()) {
                reminder.followUpDate = newDate;
                dateChanged = true;
            }
        }

        if (reminderTiming) {
            reminder.reminderTiming = reminderTiming;
            dateChanged = true;
        }

        // Recalculate reminderDate if follow-up date or timing changed
        if (dateChanged) {
            reminder.reminderDate = calculateReminderDate(
                reminder.followUpDate,
                reminder.reminderTiming,
                customReminderDate
            );
            // If it was failed, allow it to be re-attempted
            if (reminder.status === 'failed') {
                reminder.status = 'scheduled';
                reminder.failureReason = undefined;
            }
        }

        await reminder.save();

        res.json({
            success: true,
            message: 'Follow-up reminder updated successfully',
            reminder
        });
    } catch (error: any) {
        console.error('[updateFollowUpReminder Error]:', error);
        res.status(500).json({ message: 'Error updating reminder', error: error.message });
    }
};

/**
 * @desc    Cancel a follow-up reminder
 * @route   PUT /api/hospital/dashboard/follow-ups/:id/cancel
 */
export const cancelFollowUpReminder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const reminder = await FollowUpReminder.findOne({
            _id: req.params.id,
            hospital: hospital._id
        });

        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }

        reminder.status = 'cancelled';
        await reminder.save();

        res.json({
            success: true,
            message: 'Follow-up reminder cancelled successfully',
            reminder
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error cancelling reminder', error: error.message });
    }
};

/**
 * @desc    Retry sending a failed follow-up reminder immediately
 * @route   POST /api/hospital/dashboard/follow-ups/:id/retry
 */
export const retryFollowUpReminder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const reminder = await FollowUpReminder.findOne({
            _id: req.params.id,
            hospital: hospital._id
        });

        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }

        // Reset to scheduled and dispatch immediately
        reminder.status = 'scheduled';
        await reminder.save();

        const dispatchResult = await dispatchFollowUpReminder(reminder._id.toString());
        const updated = await FollowUpReminder.findById(reminder._id);

        if (dispatchResult.success) {
            res.json({
                success: true,
                message: 'Reminder notification delivered successfully',
                reminder: updated
            });
        } else {
            res.status(500).json({
                success: false,
                message: `Failed to deliver reminder: ${dispatchResult.error}`,
                reminder: updated
            });
        }
    } catch (error: any) {
        res.status(500).json({ message: 'Error retrying reminder', error: error.message });
    }
};

/**
 * @desc    Convert recommended follow-up into a confirmed appointment
 * @route   POST /api/hospital/dashboard/follow-ups/:id/convert-booking
 */
export const convertFollowUpToBooking = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        const reminder = await FollowUpReminder.findOne({
            _id: req.params.id,
            hospital: hospital._id
        });

        if (!reminder) {
            res.status(404).json({ message: 'Follow-up reminder not found' });
            return;
        }

        const { appointmentId, slotId, slotTime } = req.body;

        if (appointmentId) {
            // Link an already booked appointment
            const appt = await Appointment.findById(appointmentId);
            if (!appt) {
                res.status(404).json({ message: 'Appointment not found' });
                return;
            }
            reminder.followUpAppointment = appt._id;
            reminder.isConfirmedBooking = true;
            await reminder.save();

            res.json({
                success: true,
                message: 'Follow-up linked to confirmed appointment successfully',
                reminder
            });
            return;
        }

        // If creating a direct walk-in / confirmed appointment without slot requirements
        const bookingTime = slotTime ? new Date(slotTime) : new Date(reminder.followUpDate);
        
        let targetSlotId = slotId;
        if (!targetSlotId) {
            // Find or create a slot for this time if needed, or link to dummy slot
            const existingSlot = await Slot.findOne({
                hospital: hospital._id,
                startTime: { $lte: bookingTime },
                endTime: { $gte: bookingTime }
            });
            targetSlotId = existingSlot?._id;
        }

        reminder.isConfirmedBooking = true;
        await reminder.save();

        res.json({
            success: true,
            message: 'Follow-up converted to confirmed status successfully',
            reminder
        });
    } catch (error: any) {
        console.error('[convertFollowUpToBooking Error]:', error);
        res.status(500).json({ message: 'Error converting follow-up to booking', error: error.message });
    }
};
