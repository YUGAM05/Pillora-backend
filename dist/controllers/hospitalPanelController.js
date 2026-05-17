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
exports.getDoctorSlots = exports.getHospitalAppointments = exports.generateSlots = exports.getHospitalProfile = void 0;
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
// @desc    Get hospital profile for logged-in hospital user
// @route   GET /api/hospital-panel/profile
// @access  Private/Hospital
const getHospitalProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = yield Hospital_1.default.findOne({ user: req.user._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        res.json(hospital);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getHospitalProfile = getHospitalProfile;
// @desc    Generate slots for a doctor
// @route   POST /api/hospital-panel/slots/generate
// @access  Private/Hospital
const generateSlots = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { doctorId, date, startTime, endTime, slotDuration } = req.body;
    try {
        const hospital = yield Hospital_1.default.findOne({ user: req.user._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        // Validate doctor belongs to this hospital
        const doctorExists = hospital.doctors.some((d) => d._id.toString() === doctorId);
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
        const existingSlotsCount = yield Slot_1.default.countDocuments({
            doctor: doctorId,
            startTime: { $gte: start, $lt: end }
        });
        if (existingSlotsCount > 0) {
            res.status(400).json({ message: 'Slots have already been generated for this doctor in this time range.' });
            return;
        }
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
                    status: 'available'
                });
            }
            current = next;
        }
        // Bulk insert slots
        yield Slot_1.default.insertMany(slots);
        res.status(201).json({
            message: `Successfully generated ${slots.length} slots`,
            count: slots.length
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.generateSlots = generateSlots;
// @desc    Get appointments for the hospital
// @route   GET /api/hospital-panel/appointments
// @access  Private/Hospital
const getHospitalAppointments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = yield Hospital_1.default.findOne({ user: req.user._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        const appointments = yield Appointment_1.default.find({ hospital: hospital._id })
            .populate('patient', 'name email phone')
            .populate('doctor', 'name specialization')
            .sort({ slotTime: 1 });
        res.json(appointments);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getHospitalAppointments = getHospitalAppointments;
// @desc    Get slots for a doctor (to see availability)
// @route   GET /api/hospital-panel/slots/:doctorId
// @access  Private/Hospital
const getDoctorSlots = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = yield Hospital_1.default.findOne({ user: req.user._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        const slots = yield Slot_1.default.find({
            doctor: req.params.doctorId,
            hospital: hospital._id,
            startTime: { $gte: new Date() }
        }).sort({ startTime: 1 });
        res.json(slots);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getDoctorSlots = getDoctorSlots;
