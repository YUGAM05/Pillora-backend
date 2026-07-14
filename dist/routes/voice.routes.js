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
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const User_1 = __importDefault(require("../models/User"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const VoiceCallLog_1 = __importDefault(require("../models/VoiceCallLog"));
const voiceAuth_middleware_1 = require("../middleware/voiceAuth.middleware");
const resolveVoiceHospital_middleware_1 = require("../middleware/resolveVoiceHospital.middleware");
const sms_service_1 = require("../services/sms.service");
const router = express_1.default.Router();
// In-memory rate limiter map for booking requests: phone_number -> timestamps[]
const bookingRateLimiter = new Map();
// Async Call Logger Middleware (Monkey-patches res.json to capture response)
router.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (body) {
        res.bodyData = body;
        return originalJson.call(this, body);
    };
    res.on('finish', () => {
        const hospId = req.hospitalId ? new mongoose_1.default.Types.ObjectId(req.hospitalId) : undefined;
        VoiceCallLog_1.default.create({
            endpoint: req.originalUrl || req.path,
            hospitalId: hospId,
            requestBody: req.body,
            responseStatus: res.statusCode,
            responseBody: res.bodyData || null,
            timestamp: new Date()
        }).catch(err => {
            console.error('[VoiceCallLog] Error saving log asynchronously:', err.message);
        });
    });
    next();
});
/**
 * 1. POST /api/voice/doctors
 * Body: { specialty?: string }
 * Returns active doctors for req.hospitalId, optionally filtered by specialty (case-insensitive partial match).
 */
router.post('/doctors', voiceAuth_middleware_1.voiceAuth, resolveVoiceHospital_middleware_1.resolveVoiceHospital, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const toolCall = (_c = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.toolCallList) === null || _c === void 0 ? void 0 : _c[0];
    const toolCallId = toolCall === null || toolCall === void 0 ? void 0 : toolCall.id;
    const args = ((_d = toolCall === null || toolCall === void 0 ? void 0 : toolCall.function) === null || _d === void 0 ? void 0 : _d.arguments) || {};
    try {
        const { specialty } = args;
        const query = {
            hospital: new mongoose_1.default.Types.ObjectId(req.hospitalId),
            is_active: true
        };
        if (specialty && typeof specialty === 'string') {
            query.specialty = { $regex: new RegExp(specialty.trim(), 'i') };
        }
        const doctors = yield Doctor_1.default.find(query).select('name specialty').lean();
        const responseDoctors = doctors.map(d => ({
            doctorId: d._id.toString(),
            name: d.name,
            specialty: d.specialty
        }));
        res.status(200).json({
            results: [{ toolCallId, result: JSON.stringify({ doctors: responseDoctors }) }]
        });
    }
    catch (error) {
        console.error('[VoiceDoctorsError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
}));
/**
 * 2. POST /api/voice/slots
 * Body: { doctorId: string, date: string } // YYYY-MM-DD
 * Returns available (unbooked) slots for that doctor on that date in HH:mm 24hr format.
 */
router.post('/slots', voiceAuth_middleware_1.voiceAuth, resolveVoiceHospital_middleware_1.resolveVoiceHospital, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const toolCall = (_c = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.toolCallList) === null || _c === void 0 ? void 0 : _c[0];
    const toolCallId = toolCall === null || toolCall === void 0 ? void 0 : toolCall.id;
    const args = ((_d = toolCall === null || toolCall === void 0 ? void 0 : toolCall.function) === null || _d === void 0 ? void 0 : _d.arguments) || {};
    try {
        const { doctorId, date } = args;
        if (!doctorId || !date) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Missing required fields (doctorId, date)" }) }]
            });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(doctorId)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid doctorId format" }) }]
            });
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Date must be in YYYY-MM-DD format" }) }]
            });
            return;
        }
        // Validate doctor belongs to req.hospitalId
        const doctor = yield Doctor_1.default.findOne({
            _id: new mongoose_1.default.Types.ObjectId(doctorId),
            hospital: new mongoose_1.default.Types.ObjectId(req.hospitalId)
        }).select('_id').lean();
        if (!doctor) {
            res.status(404).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "doctor_not_found" }) }]
            });
            return;
        }
        // Query slots on date (IST local timezone)
        const startOfDay = new Date(`${date}T00:00:00+05:30`);
        const endOfDay = new Date(`${date}T23:59:59.999+05:30`);
        const now = new Date();
        const slots = yield Slot_1.default.find({
            doctor: new mongoose_1.default.Types.ObjectId(doctorId),
            hospital: new mongoose_1.default.Types.ObjectId(req.hospitalId),
            startTime: { $gte: startOfDay, $lte: endOfDay, $gt: now },
            status: { $in: ['available', 'locked'] }
        }).sort({ startTime: 1 }).lean();
        const availableSlots = slots.filter(slot => {
            const maxAppts = slot.max_appointments || 1;
            return slot.booked_count < maxAppts;
        });
        const formattedSlots = availableSlots.map(slot => {
            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(new Date(slot.startTime));
            return {
                slotId: slot._id.toString(),
                time: timeStr
            };
        });
        res.status(200).json({
            results: [{ toolCallId, result: JSON.stringify({ slots: formattedSlots }) }]
        });
    }
    catch (error) {
        console.error('[VoiceSlotsError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
}));
/**
 * 3. POST /api/voice/book
 * Body: { doctorId: string, slotId: string, patientName: string, patientPhone: string }
 * Books appointment, normalizes phone, limits rates, creates patient if needed, uses transaction for race check.
 */
router.post('/book', voiceAuth_middleware_1.voiceAuth, resolveVoiceHospital_middleware_1.resolveVoiceHospital, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const toolCall = (_c = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.toolCallList) === null || _c === void 0 ? void 0 : _c[0];
    const toolCallId = toolCall === null || toolCall === void 0 ? void 0 : toolCall.id;
    const args = ((_d = toolCall === null || toolCall === void 0 ? void 0 : toolCall.function) === null || _d === void 0 ? void 0 : _d.arguments) || {};
    try {
        const { doctorId, slotId, patientName, patientPhone } = args;
        if (!doctorId || !slotId || !patientName || !patientPhone) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Missing required booking fields (doctorId, slotId, patientName, patientPhone)" }) }]
            });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(doctorId) || !mongoose_1.default.Types.ObjectId.isValid(slotId)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid doctorId or slotId format" }) }]
            });
            return;
        }
        // Validate and normalize phone to E.164 (Indian mobile)
        const cleanPhone = patientPhone.replace(/[\s-()]/g, '');
        const phoneMatch = cleanPhone.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
        if (!phoneMatch) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid phone number format. Must be a valid 10-digit Indian mobile number." }) }]
            });
            return;
        }
        const tenDigitCore = phoneMatch[1];
        const normalizedPhone = `+91${tenDigitCore}`;
        // In-memory rate limiting check (max 3/hr/phone)
        const nowMs = Date.now();
        const timestamps = bookingRateLimiter.get(normalizedPhone) || [];
        const recentTimestamps = timestamps.filter(ts => nowMs - ts < 3600000);
        if (recentTimestamps.length >= 3) {
            res.status(429).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "rate_limit_exceeded", details: "Max 3 bookings per phone number per hour." }) }]
            });
            return;
        }
        recentTimestamps.push(nowMs);
        bookingRateLimiter.set(normalizedPhone, recentTimestamps);
        // Retrieve Doctor and check hospital association
        const doctor = yield Doctor_1.default.findOne({
            _id: new mongoose_1.default.Types.ObjectId(doctorId),
            hospital: new mongoose_1.default.Types.ObjectId(req.hospitalId)
        }).lean();
        if (!doctor) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Doctor not found or does not belong to this hospital" }) }]
            });
            return;
        }
        // Retrieve Hospital
        const hospital = yield Hospital_1.default.findById(req.hospitalId).select('name').lean();
        const hospitalName = (hospital === null || hospital === void 0 ? void 0 : hospital.name) || 'Pillora Hospital';
        // Check if Patient user already exists by phone
        let patient = yield User_1.default.findOne({ phone: normalizedPhone });
        if (!patient) {
            const dummyEmail = `${tenDigitCore}@voice.pillora.in`.toLowerCase();
            patient = yield User_1.default.findOne({ email: dummyEmail });
            if (!patient) {
                patient = yield User_1.default.create({
                    name: patientName.trim(),
                    email: dummyEmail,
                    phone: normalizedPhone,
                    role: 'customer',
                    status: 'approved',
                    agreedToTerms: true
                });
            }
        }
        // Mongoose Session Transaction for Atomic Booking
        const session = yield mongoose_1.default.startSession();
        session.startTransaction();
        try {
            const freshSlot = yield Slot_1.default.findOne({
                _id: new mongoose_1.default.Types.ObjectId(slotId),
                doctor: new mongoose_1.default.Types.ObjectId(doctorId),
                hospital: new mongoose_1.default.Types.ObjectId(req.hospitalId)
            }).session(session);
            if (!freshSlot) {
                res.status(400).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Slot not found or mismatch" }) }]
                });
                yield session.abortTransaction();
                session.endSession();
                return;
            }
            if (freshSlot.status === 'cancelled' || freshSlot.status === 'blocked') {
                res.status(409).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "slot_unavailable" }) }]
                });
                yield session.abortTransaction();
                session.endSession();
                return;
            }
            const maxAppts = freshSlot.max_appointments || doctor.maxAppointmentsPerSlot || 1;
            if (freshSlot.booked_count >= maxAppts || freshSlot.status === 'booked') {
                res.status(409).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "slot_unavailable" }) }]
                });
                yield session.abortTransaction();
                session.endSession();
                return;
            }
            const activeAppointmentsCount = yield Appointment_1.default.countDocuments({
                slot: slotId,
                status: { $ne: 'cancelled' }
            }).session(session);
            const tokenNumber = activeAppointmentsCount + 1;
            const appointmentDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date(freshSlot.startTime));
            const appointmentTimeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(new Date(freshSlot.startTime));
            const appointment = new Appointment_1.default({
                patient: patient._id,
                doctor: doctorId,
                hospital: req.hospitalId,
                slot: slotId,
                slotTime: freshSlot.startTime,
                status: 'confirmed',
                paymentStatus: 'unpaid',
                paymentSource: 'manual',
                tokenNumber,
                patientName: patientName.trim(),
                patientPhone: normalizedPhone,
                doctorName: `Dr. ${doctor.name}`,
                hospitalName: hospitalName,
                consultationFee: doctor.fee || 500,
                appointmentDate: appointmentDateStr,
                appointmentTime: appointmentTimeStr
            });
            yield appointment.save({ session });
            const newBookedCount = freshSlot.booked_count + 1;
            const updatedSlot = yield Slot_1.default.findOneAndUpdate({
                _id: slotId,
                booked_count: { $lt: maxAppts }
            }, {
                $inc: { booked_count: 1 },
                $set: {
                    status: (newBookedCount >= maxAppts) ? 'booked' : 'available',
                    appointment: appointment._id
                }
            }, { session, new: true });
            if (!updatedSlot) {
                res.status(409).json({
                    results: [{ toolCallId, result: JSON.stringify({ error: "slot_unavailable" }) }]
                });
                yield session.abortTransaction();
                session.endSession();
                return;
            }
            yield session.commitTransaction();
            session.endSession();
            // Emit Real-time Sockets
            const io = req.app.get('io');
            if (io) {
                io.emit('slotBooked', {
                    slotId,
                    doctorId,
                    date: appointmentDateStr,
                    bookedCount: updatedSlot.booked_count,
                    maxAppointments: maxAppts
                });
                io.emit('appointmentsUpdated', { hospitalId: req.hospitalId });
            }
            res.status(201).json({
                results: [{
                        toolCallId,
                        result: JSON.stringify({
                            appointmentId: appointment._id.toString(),
                            status: "confirmed",
                            doctorName: `Dr. ${doctor.name}`,
                            time: appointmentTimeStr,
                            date: appointmentDateStr
                        })
                    }]
            });
        }
        catch (txnError) {
            yield session.abortTransaction();
            session.endSession();
            throw txnError;
        }
    }
    catch (error) {
        console.error('[VoiceBookError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
}));
/**
 * 4. POST /api/voice/confirm
 * Body: { appointmentId: string }
 * Triggers SMS confirmation if appointment belongs to req.hospitalId.
 */
router.post('/confirm', voiceAuth_middleware_1.voiceAuth, resolveVoiceHospital_middleware_1.resolveVoiceHospital, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const toolCall = (_c = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.toolCallList) === null || _c === void 0 ? void 0 : _c[0];
    const toolCallId = toolCall === null || toolCall === void 0 ? void 0 : toolCall.id;
    const args = ((_d = toolCall === null || toolCall === void 0 ? void 0 : toolCall.function) === null || _d === void 0 ? void 0 : _d.arguments) || {};
    try {
        const { appointmentId } = args;
        if (!appointmentId) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Appointment ID is required" }) }]
            });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(appointmentId)) {
            res.status(400).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "invalid_input", details: "Invalid appointmentId format" }) }]
            });
            return;
        }
        const appointment = yield Appointment_1.default.findOne({
            _id: new mongoose_1.default.Types.ObjectId(appointmentId),
            hospital: new mongoose_1.default.Types.ObjectId(req.hospitalId)
        }).lean();
        if (!appointment) {
            res.status(404).json({
                results: [{ toolCallId, result: JSON.stringify({ error: "appointment_not_found" }) }]
            });
            return;
        }
        const phone = appointment.patientPhone;
        const msg = `Your appointment with ${appointment.doctorName} is confirmed for ${appointment.appointmentDate} at ${appointment.appointmentTime}. Thank you!`;
        if (phone) {
            yield (0, sms_service_1.sendSms)(phone, msg);
        }
        res.status(200).json({
            results: [{
                    toolCallId,
                    result: JSON.stringify({
                        sent: true,
                        appointmentId: appointment._id.toString()
                    })
                }]
        });
    }
    catch (error) {
        console.error('[VoiceConfirmError]', error.message);
        res.status(500).json({
            results: [{ toolCallId, result: JSON.stringify({ error: "internal_server_error" }) }]
        });
    }
}));
exports.default = router;
