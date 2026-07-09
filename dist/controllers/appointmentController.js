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
exports.holdAppointment = exports.getAppointmentDetails = exports.createAppointment = exports.cancelAppointment = void 0;
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Payment_1 = __importDefault(require("../models/Payment"));
const razorpay_1 = __importDefault(require("razorpay"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const holdManager_1 = require("../utils/holdManager");
const razorpay = new razorpay_1.default({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_51Mz2wYSHB3q5Xn',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'fallback_secret'
});
/**
 * @desc    Cancel appointment (initiator-dependent refund/retention rules)
 * @route   POST /api/appointments/:appointmentId/cancel
 * @access  Private
 */
const cancelAppointment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { appointmentId } = req.params;
        const { reason } = req.body;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        if (!appointmentId) {
            res.status(400).json({ success: false, message: 'Appointment ID is required' });
            return;
        }
        const appointment = yield Appointment_1.default.findById(appointmentId);
        if (!appointment) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }
        if (appointment.status === 'cancelled') {
            res.status(400).json({ success: false, message: 'Appointment is already cancelled' });
            return;
        }
        // Identify if initiator is Hospital or Admin vs User
        // If hospital role / admin role, or if user is hospital staff
        const isHospitalOrAdmin = req.user.role === 'hospital' || req.user.role === 'admin';
        // 1. Update Appointment Status
        appointment.status = 'cancelled';
        if (reason) {
            appointment.notes = appointment.notes ? `${appointment.notes}\nCancellation reason: ${reason}` : `Cancellation reason: ${reason}`;
        }
        yield appointment.save();
        // 2. Load Payment Record
        const payment = yield Payment_1.default.findOne({ appointmentId });
        if (payment && payment.status === 'completed') {
            if (isHospitalOrAdmin) {
                // Hospital Initiates Cancellation: FULL REFUND
                payment.status = 'refund_initiated';
                payment.settlementStatus = 'refunded';
                yield payment.save();
                // Trigger Razorpay Refund
                if (payment.razorpayPaymentId) {
                    try {
                        const refundAmount = Math.round(payment.amount * 100); // Amount in paise
                        yield razorpay.payments.refund(payment.razorpayPaymentId, {
                            amount: refundAmount,
                            notes: {
                                reason: reason || 'Hospital cancelled appointment',
                                appointmentId: appointmentId.toString()
                            }
                        });
                    }
                    catch (refundError) {
                        console.error('[RazorpayRefundError]', refundError.message);
                        // We do not throw or revert, as handle webhook refund verification or manual check covers this
                    }
                }
            }
            else {
                // User Initiates Cancellation: NO REFUND
                // Payment remains status = "completed" (or we can tag as "completed" to signify retained)
                payment.status = 'completed';
                payment.settlementStatus = 'retained_by_pillora';
                yield payment.save();
            }
        }
        else if (payment && payment.status === 'pending') {
            // Unpaid pending appointments being cancelled
            payment.status = 'failed';
            payment.settlementStatus = 'refunded';
            yield payment.save();
        }
        res.status(200).json({
            success: true,
            message: `Appointment cancelled successfully (${isHospitalOrAdmin ? 'Hospital refund initiated' : 'User cancellation retained'})`,
            appointment
        });
    }
    catch (error) {
        console.error('[AppointmentCancelError]', error.message);
        res.status(500).json({ success: false, message: 'Failed to cancel appointment', error: error.message });
    }
});
exports.cancelAppointment = cancelAppointment;
/**
 * @desc    Create appointment dynamically (supports simplified React Router template)
 * @route   POST /api/appointments/create
 * @access  Public/Private
 */
const createAppointment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { userId, doctorId, hospitalId, appointmentDate, appointmentTime, consultationFee, status } = req.body;
        if (!doctorId || !hospitalId || !appointmentDate || !appointmentTime) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        // Parse Date & Time
        // Combine date ("YYYY-MM-DD") and time ("HH:MM")
        const dateTimeStr = `${appointmentDate}T${appointmentTime}:00`;
        const startTime = new Date(dateTimeStr);
        // Find or create a Slot dynamically for this slot time
        let slot = yield Slot_1.default.findOne({
            doctor: doctorId,
            hospital: hospitalId,
            startTime: startTime
        });
        if (!slot) {
            const endTime = new Date(startTime.getTime() + 60 * 60000); // 1 hour duration
            slot = new Slot_1.default({
                doctor: doctorId,
                hospital: hospitalId,
                startTime: startTime,
                endTime: endTime,
                status: 'booked',
                booked_count: 1,
                max_appointments: 1
            });
            yield slot.save();
        }
        else {
            slot.booked_count += 1;
            slot.status = 'booked';
            yield slot.save();
        }
        // Generate token number
        const activeAppointmentsCount = yield Appointment_1.default.countDocuments({
            slot: slot._id,
            status: { $ne: 'cancelled' }
        });
        const tokenNumber = activeAppointmentsCount + 1;
        // Resolve patient ID
        const patientId = userId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        if (!patientId) {
            res.status(400).json({ error: 'User ID is required' });
            return;
        }
        // Query Doctor and Hospital to get names and fees
        const doctorObj = yield Doctor_1.default.findById(doctorId);
        const hospitalObj = yield Hospital_1.default.findById(hospitalId);
        const finalDocName = doctorObj ? `Dr. ${doctorObj.name}` : "Dr. test";
        const finalHospName = hospitalObj ? hospitalObj.name : "Test";
        const finalFee = Number(consultationFee) || (doctorObj ? doctorObj.fee : 500);
        // Create Appointment
        const appointment = new Appointment_1.default({
            patient: patientId,
            doctor: doctorId,
            hospital: hospitalId,
            slot: slot._id,
            slotTime: startTime,
            status: 'pending', // Pending payment
            paymentStatus: 'unpaid',
            paymentSource: 'gateway',
            tokenNumber,
            doctorName: finalDocName,
            hospitalName: finalHospName,
            consultationFee: finalFee,
            appointmentDate: appointmentDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(startTime),
            appointmentTime: appointmentTime || new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(startTime)
        });
        yield appointment.save();
        // Update slot with appointment id if single slot
        if (slot.max_appointments === 1) {
            slot.appointment = appointment._id;
            yield slot.save();
        }
        res.status(201).json({
            success: true,
            appointmentId: appointment._id
        });
    }
    catch (error) {
        console.error('[AppointmentCreateError]', error.message);
        res.status(500).json({ error: error.message });
    }
});
exports.createAppointment = createAppointment;
/**
 * @desc    Get appointment details by ID
 * @route   GET /api/appointments/:appointmentId
 * @access  Public
 */
const getAppointmentDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { appointmentId } = req.params;
        if (!appointmentId) {
            res.status(400).json({ error: "Appointment ID is required" });
            return;
        }
        // Populate doctor and hospital references in case flat document fields are missing
        const appointment = yield Appointment_1.default.findById(appointmentId)
            .populate('doctor')
            .populate('hospital');
        if (!appointment) {
            res.status(404).json({ error: "Appointment not found" });
            return;
        }
        const docObj = appointment.doctor;
        const hospObj = appointment.hospital;
        const doctorName = appointment.doctorName || (docObj ? `Dr. ${docObj.name}` : "") || "Dr. test";
        const hospitalName = appointment.hospitalName || (hospObj ? hospObj.name : "") || "Test";
        const consultationFee = appointment.consultationFee || (docObj ? docObj.fee : null) || 500;
        let appointmentDate = appointment.appointmentDate;
        let appointmentTime = appointment.appointmentTime;
        if (appointment.slotTime) {
            const d = new Date(appointment.slotTime);
            appointmentDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(d);
            appointmentTime = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(d);
        }
        if (consultationFee === 0 || consultationFee === null || consultationFee === undefined) {
            res.status(400).json({ error: "Invalid appointment fee" });
            return;
        }
        res.status(200).json({
            appointmentId: appointment._id.toString(),
            doctorName: doctorName,
            hospitalName: hospitalName,
            consultationFee: consultationFee,
            appointmentDate: appointmentDate || "2026-06-24",
            appointmentTime: appointmentTime || "06:30",
            doctorId: docObj ? docObj._id.toString() : (appointment.doctor ? appointment.doctor.toString() : ""),
            hospitalId: hospObj ? hospObj._id.toString() : (appointment.hospital ? appointment.hospital.toString() : "")
        });
    }
    catch (error) {
        console.error('[GetAppointmentDetailsError]', error.message);
        res.status(500).json({ error: error.message });
    }
});
exports.getAppointmentDetails = getAppointmentDetails;
/**
 * @desc    Hold an appointment slot temporarily (acts as placeholder before payment completion)
 * @route   POST /api/appointments/hold
 * @access  Private
 */
const holdAppointment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { doctorId, slotStart, slotEnd, date } = req.body;
        const patientId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id);
        if (!patientId) {
            res.status(401).json({ success: false, message: 'User not authenticated' });
            return;
        }
        if (!doctorId || !slotStart || !slotEnd || !date) {
            res.status(400).json({ success: false, message: 'Missing required fields' });
            return;
        }
        const doctorObj = yield Doctor_1.default.findById(doctorId);
        if (!doctorObj) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }
        const hospitalId = doctorObj.hospital;
        let startTime = slotStart.includes('T') ? new Date(slotStart) : new Date(`${date}T${slotStart}`);
        let endTime = slotEnd.includes('T') ? new Date(slotEnd) : new Date(`${date}T${slotEnd}`);
        // Find or create slot
        let slot = yield Slot_1.default.findOne({
            doctor: doctorId,
            hospital: hospitalId,
            startTime: startTime
        });
        if (!slot) {
            slot = new Slot_1.default({
                doctor: doctorId,
                hospital: hospitalId,
                startTime: startTime,
                endTime: endTime,
                status: 'available',
                booked_count: 0,
                max_appointments: 1,
                hold_count: 0
            });
            yield slot.save();
        }
        // Create temporary hold via holdManager
        const io = req.app.get('io');
        const holdResult = yield (0, holdManager_1.createHold)(slot._id.toString(), patientId.toString(), io);
        if (!holdResult.success && holdResult.message !== 'Slot already held by you') {
            res.status(400).json({ success: false, message: holdResult.message });
            return;
        }
        // Create Appointment record if not already exists for this slot and patient
        let appointment = yield Appointment_1.default.findOne({
            patient: patientId,
            slot: slot._id,
            status: 'pending'
        });
        if (!appointment) {
            const activeAppointmentsCount = yield Appointment_1.default.countDocuments({
                slot: slot._id,
                status: { $ne: 'cancelled' }
            });
            const tokenNumber = activeAppointmentsCount + 1;
            const hospitalObj = yield Hospital_1.default.findById(hospitalId);
            const finalDocName = `Dr. ${doctorObj.name}`;
            const finalHospName = hospitalObj ? hospitalObj.name : "Hospital";
            const finalFee = doctorObj.fee || 500;
            appointment = new Appointment_1.default({
                patient: patientId,
                doctor: doctorId,
                hospital: hospitalId,
                slot: slot._id,
                slotTime: startTime,
                status: 'pending',
                paymentStatus: 'unpaid',
                paymentSource: 'gateway',
                tokenNumber,
                doctorName: finalDocName,
                hospitalName: finalHospName,
                consultationFee: finalFee,
                appointmentDate: date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(startTime),
                appointmentTime: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(startTime)
            });
            yield appointment.save();
        }
        res.status(200).json({
            success: true,
            appointmentId: appointment._id.toString()
        });
    }
    catch (error) {
        console.error('[HoldAppointmentError]', error.message);
        res.status(500).json({ success: false, message: 'Failed to hold appointment', error: error.message });
    }
});
exports.holdAppointment = holdAppointment;
