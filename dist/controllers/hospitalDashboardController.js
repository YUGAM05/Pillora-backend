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
exports.getMyBookings = exports.createAppointment = exports.getDoctorSlots = exports.updateAppointmentStatus = exports.getHospitalAppointments = exports.bulkGenerateSlots = exports.addDoctor = exports.getHospitalDoctors = exports.getHospitalStats = void 0;
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
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
// @desc    Add a doctor (Self-Managed only)
// @route   POST /api/hospital/doctors
const addDoctor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const { name, specialty, fee, availability } = req.body;
        const doctor = yield Doctor_1.default.create({
            hospital: hospital._id,
            name,
            specialty,
            fee,
            availability: availability || []
        });
        res.status(201).json(doctor);
    }
    catch (error) {
        res.status(500).json({ message: 'Error adding doctor', error: error.message });
    }
});
exports.addDoctor = addDoctor;
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
                status: 'available'
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
// @desc    Create appointment (Book slot)
// @route   POST /api/hospital/dashboard/appointments
const createAppointment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { doctorId, hospitalId, slotId, slotTime } = req.body;
        const patientId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // Atomic check and update of slot status to prevent race conditions
        const slot = yield Slot_1.default.findOneAndUpdate({ _id: slotId, status: 'available' }, { status: 'booked' }, { new: true });
        if (!slot) {
            res.status(400).json({ message: 'Slot is no longer available or already booked' });
            return;
        }
        const appointment = yield Appointment_1.default.create({
            patient: patientId,
            doctor: doctorId,
            hospital: hospitalId,
            slot: slotId,
            slotTime: new Date(slotTime),
            status: 'pending'
        });
        // Link appointment back to slot
        slot.appointment = appointment._id;
        yield slot.save();
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error booking appointment', error: error.message });
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
