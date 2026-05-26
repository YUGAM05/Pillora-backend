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
exports.getPaymentSummary = exports.recordPayment = exports.autocompleteBookingIds = exports.autocompletePatients = exports.getAppointmentPrescription = exports.uploadAppointmentPrescription = exports.searchPatients = exports.generateAndSendInvoice = exports.updateAppointmentPrescription = exports.addPatientNote = exports.getPatientNotes = exports.assignDoctorToAppointment = exports.getCancellationRate = exports.getBookingHoursAnalytics = exports.deleteDoctor = exports.createManualAppointment = exports.releaseSlotHold = exports.holdSlot = exports.deleteSlot = exports.cancelSlot = exports.addSingleSlot = exports.getHospitalSlots = exports.getMyBookings = exports.createAppointment = exports.getDoctorSlots = exports.updateAppointmentStatus = exports.getHospitalAppointments = exports.bulkGenerateSlots = exports.updateDoctor = exports.addDoctor = exports.getHospitalDoctors = exports.getHospitalStats = void 0;
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const User_1 = __importDefault(require("../models/User"));
const PatientNote_1 = __importDefault(require("../models/PatientNote"));
const Payment_1 = __importDefault(require("../models/Payment"));
const mongoose_1 = __importDefault(require("mongoose"));
const redisMock_1 = __importDefault(require("../utils/redisMock"));
const holdManager_1 = require("../utils/holdManager");
const pdfkit_1 = __importDefault(require("pdfkit"));
const cloudinary_1 = require("cloudinary");
const emailService_1 = require("../services/emailService");
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djlttfqje',
    api_key: process.env.CLOUDINARY_API_KEY || '372769319742221',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'JZ88aoet4iKXegIT19PKqDoL2nU'
});
const emailService_2 = require("../services/emailService");
const dateHelper_1 = require("../utils/dateHelper");
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
        const { name, email, phone, specialty, fee, availability, isSpecialtyGroup, department, maxAppointmentsPerSlot, doctorsCount, description } = req.body;
        const doctor = yield Doctor_1.default.create({
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
        const startOfDay = new Date(`${date}T00:00:00+05:30`);
        const endOfDay = new Date(`${date}T23:59:59.999+05:30`);
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
            try {
                const hospitalDoc = yield Hospital_1.default.findById(hospitalId);
                const hospitalNameStr = hospitalDoc ? hospitalDoc.name : 'Pillora Hospital';
                // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
                const dateStr = (0, dateHelper_1.formatDateIST)(slotTime);
                const timeSlotStr = (0, dateHelper_1.formatTimeIST)(slotTime);
                yield (0, emailService_2.sendBookingConfirmationEmail)({
                    toEmail: patientEmail,
                    patientName: patientName,
                    hospitalName: hospitalNameStr,
                    date: dateStr,
                    timeSlot: timeSlotStr,
                    bookingId: appointment._id.toString()
                });
                if (hospitalDoc && hospitalDoc.email) {
                    try {
                        yield (0, emailService_2.sendHospitalNotificationEmail)({
                            hospitalEmail: hospitalDoc.email,
                            hospitalName: hospitalDoc.name,
                            patientName: patientName,
                            patientEmail: patientEmail,
                            patientPhone: patientPhone,
                            date: dateStr,
                            timeSlot: timeSlotStr,
                            bookingId: appointment._id.toString()
                        });
                    }
                    catch (emailError) {
                        console.error('Hospital email failed (non-critical):', emailError.message);
                    }
                }
            }
            catch (emailError) {
                console.error('Email failed (non-critical):', emailError.message);
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
            if (patient.email) {
                try {
                    const hospitalNameStr = hospital.name || 'Pillora Hospital';
                    // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
                    const dateStr = (0, dateHelper_1.formatDateIST)(slotTime);
                    const timeSlotStr = (0, dateHelper_1.formatTimeIST)(slotTime);
                    yield (0, emailService_2.sendBookingConfirmationEmail)({
                        toEmail: patient.email,
                        patientName: patient.name,
                        hospitalName: hospitalNameStr,
                        date: dateStr,
                        timeSlot: timeSlotStr,
                        bookingId: appointment._id.toString()
                    });
                    console.log('Walking appointment confirmation email sent to', patient.email);
                }
                catch (emailError) {
                    console.error('Walking appointment email failed (non-critical):', emailError.message);
                }
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
// @desc    Get booking hours analytics for the current week
// @route   GET /api/hospital/dashboard/analytics/booking-hours
const getBookingHoursAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
        endOfWeek.setHours(23, 59, 59, 999);
        const appointments = yield Appointment_1.default.find({
            hospital: hospital._id,
            slotTime: { $gte: startOfWeek, $lte: endOfWeek }
        });
        const hourCounts = {};
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching booking hours analytics', error: error.message });
    }
});
exports.getBookingHoursAnalytics = getBookingHoursAnalytics;
// @desc    Get cancellation rate for the current month
// @route   GET /api/hospital/dashboard/analytics/cancellation-rate
const getCancellationRate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const totalAppointments = yield Appointment_1.default.countDocuments({
            hospital: hospital._id,
            slotTime: { $gte: startOfMonth, $lte: endOfMonth }
        });
        const cancelledAppointments = yield Appointment_1.default.countDocuments({
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching cancellation rate', error: error.message });
    }
});
exports.getCancellationRate = getCancellationRate;
// @desc    Assign doctor to appointment
// @route   PUT /api/hospital/dashboard/appointments/:id/assign-doctor
const assignDoctorToAppointment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const { doctorId } = req.body;
        if (!doctorId) {
            res.status(400).json({ message: 'doctorId is required' });
            return;
        }
        const doctor = yield Doctor_1.default.findOne({ _id: doctorId, hospital: hospital._id });
        if (!doctor) {
            res.status(404).json({ message: 'Doctor not found in this hospital' });
            return;
        }
        const appointment = yield Appointment_1.default.findOneAndUpdate({ _id: id, hospital: hospital._id }, { doctor: doctor._id }, { new: true }).populate('doctor', 'name specialty');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }
        res.json({ message: 'Doctor assigned successfully', appointment });
    }
    catch (error) {
        res.status(500).json({ message: 'Error assigning doctor', error: error.message });
    }
});
exports.assignDoctorToAppointment = assignDoctorToAppointment;
// @desc    Get notes for a specific patient
// @route   GET /api/hospital/dashboard/patients/:patientId/notes
const getPatientNotes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { patientId } = req.params;
        const notes = yield PatientNote_1.default.find({ patient: patientId, hospital: hospital._id })
            .populate('doctor', 'name specialty')
            .sort({ createdAt: -1 });
        res.json(notes);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching patient notes', error: error.message });
    }
});
exports.getPatientNotes = getPatientNotes;
// @desc    Add a note for a patient
// @route   POST /api/hospital/dashboard/patients/:patientId/notes
const addPatientNote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { patientId } = req.params;
        const { note, doctorId } = req.body;
        if (!note) {
            res.status(400).json({ message: 'Note content is required' });
            return;
        }
        const patientNote = yield PatientNote_1.default.create({
            patient: patientId,
            hospital: hospital._id,
            doctor: doctorId || undefined,
            note
        });
        const populatedNote = yield PatientNote_1.default.findById(patientNote._id).populate('doctor', 'name specialty');
        res.status(201).json(populatedNote);
    }
    catch (error) {
        res.status(500).json({ message: 'Error adding patient note', error: error.message });
    }
});
exports.addPatientNote = addPatientNote;
// @desc    Upload Prescription URL
// @route   PUT /api/hospital/dashboard/appointments/:id/prescription
const updateAppointmentPrescription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const { prescriptionUrl } = req.body;
        const appointment = yield Appointment_1.default.findOne({ _id: id, hospital: hospital._id });
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }
        appointment.prescriptionUrl = prescriptionUrl;
        yield appointment.save();
        res.json(appointment);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating prescription', error: error.message });
    }
});
exports.updateAppointmentPrescription = updateAppointmentPrescription;
// @desc    Generate and Send Invoice
// @route   POST /api/hospital/dashboard/appointments/:id/invoice
const generateAndSendInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const { amount } = req.body;
        const appointment = yield Appointment_1.default.findOne({ _id: id, hospital: hospital._id }).populate('patient');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }
        const patientName = appointment.patientName || ((_a = appointment.patient) === null || _a === void 0 ? void 0 : _a.name) || 'Patient';
        const patientEmail = (_b = appointment.patient) === null || _b === void 0 ? void 0 : _b.email;
        if (!patientEmail) {
            res.status(400).json({ message: 'Patient email not found for sending invoice. Cannot send email.' });
            return;
        }
        // Generate PDF
        const doc = new pdfkit_1.default({ margin: 50 });
        const buffers = [];
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
        const pdfBuffer = yield new Promise((resolve, reject) => {
            doc.on('end', () => {
                resolve(Buffer.concat(buffers));
            });
            doc.on('error', reject);
        });
        const base64File = pdfBuffer.toString('base64');
        const dataUri = `data:application/pdf;base64,${base64File}`;
        // Upload to Cloudinary
        const result = yield cloudinary_1.v2.uploader.upload(dataUri, {
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
        yield appointment.save();
        try {
            yield (0, emailService_1.sendInvoiceEmail)({
                toEmail: patientEmail,
                patientName: patientName,
                hospitalName: hospital.name,
                invoiceUrl: invoiceUrl,
                // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
                date: (0, dateHelper_1.formatDateIST)(appointment.bookingDate),
                amount: Number(amount)
            });
        }
        catch (emailError) {
            console.error('Invoice email failed (non-critical):', emailError.message);
        }
        res.json(appointment);
    }
    catch (error) {
        res.status(500).json({ message: 'Error generating invoice', error: error.message });
    }
});
exports.generateAndSendInvoice = generateAndSendInvoice;
// @desc    Search patients by booking ID or name
// @route   GET /api/hospital/dashboard/patients/search
const searchPatients = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const hospital = req.hospital;
        const { bookingId, name } = req.query;
        let query = { hospital: hospital._id };
        if (bookingId) {
            // Find booking by partial or exact ID (case-insensitive)
            const lowerQuery = bookingId.toLowerCase().trim();
            // First try exact match if valid ObjectId
            let initialBooking;
            if (mongoose_1.default.Types.ObjectId.isValid(lowerQuery) && lowerQuery.length === 24) {
                initialBooking = yield Appointment_1.default.findOne({ _id: lowerQuery, hospital: hospital._id }).populate('patient');
            }
            // If not found, fetch recent and do partial match like autocomplete
            if (!initialBooking) {
                const recentAppts = yield Appointment_1.default.find({ hospital: hospital._id })
                    .populate('patient')
                    .sort({ createdAt: -1 })
                    .limit(500);
                initialBooking = recentAppts.find(a => a._id.toString().toLowerCase().includes(lowerQuery));
            }
            if (!initialBooking) {
                res.status(404).json({ message: 'No patient found with this booking ID' });
                return;
            }
            if (initialBooking.patient) {
                query.patient = initialBooking.patient._id;
            }
            else if (initialBooking.patientEmail) {
                query.patientEmail = initialBooking.patientEmail;
            }
            else {
                query.patientName = initialBooking.patientName;
            }
        }
        else if (name) {
            const searchName = name.trim();
            const regex = new RegExp(searchName, 'i');
            // Find patients matching the name
            const matchingUsers = yield User_1.default.find({ name: regex });
            // We want to match either the user account OR the name directly on the appointment
            query.$or = [
                { patientName: regex }
            ];
            if (matchingUsers.length > 0) {
                query.$or.push({ patient: { $in: matchingUsers.map(u => u._id) } });
            }
        }
        else {
            res.status(400).json({ message: 'Provide either bookingId or name to search' });
            return;
        }
        const appointments = yield Appointment_1.default.find(query)
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
            const patientId = (_a = appt.patient) === null || _a === void 0 ? void 0 : _a._id.toString();
            if (!patientId)
                continue;
            if (!patientsMap.has(patientId)) {
                patientsMap.set(patientId, {
                    patientInfo: {
                        _id: patientId,
                        name: appt.patientName || ((_b = appt.patient) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown',
                        email: appt.patientEmail || ((_c = appt.patient) === null || _c === void 0 ? void 0 : _c.email) || '',
                        phone: appt.patientPhone || ((_d = appt.patient) === null || _d === void 0 ? void 0 : _d.phone) || '',
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error searching patients', error: error.message });
    }
});
exports.searchPatients = searchPatients;
// @desc    Upload Prescription PDF
// @route   POST /api/hospital/dashboard/appointments/:id/prescription
const uploadAppointmentPrescription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        if (!req.file) {
            res.status(400).json({ message: 'No PDF file uploaded' });
            return;
        }
        if (req.file.mimetype !== 'application/pdf') {
            res.status(400).json({ message: 'Only PDF files are allowed' });
            return;
        }
        const appointment = yield Appointment_1.default.findOne({ _id: id, hospital: hospital._id }).populate('patient');
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
                    .split('/').slice(-2).join('/') // extract folder/filename
                    .replace('.pdf', ''); // remove extension
                yield cloudinary_1.v2.uploader.destroy(oldPublicId, { resource_type: 'raw' });
                console.log('Old prescription deleted from Cloudinary');
            }
            catch (err) {
                console.error('Could not delete old prescription:', err.message);
            }
        }
        // Upload to Cloudinary
        const result = yield cloudinary_1.v2.uploader.upload(dataUri, {
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
        yield appointment.save();
        const patientEmail = ((_a = appointment.patient) === null || _a === void 0 ? void 0 : _a.email) || appointment.patientEmail;
        const patientName = ((_b = appointment.patient) === null || _b === void 0 ? void 0 : _b.name) || appointment.patientName || 'Patient';
        if (patientEmail) {
            try {
                // Add fl_attachment to force download as PDF in email
                const downloadUrl = appointment.prescriptionUrl.includes('/raw/upload/')
                    ? appointment.prescriptionUrl.replace('/raw/upload/', '/raw/upload/fl_attachment:prescription/')
                    : appointment.prescriptionUrl;
                yield (0, emailService_2.sendPrescriptionEmail)({
                    toEmail: patientEmail,
                    patientName: patientName,
                    hospitalName: hospital.name,
                    prescriptionUrl: downloadUrl,
                    // Convert UTC timestamp to IST before passing to email (fixes UTC+5:30 timezone bug)
                    date: (0, dateHelper_1.formatDateIST)(appointment.bookingDate)
                });
            }
            catch (emailError) {
                console.error('Prescription email failed (non-critical):', emailError.message);
            }
        }
        res.json(appointment);
    }
    catch (error) {
        console.error('Prescription upload error:', error);
        res.status(500).json({ message: 'Error uploading prescription', error: error.message });
    }
});
exports.uploadAppointmentPrescription = uploadAppointmentPrescription;
// @desc    Get Prescription URL
// @route   GET /api/hospital/dashboard/appointments/:id/prescription
const getAppointmentPrescription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const appointment = yield Appointment_1.default.findOne({ _id: id, hospital: hospital._id });
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching prescription', error: error.message });
    }
});
exports.getAppointmentPrescription = getAppointmentPrescription;
// @desc    Autocomplete patient names (≥2 chars) scoped to this hospital
// @route   GET /api/hospital/dashboard/patients/autocomplete?q=yu
// @access  Private/Hospital
const autocompletePatients = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const query = (req.query.q || '').trim();
        if (query.length < 2) {
            res.json([]);
            return;
        }
        // Get distinct patient IDs who have bookings at this hospital
        const bookingPatientIds = yield Appointment_1.default.distinct('patient', { hospital: hospital._id });
        // Partial case-insensitive name match, limited to this hospital's patients
        const regex = new RegExp(query, 'i');
        const patients = yield User_1.default.find({
            _id: { $in: bookingPatientIds },
            name: regex
        })
            .select('name email phone')
            .limit(8)
            .lean();
        const suggestions = patients.map((p) => ({
            id: p._id.toString(),
            name: p.name,
            email: p.email || '',
            phone: p.phone || ''
        }));
        res.json(suggestions);
    }
    catch (error) {
        res.status(500).json({ message: 'Autocomplete error', error: error.message });
    }
});
exports.autocompletePatients = autocompletePatients;
// @desc    Autocomplete booking IDs (≥4 chars) scoped to this hospital
// @route   GET /api/hospital/dashboard/bookings/autocomplete?q=abc1
// @access  Private/Hospital
const autocompleteBookingIds = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const query = (req.query.q || '').trim();
        if (query.length < 4) {
            res.json([]);
            return;
        }
        // Fetch recent appointments for this hospital
        const appointments = yield Appointment_1.default.find({ hospital: hospital._id })
            .populate('patient', 'name')
            .select('_id slotTime patientName patient')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        // Filter by partial ID match anywhere in the full ObjectId string
        const lowerQuery = query.toLowerCase();
        const matched = appointments
            .filter((a) => a._id.toString().toLowerCase().includes(lowerQuery))
            .slice(0, 8)
            .map((a) => {
            var _a;
            return ({
                id: a._id.toString(),
                bookingId: a._id.toString(),
                patientName: a.patientName || ((_a = a.patient) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown',
                date: a.slotTime
                    ? new Date(a.slotTime).toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    })
                    : ''
            });
        });
        res.json(matched);
    }
    catch (error) {
        res.status(500).json({ message: 'Autocomplete error', error: error.message });
    }
});
exports.autocompleteBookingIds = autocompleteBookingIds;
// @desc    Record a manual payment for a booking
// @route   POST /api/hospital/dashboard/appointments/:id/payment
// @access  Private/Hospital
const recordPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const { amount, mode } = req.body;
        if (amount === undefined || amount < 0) {
            res.status(400).json({ message: 'Valid amount is required' });
            return;
        }
        if (!['online', 'offline'].includes(mode)) {
            res.status(400).json({ message: 'Valid payment mode is required (online or offline)' });
            return;
        }
        const appointment = yield Appointment_1.default.findOne({ _id: id, hospital: hospital._id }).populate('patient');
        if (!appointment) {
            res.status(404).json({ message: 'Appointment not found' });
            return;
        }
        const patientName = appointment.patientName || ((_a = appointment.patient) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Patient';
        let payment = yield Payment_1.default.findOne({ appointmentId: appointment._id });
        if (payment) {
            // Update existing payment
            payment.amount = amount;
            payment.mode = mode;
            payment.recordedBy = req.user._id;
            yield payment.save();
        }
        else {
            // Create new payment
            payment = new Payment_1.default({
                appointmentId: appointment._id,
                hospitalId: hospital._id,
                patientName,
                amount,
                mode,
                status: 'paid',
                recordedBy: req.user._id
            });
            yield payment.save();
        }
        // Update appointment status
        appointment.paymentStatus = 'paid';
        yield appointment.save();
        res.json({ message: 'Payment recorded successfully', payment, appointment });
    }
    catch (error) {
        res.status(500).json({ message: 'Error recording payment', error: error.message });
    }
});
exports.recordPayment = recordPayment;
// @desc    Get payment summary and analytics
// @route   GET /api/hospital/dashboard/payments/summary
// @access  Private/Hospital
const getPaymentSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { from, to } = req.query;
        // Build date filter
        let dateFilter = {};
        if (from || to) {
            dateFilter.createdAt = {};
            if (from)
                dateFilter.createdAt.$gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                dateFilter.createdAt.$lte = toDate;
            }
        }
        // Base match for this hospital
        const matchStage = Object.assign({ hospitalId: hospital._id, status: 'paid' }, dateFilter);
        // 1. Total summary stats
        const payments = yield Payment_1.default.find(matchStage);
        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
        const onlinePayments = payments.filter(p => p.mode === 'online');
        const offlinePayments = payments.filter(p => p.mode === 'offline');
        const totalOnlineRevenue = onlinePayments.reduce((sum, p) => sum + p.amount, 0);
        const totalOfflineRevenue = offlinePayments.reduce((sum, p) => sum + p.amount, 0);
        // Fetch unpaid appointments count for the same date range (using bookingDate or createdAt)
        let apptDateFilter = {};
        if (from || to) {
            apptDateFilter.createdAt = {};
            if (from)
                apptDateFilter.createdAt.$gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                apptDateFilter.createdAt.$lte = toDate;
            }
        }
        const pendingCount = yield Appointment_1.default.countDocuments(Object.assign({ hospital: hospital._id, paymentStatus: { $ne: 'paid' } }, apptDateFilter));
        const paidCount = yield Appointment_1.default.countDocuments(Object.assign({ hospital: hospital._id, paymentStatus: 'paid' }, apptDateFilter));
        // 2. Aggregate Revenue over time (Daily)
        const timeSeriesData = yield Payment_1.default.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        mode: "$mode"
                    },
                    total: { $sum: "$amount" }
                }
            },
            {
                $group: {
                    _id: "$_id.date",
                    modes: {
                        $push: {
                            mode: "$_id.mode",
                            amount: "$total"
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        // Format timeseries for frontend Recharts
        const chartData = timeSeriesData.map(item => {
            var _a, _b;
            const online = ((_a = item.modes.find((m) => m.mode === 'online')) === null || _a === void 0 ? void 0 : _a.amount) || 0;
            const offline = ((_b = item.modes.find((m) => m.mode === 'offline')) === null || _b === void 0 ? void 0 : _b.amount) || 0;
            return {
                date: item._id,
                online,
                offline,
                total: online + offline
            };
        });
        res.json({
            summary: {
                totalRevenue,
                online: { count: onlinePayments.length, total: totalOnlineRevenue },
                offline: { count: offlinePayments.length, total: totalOfflineRevenue },
                pending: { count: pendingCount }
            },
            paidVsPending: {
                paid: paidCount,
                pending: pendingCount
            },
            chartData
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching payment summary', error: error.message });
    }
});
exports.getPaymentSummary = getPaymentSummary;
