"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertFollowUpToBooking = exports.retryFollowUpReminder = exports.cancelFollowUpReminder = exports.updateFollowUpReminder = exports.getFollowUpReminderById = exports.createFollowUpReminder = exports.getFollowUpReminders = void 0;
const FollowUpReminder_1 = __importDefault(require("../models/FollowUpReminder"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Slot_1 = __importDefault(require("../models/Slot"));
const followUpService_1 = require("../services/followUpService");
// Helper for start and end of current day in IST
const getTodayISTBounds = () => {
    const now = new Date();
    // Offset +5.5 hours for IST
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const startOfTodayIST = new Date(Date.UTC(istTime.getUTCFullYear(), istTime.getUTCMonth(), istTime.getUTCDate(), 0, 0, 0, 0));
    // Subtract offset back to get UTC timestamp corresponding to 00:00 IST
    const startOfToday = new Date(startOfTodayIST.getTime() - istOffset);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { startOfToday, endOfToday };
};
/**
 * @desc    Get all follow-up reminders for a hospital with filters & status counts
 * @route   GET /api/hospital/dashboard/follow-ups
 */
const getFollowUpReminders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const { tab = 'all', search, channel, doctorId, startDate, endDate } = req.query;
        const { startOfToday, endOfToday } = getTodayISTBounds();
        // 1. Calculate overall counts for all tabs
        const [totalCount, upcomingCount, todayCount, sentCount, failedCount, cancelledCount] = yield Promise.all([
            FollowUpReminder_1.default.countDocuments({ hospital: hospital._id }),
            FollowUpReminder_1.default.countDocuments({
                hospital: hospital._id,
                status: 'scheduled',
                followUpDate: { $gte: startOfToday }
            }),
            FollowUpReminder_1.default.countDocuments({
                hospital: hospital._id,
                reminderDate: { $gte: startOfToday, $lte: endOfToday }
            }),
            FollowUpReminder_1.default.countDocuments({ hospital: hospital._id, status: 'sent' }),
            FollowUpReminder_1.default.countDocuments({ hospital: hospital._id, status: 'failed' }),
            FollowUpReminder_1.default.countDocuments({ hospital: hospital._id, status: 'cancelled' })
        ]);
        // 2. Build filtered query
        const query = { hospital: hospital._id };
        if (tab === 'upcoming') {
            query.status = 'scheduled';
            query.followUpDate = { $gte: startOfToday };
        }
        else if (tab === 'today') {
            query.reminderDate = { $gte: startOfToday, $lte: endOfToday };
        }
        else if (tab === 'sent') {
            query.status = 'sent';
        }
        else if (tab === 'failed') {
            query.status = 'failed';
        }
        else if (tab === 'cancelled') {
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
                $gte: new Date(startDate),
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            };
        }
        if (search) {
            const regex = new RegExp(search, 'i');
            query.$or = [
                { patientName: regex },
                { patientPhone: regex },
                { doctorName: regex },
                { reason: regex },
                { department: regex }
            ];
        }
        const reminders = yield FollowUpReminder_1.default.find(query)
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
    }
    catch (error) {
        console.error('[getFollowUpReminders Error]:', error);
        res.status(500).json({ message: 'Error fetching follow-up reminders', error: error.message });
    }
});
exports.getFollowUpReminders = getFollowUpReminders;
/**
 * @desc    Create a new follow-up reminder
 * @route   POST /api/hospital/dashboard/follow-ups
 */
const createFollowUpReminder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const { patientName, patientPhone, patientEmail, originalAppointmentId, doctorId, doctorName: customDocName, department, followUpDate, followUpTime, reason, reminderTiming = '1_day_before', customReminderDate, channel = 'whatsapp', isConfirmedBooking = false, notes } = req.body;
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
            const doc = yield Doctor_1.default.findById(doctorId);
            if (doc) {
                resolvedDoctorName = doc.name;
                resolvedDoctorId = doc._id;
                if (!resolvedDept)
                    resolvedDept = doc.department || doc.specialty;
            }
        }
        // Calculate reminder date automatically based on timing preference
        const calculatedReminderDate = (0, followUpService_1.calculateReminderDate)(parsedFollowUpDate, reminderTiming, customReminderDate);
        const reminder = yield FollowUpReminder_1.default.create({
            hospital: hospital._id,
            hospitalName: hospital.name,
            patientName: patientName.trim(),
            patientPhone: patientPhone.trim(),
            patientEmail: (patientEmail === null || patientEmail === void 0 ? void 0 : patientEmail.trim()) || undefined,
            originalAppointment: originalAppointmentId || undefined,
            doctor: resolvedDoctorId,
            doctorName: resolvedDoctorName,
            department: resolvedDept,
            followUpDate: parsedFollowUpDate,
            followUpTime: followUpTime || undefined,
            reason: (reason === null || reason === void 0 ? void 0 : reason.trim()) || undefined,
            reminderTiming,
            reminderDate: calculatedReminderDate,
            channel,
            status: 'scheduled',
            isConfirmedBooking: Boolean(isConfirmedBooking),
            notes: (notes === null || notes === void 0 ? void 0 : notes.trim()) || undefined,
            createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id
        });
        // Real-time socket emission if available
        const io = req.app.get('io');
        if (io) {
            io.emit('followUpReminderCreated', { hospitalId: hospital._id, reminder });
        }
        // If the reminder is scheduled for right now or is immediately due, dispatch without waiting for cron
        if (calculatedReminderDate.getTime() <= Date.now() + 60 * 1000) {
            (0, followUpService_1.dispatchFollowUpReminder)(reminder._id.toString()).catch(err => {
                console.error(`[createFollowUpReminder] Immediate dispatch error for ${reminder._id}:`, err.message || err);
            });
        }
        res.status(201).json({
            success: true,
            message: 'Follow-up reminder scheduled successfully',
            reminder
        });
    }
    catch (error) {
        console.error('[createFollowUpReminder Error]:', error);
        res.status(500).json({ message: 'Error scheduling follow-up reminder', error: error.message });
    }
});
exports.createFollowUpReminder = createFollowUpReminder;
/**
 * @desc    Get a single follow-up reminder
 * @route   GET /api/hospital/dashboard/follow-ups/:id
 */
const getFollowUpReminderById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const reminder = yield FollowUpReminder_1.default.findOne({
            _id: req.params.id,
            hospital: hospital._id
        }).populate('doctor').populate('originalAppointment').populate('followUpAppointment');
        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }
        res.json({ success: true, reminder });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching reminder', error: error.message });
    }
});
exports.getFollowUpReminderById = getFollowUpReminderById;
/**
 * @desc    Update / Reschedule a follow-up reminder
 * @route   PUT /api/hospital/dashboard/follow-ups/:id
 */
const updateFollowUpReminder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const reminder = yield FollowUpReminder_1.default.findOne({
            _id: req.params.id,
            hospital: hospital._id
        });
        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }
        const { patientName, patientPhone, patientEmail, doctorId, doctorName, department, followUpDate, followUpTime, reason, reminderTiming, customReminderDate, channel, isConfirmedBooking, notes } = req.body;
        if (patientName)
            reminder.patientName = patientName.trim();
        if (patientPhone)
            reminder.patientPhone = patientPhone.trim();
        if (patientEmail !== undefined)
            reminder.patientEmail = (patientEmail === null || patientEmail === void 0 ? void 0 : patientEmail.trim()) || undefined;
        if (doctorName)
            reminder.doctorName = doctorName.trim();
        if (department !== undefined)
            reminder.department = department === null || department === void 0 ? void 0 : department.trim();
        if (followUpTime !== undefined)
            reminder.followUpTime = followUpTime;
        if (reason !== undefined)
            reminder.reason = reason === null || reason === void 0 ? void 0 : reason.trim();
        if (channel)
            reminder.channel = channel;
        if (isConfirmedBooking !== undefined)
            reminder.isConfirmedBooking = Boolean(isConfirmedBooking);
        if (notes !== undefined)
            reminder.notes = notes === null || notes === void 0 ? void 0 : notes.trim();
        if (doctorId) {
            const doc = yield Doctor_1.default.findById(doctorId);
            if (doc) {
                reminder.doctor = doc._id;
                reminder.doctorName = doc.name;
                if (!department)
                    reminder.department = doc.department || doc.specialty;
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
        if (reminderTiming && reminderTiming !== reminder.reminderTiming) {
            reminder.reminderTiming = reminderTiming;
            dateChanged = true;
        }
        if (customReminderDate) {
            dateChanged = true;
        }
        // Recalculate reminderDate if follow-up date, timing, or custom time changed
        if (dateChanged) {
            reminder.reminderDate = (0, followUpService_1.calculateReminderDate)(reminder.followUpDate, reminder.reminderTiming, customReminderDate);
            // If it was failed, allow it to be re-attempted
            if (reminder.status === 'failed') {
                reminder.status = 'scheduled';
                reminder.failureReason = undefined;
            }
        }
        yield reminder.save();
        // If scheduled and already due, dispatch immediately
        if (reminder.status === 'scheduled' && reminder.reminderDate.getTime() <= Date.now() + 60 * 1000) {
            (0, followUpService_1.dispatchFollowUpReminder)(reminder._id.toString()).catch(err => {
                console.error(`[updateFollowUpReminder] Immediate dispatch error for ${reminder._id}:`, err.message || err);
            });
        }
        res.json({
            success: true,
            message: 'Follow-up reminder updated successfully',
            reminder
        });
    }
    catch (error) {
        console.error('[updateFollowUpReminder Error]:', error);
        res.status(500).json({ message: 'Error updating reminder', error: error.message });
    }
});
exports.updateFollowUpReminder = updateFollowUpReminder;
/**
 * @desc    Cancel a follow-up reminder
 * @route   PUT /api/hospital/dashboard/follow-ups/:id/cancel
 */
const cancelFollowUpReminder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const reminder = yield FollowUpReminder_1.default.findOne({
            _id: req.params.id,
            hospital: hospital._id
        });
        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }
        reminder.status = 'cancelled';
        yield reminder.save();
        res.json({
            success: true,
            message: 'Follow-up reminder cancelled successfully',
            reminder
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error cancelling reminder', error: error.message });
    }
});
exports.cancelFollowUpReminder = cancelFollowUpReminder;
/**
 * @desc    Retry sending a failed follow-up reminder immediately
 * @route   POST /api/hospital/dashboard/follow-ups/:id/retry
 */
const retryFollowUpReminder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const reminder = yield FollowUpReminder_1.default.findOne({
            _id: req.params.id,
            hospital: hospital._id
        });
        if (!reminder) {
            res.status(404).json({ message: 'Reminder not found' });
            return;
        }
        // Reset to scheduled and dispatch immediately
        reminder.status = 'scheduled';
        yield reminder.save();
        const dispatchResult = yield (0, followUpService_1.dispatchFollowUpReminder)(reminder._id.toString());
        const updated = yield FollowUpReminder_1.default.findById(reminder._id);
        if (dispatchResult.success) {
            res.json({
                success: true,
                message: 'Reminder notification delivered successfully',
                reminder: updated
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: `Failed to deliver reminder: ${dispatchResult.error}`,
                reminder: updated
            });
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Error retrying reminder', error: error.message });
    }
});
exports.retryFollowUpReminder = retryFollowUpReminder;
/**
 * @desc    Convert recommended follow-up into a confirmed appointment
 * @route   POST /api/hospital/dashboard/follow-ups/:id/convert-booking
 */
const convertFollowUpToBooking = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const reminder = yield FollowUpReminder_1.default.findOne({
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
            const appt = yield Appointment_1.default.findById(appointmentId);
            if (!appt) {
                res.status(404).json({ message: 'Appointment not found' });
                return;
            }
            reminder.followUpAppointment = appt._id;
            reminder.isConfirmedBooking = true;
            yield reminder.save();
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
            const existingSlot = yield Slot_1.default.findOne({
                hospital: hospital._id,
                startTime: { $lte: bookingTime },
                endTime: { $gte: bookingTime }
            });
            targetSlotId = existingSlot === null || existingSlot === void 0 ? void 0 : existingSlot._id;
        }
        reminder.isConfirmedBooking = true;
        yield reminder.save();
        res.json({
            success: true,
            message: 'Follow-up converted to confirmed status successfully',
            reminder
        });
    }
    catch (error) {
        console.error('[convertFollowUpToBooking Error]:', error);
        res.status(500).json({ message: 'Error converting follow-up to booking', error: error.message });
    }
});
exports.convertFollowUpToBooking = convertFollowUpToBooking;
