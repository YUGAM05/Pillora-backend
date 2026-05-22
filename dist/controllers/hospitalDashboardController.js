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
exports.deleteDoctor = exports.createManualAppointment = exports.releaseSlotHold = exports.holdSlot = exports.deleteSlot = exports.cancelSlot = exports.addSingleSlot = exports.getHospitalSlots = exports.getMyBookings = exports.createAppointment = exports.getDoctorSlots = exports.updateAppointmentStatus = exports.getHospitalAppointments = exports.bulkGenerateSlots = exports.updateDoctor = exports.addDoctor = exports.getHospitalDoctors = exports.getHospitalStats = void 0;
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const User_1 = __importDefault(require("../models/User"));
const mongoose_1 = __importDefault(require("mongoose"));
const redisMock_1 = __importDefault(require("../utils/redisMock"));
const holdManager_1 = require("../utils/holdManager");
// @desc    Get hospital dashboard stats
// @route   GET /api/hospital/dashboard/stats
// @access  Private/Hospital
const getHospitalStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const doctorCount = yield Doctor_1.default.countDocuments({ hospital: hospital._id });
        const appointmentCount = yield Appointment_1.default.countDocuments({ hospital: hospital._id });
        const pendingAppointments = yield Appointment_1.default.countDocuments({ hospital: hospital._id, status: 'pending' });
        const recentAppointments = yield Appointment_1.default.find({ hospital: hospital._id })
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
});
exports.getHospitalStats = getHospitalStats;
// @desc    Get all doctors for a hospital
// @route   GET /api/hospital/doctors
const getHospitalDoctors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const doctors = yield Doctor_1.default.find({ hospital: hospital._id });
        res.json(doctors);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching doctors', error: error.message });
    }
});
exports.getHospitalDoctors = getHospitalDoctors;
// @desc    Add a doctor or specialty group (Self-Managed only)
// @route   POST /api/hospital/doctors
const addDoctor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { name, specialty, fee, availability, isSpecialtyGroup, department, maxAppointmentsPerSlot, doctorsCount, description } = req.body;
        const doctor = yield Doctor_1.default.create({
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error adding doctor', error: error.message });
    }
});
exports.addDoctor = addDoctor;
// @desc    Update doctor or specialty group (Self-Managed only)
// @route   PUT /api/hospital/doctors/:id
const updateDoctor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const updateData = Object.assign({}, req.body);
        if (updateData.fee !== undefined)
            updateData.fee = Number(updateData.fee);
        if (updateData.maxAppointmentsPerSlot !== undefined)
            updateData.maxAppointmentsPerSlot = Number(updateData.maxAppointmentsPerSlot);
        if (updateData.doctorsCount !== undefined)
            updateData.doctorsCount = Number(updateData.doctorsCount);
        if (updateData.isSpecialtyGroup !== undefined)
            updateData.isSpecialtyGroup = Boolean(updateData.isSpecialtyGroup);
        if (updateData.is_active !== undefined)
            updateData.is_active = Boolean(updateData.is_active);
        const doctor = yield Doctor_1.default.findOneAndUpdate({ _id: id, hospital: hospital._id }, updateData, { new: true });
        if (!doctor) {
            res.status(404).json({ message: 'Doctor or Specialty Group not found' });
            return;
        }
        res.json(doctor);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating doctor', error: error.message });
    }
});
exports.updateDoctor = updateDoctor;
// @desc    Bulk Generate Slots
// @route   POST /api/hospital/slots/generate
const bulkGenerateSlots = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
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
        const existingSlots = yield Slot_1.default.countDocuments({
            doctor: doctorId,
            startTime: { $gte: start, $lt: end }
        });
        if (existingSlots > 0) {
            res.status(400).json({ message: 'Slots have already been generated for this doctor within this time range.' });
            return;
        }
        // Get maxAppointmentsPerSlot from Doctor model
        const doctorDoc = yield Doctor_1.default.findById(doctorId);
        const maxAppts = (doctorDoc === null || doctorDoc === void 0 ? void 0 : doctorDoc.maxAppointmentsPerSlot) || 1;
        const slots = [];
        let current = new Date(start);
        while (current < end) {
            const next = new Date(current.getTime() + durationMinutes * 60000);
            if (next > end)
                break;
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
            yield Slot_1.default.insertMany(slots);
            // Emit socket event for real-time update
            const io = req.app.get('io');
            if (io) {
                io.emit('slotsUpdated', { doctorId, date });
            }
        }
        res.status(201).json({ message: `Successfully generated ${slots.length} slots`, count: slots.length });
    }
    catch (error) {
        res.status(500).json({ message: 'Error generating slots', error: error.message });
    }
});
exports.bulkGenerateSlots = bulkGenerateSlots;
// @desc    Get appointments for hospital
// @route   GET /api/hospital/appointments
const getHospitalAppointments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const appointments = yield Appointment_1.default.find({ hospital: hospital._id })
            .populate('patient', 'name email phone')
            .populate('doctor', 'name specialty')
            .populate('slot', 'startTime endTime')
            .sort({ slotTime: 1 });
        res.json(appointments);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching appointments', error: error.message });
    }
});
exports.getHospitalAppointments = getHospitalAppointments;
// @desc    Update Appointment Status
// @route   PUT /api/hospital/appointments/:id/status
const updateAppointmentStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { status } = req.body;
        const appointment = yield Appointment_1.default.findOneAndUpdate({ _id: req.params.id, hospital: hospital._id }, { status }, { new: true });
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }
        res.json(appointment);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating appointment', error: error.message });
    }
});
exports.updateAppointmentStatus = updateAppointmentStatus;
// @desc    Get slots for a doctor on a specific date
// @route   GET /api/hospital/dashboard/doctors/:id/slots
const getDoctorSlots = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { date } = req.query;
        if (!date) {
            res.status(400).json({ message: 'Date is required' });
            return;
        }
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const slots = yield Slot_1.default.find({
            doctor: id,
            startTime: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ startTime: 1 });
        res.json(slots);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching slots', error: error.message });
    }
});
exports.getDoctorSlots = getDoctorSlots;
// @desc    Create appointment (Book slot with Transaction & SELECT FOR UPDATE protection)
// @route   POST /api/hospital/dashboard/appointments
const createAppointment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { doctorId, hospitalId, slotId, slotTime, bookingRequestId, patientName, patientPhone, patientEmail, patientAge } = req.body;
    const patientId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id);
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
        const existingActiveBooking = yield Appointment_1.default.findOne({
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
            const existingKey = yield redisMock_1.default.get(idempotencyKey);
            if (existingKey) {
                res.status(409).json({
                    code: 'DUPLICATE_SUBMISSION',
                    message: 'Your booking is already being processed. Please wait.'
                });
                return;
            }
            // Set idempotency lock for 10 seconds
            yield redisMock_1.default.setex(idempotencyKey, 10, 'processing');
        }
        // Start MongoDB Session for Transaction
        const session = yield mongoose_1.default.startSession();
        session.startTransaction();
        try {
            // Step 1: Lock the slot row (SELECT FOR UPDATE row-level locking equivalent)
            const slot = yield Slot_1.default.findById(slotId).session(session);
            if (!slot) {
                throw new Error('SLOT_NOT_FOUND');
            }
            if (slot.status === 'cancelled') {
                throw new Error('SLOT_CANCELLED');
            }
            // Resolve max appointments
            const doctor = yield Doctor_1.default.findById(doctorId).session(session);
            const maxAppts = slot.max_appointments || (doctor === null || doctor === void 0 ? void 0 : doctor.maxAppointmentsPerSlot) || 1;
            // Step 2: Check booked_count < max_appointments & active holds
            const userHasHold = yield (0, holdManager_1.isHeldByUser)(slotId.toString(), patientId.toString());
            if (slot.status === 'booked' || slot.booked_count >= maxAppts) {
                throw new Error('SLOT_FULL');
            }
            if (slot.status === 'locked' && !userHasHold) {
                throw new Error('SLOT_ON_HOLD');
            }
            // Step 3: Insert appointment record (Generate unique token number as Step 5)
            const activeAppointmentsCount = yield Appointment_1.default.countDocuments({
                slot: slotId,
                status: { $ne: 'cancelled' }
            }).session(session);
            // Step 5: Generate unique token number
            const tokenNumber = activeAppointmentsCount + 1;
            const appointment = new Appointment_1.default({
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
            yield appointment.save({ session });
            // Step 4: Increment booked_count atomically only if booked_count < max_appointments and is available/locked
            const updatedSlot = yield Slot_1.default.findOneAndUpdate({
                _id: slotId,
                status: { $in: ['available', 'locked'] },
                booked_count: { $lt: maxAppts }
            }, {
                $inc: { booked_count: 1, hold_count: userHasHold ? -1 : 0 },
                $set: {
                    status: 'booked',
                    appointment: appointment._id
                }
            }, { session, new: true });
            if (!updatedSlot) {
                throw new Error('SLOT_FULL'); // If 0 rows affected, reject with SLOT_FULL
            }
            // Step 6: Commit transaction
            yield session.commitTransaction();
            session.endSession();
            // Release the temporary hold
            if (userHasHold) {
                yield redisMock_1.default.del(`hold:${slotId}:${patientId}`);
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
            res.status(201).json({
                success: true,
                message: 'Appointment booked successfully',
                appointment: Object.assign(Object.assign({}, appointment.toObject()), { tokenNumber })
            });
        }
        catch (error) {
            yield session.abortTransaction();
            session.endSession();
            if (bookingRequestId) {
                yield redisMock_1.default.del(`idempotency:${bookingRequestId}`);
            }
            throw error;
        }
    }
    catch (error) {
        console.error('[BookingTransactionError]', error.message);
        // 5. USER-FACING ERROR MESSAGES based on scenario
        if (error.message === 'SLOT_FULL') {
            res.status(400).json({
                code: 'SLOT_FULL',
                message: 'Sorry, this slot was just booked by someone else. Please choose another slot.'
            });
        }
        else if (error.message === 'SLOT_ON_HOLD') {
            res.status(400).json({
                code: 'SLOT_ON_HOLD',
                message: 'This slot is temporarily held by another user. Please choose another slot.'
            });
        }
        else if (error.message === 'SLOT_CANCELLED') {
            res.status(400).json({
                code: 'SLOT_CANCELLED',
                message: 'This slot has been cancelled by the hospital. Please choose another.'
            });
        }
        else if (error.message === 'SLOT_NOT_FOUND') {
            res.status(404).json({
                code: 'NOT_FOUND',
                message: 'Slot not found. Please choose another.'
            });
        }
        else {
            res.status(500).json({
                code: 'SERVER_ERROR',
                message: 'An unexpected booking error occurred. Please try again.',
                error: error.message
            });
        }
    }
});
exports.createAppointment = createAppointment;
// @desc    Get current user's (patient's) bookings
// @route   GET /api/hospital/dashboard/appointments/my-bookings
const getMyBookings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const patientId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id);
        if (!patientId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        const appointments = yield Appointment_1.default.find({ patient: patientId })
            .populate('doctor', 'name specialty specialization')
            .populate('hospital', 'name address city')
            .populate('slot', 'startTime endTime')
            .sort({ slotTime: -1 });
        res.json(appointments);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching patient bookings', error: error.message });
    }
});
exports.getMyBookings = getMyBookings;
// ─── Slot Management Controllers ───────────────────────────────────────────────
// @desc    Get all slots for the authenticated hospital
// @route   GET /api/hospital/dashboard/slots
const getHospitalSlots = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const slots = yield Slot_1.default.find({ hospital: hospital._id })
            .populate('doctor', 'name specialty isSpecialtyGroup department')
            .sort({ startTime: 1 });
        // Query active appointments to count booking occurrences per slot
        const appointments = yield Appointment_1.default.find({ hospital: hospital._id, status: { $ne: 'cancelled' } });
        const slotsWithCount = slots.map(slot => {
            const bookingCount = appointments.filter(app => app.slot.toString() === slot._id.toString()).length;
            return Object.assign(Object.assign({}, slot.toObject()), { bookingCount });
        });
        res.json(slotsWithCount);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching hospital slots', error: error.message });
    }
});
exports.getHospitalSlots = getHospitalSlots;
// @desc    Add individual or recurrent slot(s) for a doctor/specialty group
// @route   POST /api/hospital/dashboard/slots/add
const addSingleSlot = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { doctorId, date, startTime, endTime, recurrence } = req.body;
        if (!doctorId || !date || !startTime || !endTime) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }
        const now = new Date();
        // Helper to generate target dates based on recurrence pattern
        const generateDates = (baseDateStr, recPattern) => {
            const datesList = [new Date(baseDateStr)];
            if (!recPattern || recPattern.type === 'none') {
                return datesList;
            }
            const startDate = new Date(baseDateStr);
            const endDate = recPattern.until ? new Date(recPattern.until) : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
            if (endDate < startDate)
                return datesList;
            const current = new Date(startDate);
            current.setDate(current.getDate() + 1); // Move past baseDate
            while (current <= endDate) {
                if (recPattern.type === 'daily') {
                    datesList.push(new Date(current));
                }
                else if (recPattern.type === 'weekly') {
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
            const overlap = yield Slot_1.default.findOne({
                doctor: doctorId,
                status: { $ne: 'cancelled' },
                startTime: { $lt: end },
                endTime: { $gt: start }
            }).populate('doctor', 'name');
            if (overlap) {
                const overlapStartStr = new Date(overlap.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const overlapEndStr = new Date(overlap.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                res.status(400).json({
                    message: `Conflict warning: An overlapping slot already exists on ${dateStr} from ${overlapStartStr} to ${overlapEndStr} for ${overlap.doctor.name || 'this specialty'}.`
                });
                return;
            }
            const doctorDoc = yield Doctor_1.default.findById(doctorId);
            const maxAppts = (doctorDoc === null || doctorDoc === void 0 ? void 0 : doctorDoc.maxAppointmentsPerSlot) || 1;
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
            yield Slot_1.default.insertMany(slotsToInsert);
            // Emit socket update event for first date in slots
            const io = req.app.get('io');
            if (io) {
                io.emit('slotsUpdated', { doctorId, date });
            }
        }
        res.status(201).json({ message: `Successfully created ${slotsToInsert.length} slots`, count: slotsToInsert.length });
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating slot', error: error.message });
    }
});
exports.addSingleSlot = addSingleSlot;
// @desc    Cancel a specific slot with booking cancellations
// @route   POST /api/hospital/dashboard/slots/:id/cancel
const cancelSlot = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const { reason } = req.body;
        const slot = yield Slot_1.default.findOne({ _id: id, hospital: hospital._id });
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
        slot.cancelledBy = (((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id));
        yield slot.save();
        // Update affected bookings to cancelled
        yield Appointment_1.default.updateMany({ slot: slot._id }, { status: 'cancelled' });
        // Emit socket update for real-time lists
        const io = req.app.get('io');
        if (io) {
            io.emit('slotsUpdated', {
                doctorId: slot.doctor,
                date: new Date(slot.startTime).toISOString().split('T')[0]
            });
        }
        res.json({ message: 'Slot and all associated bookings cancelled successfully.' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error cancelling slot', error: error.message });
    }
});
exports.cancelSlot = cancelSlot;
// @desc    Delete a specific slot completely
// @route   DELETE /api/hospital/dashboard/slots/:id
const deleteSlot = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const slot = yield Slot_1.default.findOne({ _id: id, hospital: hospital._id });
        if (!slot) {
            res.status(404).json({ message: 'Slot not found' });
            return;
        }
        // Delete associated bookings
        yield Appointment_1.default.deleteMany({ slot: slot._id });
        // Delete the slot document itself
        yield Slot_1.default.deleteOne({ _id: slot._id });
        // Emit socket update for real-time lists
        const io = req.app.get('io');
        if (io) {
            io.emit('slotsUpdated', {
                doctorId: slot.doctor,
                date: new Date(slot.startTime).toISOString().split('T')[0]
            });
        }
        res.json({ message: 'Slot deleted successfully.' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting slot', error: error.message });
    }
});
exports.deleteSlot = deleteSlot;
// @desc    Create temporary hold on a slot
// @route   POST /api/hospital/dashboard/slots/hold
const holdSlot = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { slotId } = req.body;
        const patientId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id);
        if (!patientId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        if (!slotId) {
            res.status(400).json({ message: 'Slot ID is required' });
            return;
        }
        // Check if already booked
        const existingActiveBooking = yield Appointment_1.default.findOne({
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
        const holdResult = yield (0, holdManager_1.createHold)(slotId, patientId.toString(), io);
        if (!holdResult.success) {
            if (holdResult.message === 'Slot just became full') {
                res.status(400).json({
                    code: 'SLOT_FULL',
                    message: 'Sorry, this slot was just booked by someone else. Please choose another slot.'
                });
            }
            else if (holdResult.message === 'Slot on temporary hold') {
                res.status(400).json({
                    code: 'SLOT_ON_HOLD',
                    message: 'This slot is temporarily held. Please try again in a few minutes or choose another.'
                });
            }
            else if (holdResult.message === 'Slot cancelled by admin') {
                res.status(400).json({
                    code: 'SLOT_CANCELLED',
                    message: 'This slot has been cancelled by the hospital. Please choose another.'
                });
            }
            else {
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error holding slot', error: error.message });
    }
});
exports.holdSlot = holdSlot;
// @desc    Release temporary hold on a slot
// @route   POST /api/hospital/dashboard/slots/release-hold
const releaseSlotHold = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { slotId } = req.body;
        const patientId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id);
        if (!patientId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        if (!slotId) {
            res.status(400).json({ message: 'Slot ID is required' });
            return;
        }
        const io = req.app.get('io');
        const released = yield (0, holdManager_1.releaseHold)(slotId, patientId.toString(), io);
        res.json({
            success: true,
            released
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error releasing slot hold', error: error.message });
    }
});
exports.releaseSlotHold = releaseSlotHold;
// @desc    Create manual appointment by hospital admin
// @route   POST /api/hospital/appointments/manual
// @access  Private/Hospital
const createManualAppointment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { patientName, patientEmail, patientPhone, doctorId, slotId, slotTime, notes, paymentStatus } = req.body;
        if (!patientName || !patientEmail || !doctorId || !slotId || !slotTime) {
            res.status(400).json({ message: 'Missing required manual booking fields' });
            return;
        }
        // 1. Find or create the patient
        let patient = yield User_1.default.findOne({ email: patientEmail.toLowerCase().trim() });
        if (!patient) {
            patient = yield User_1.default.create({
                name: patientName,
                email: patientEmail.toLowerCase().trim(),
                phone: patientPhone || '',
                role: 'customer',
                status: 'approved',
                agreedToTerms: true
            });
        }
        else if (patientPhone && !patient.phone) {
            // Update phone if not previously set
            patient.phone = patientPhone;
            yield patient.save();
        }
        const patientId = patient._id;
        // 2. Start Transaction to prevent double booking
        const session = yield mongoose_1.default.startSession();
        session.startTransaction();
        try {
            const slot = yield Slot_1.default.findById(slotId).session(session);
            if (!slot) {
                throw new Error('SLOT_NOT_FOUND');
            }
            if (slot.status === 'cancelled') {
                throw new Error('SLOT_CANCELLED');
            }
            const doctor = yield Doctor_1.default.findById(doctorId).session(session);
            const maxAppts = slot.max_appointments || (doctor === null || doctor === void 0 ? void 0 : doctor.maxAppointmentsPerSlot) || 1;
            if (slot.booked_count >= maxAppts) {
                throw new Error('SLOT_FULL');
            }
            // Generate Token Number
            const activeAppointmentsCount = yield Appointment_1.default.countDocuments({
                slot: slotId,
                status: { $ne: 'cancelled' }
            }).session(session);
            const tokenNumber = activeAppointmentsCount + 1;
            const appointment = new Appointment_1.default({
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
            yield appointment.save({ session });
            // Increment booked_count atomically
            const updatedSlot = yield Slot_1.default.findOneAndUpdate({
                _id: slotId,
                booked_count: { $lt: maxAppts }
            }, {
                $inc: { booked_count: 1 },
                $set: {
                    status: (slot.booked_count + 1 >= maxAppts) ? 'booked' : 'available',
                    appointment: appointment._id
                }
            }, { session, new: true });
            if (!updatedSlot) {
                throw new Error('SLOT_FULL');
            }
            yield session.commitTransaction();
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
            res.status(201).json({
                success: true,
                message: 'Manual appointment booked successfully',
                appointment: Object.assign(Object.assign({}, appointment.toObject()), { patient: {
                        name: patient.name,
                        email: patient.email,
                        phone: patient.phone
                    }, tokenNumber })
            });
        }
        catch (error) {
            yield session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
    catch (error) {
        console.error('[ManualBookingError]', error.message);
        if (error.message === 'SLOT_FULL') {
            res.status(400).json({ code: 'SLOT_FULL', message: 'Sorry, this slot is fully booked.' });
        }
        else if (error.message === 'SLOT_CANCELLED') {
            res.status(400).json({ code: 'SLOT_CANCELLED', message: 'This slot has been cancelled.' });
        }
        else if (error.message === 'SLOT_NOT_FOUND') {
            res.status(404).json({ code: 'NOT_FOUND', message: 'Slot not found.' });
        }
        else {
            res.status(500).json({ code: 'SERVER_ERROR', message: 'An unexpected booking error occurred.', error: error.message });
        }
    }
});
exports.createManualAppointment = createManualAppointment;
// @desc    Delete doctor or specialty group (Self-Managed only)
// @route   DELETE /api/hospital/doctors/:id
const deleteDoctor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const doctor = yield Doctor_1.default.findOne({ _id: id, hospital: hospital._id });
        if (!doctor) {
            res.status(404).json({ message: 'Doctor or Specialty Group not found' });
            return;
        }
        // Delete associated appointments
        yield Appointment_1.default.deleteMany({ doctor: doctor._id });
        // Delete associated slots
        yield Slot_1.default.deleteMany({ doctor: doctor._id });
        // Delete doctor document itself
        yield Doctor_1.default.deleteOne({ _id: doctor._id });
        // Emit socket update for real-time list refreshing
        const io = req.app.get('io');
        if (io) {
            io.emit('doctorsUpdated', { hospitalId: hospital._id });
        }
        res.json({ message: 'Doctor and all associated slots/appointments deleted successfully.' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting doctor', error: error.message });
    }
});
exports.deleteDoctor = deleteDoctor;
