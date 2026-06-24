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
exports.verifyPayment = exports.initiatePayment = void 0;
const razorpay_1 = __importDefault(require("razorpay"));
const crypto_1 = __importDefault(require("crypto"));
const Payment_1 = __importDefault(require("../models/Payment"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Settlement_1 = __importDefault(require("../models/Settlement"));
const dateHelper_1 = require("../utils/dateHelper");
const emailService_1 = require("../services/emailService");
const User_1 = __importDefault(require("../models/User"));
// Initialize Razorpay
// We default to fallback test keys if env variables are not present.
const razorpay = new razorpay_1.default({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_51Mz2wYSHB3q5Xn',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'fallback_secret'
});
/**
 * @desc    Initiate Razorpay order for advance booking fee (20%)
 * @route   POST /api/payments/initiate
 * @access  Private
 */
const initiatePayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { appointmentId, doctorId, hospitalId, consultationFee } = req.body;
        const userId = req.body.userId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        // Check required input fields
        if (!appointmentId || !hospitalId || !consultationFee) {
            res.status(400).json({ error: 'Missing required parameters: appointmentId, hospitalId, consultationFee' });
            return;
        }
        // Check appointmentId exists
        const appointment = yield Appointment_1.default.findById(appointmentId);
        if (!appointment) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }
        // Check consultationFee > 0
        const feeNum = Number(consultationFee);
        if (isNaN(feeNum) || feeNum <= 0) {
            res.status(400).json({ error: 'Invalid consultation fee' });
            return;
        }
        // Check userId exists
        if (!userId) {
            res.status(401).json({ error: 'User not authenticated' });
            return;
        }
        const user = yield User_1.default.findById(userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // Check payment not already done
        const existingCompletedPayment = yield Payment_1.default.findOne({ appointmentId, status: 'completed' });
        if (existingCompletedPayment) {
            res.status(400).json({ error: 'Appointment already paid' });
            return;
        }
        const advanceFee = feeNum * 0.20;
        // Create Razorpay order
        let order;
        try {
            order = yield razorpay.orders.create({
                amount: Math.round(advanceFee * 100), // paise
                currency: 'INR',
                receipt: appointmentId.toString(),
                payment_capture: 1
            });
        }
        catch (rzpErr) {
            console.error('[RazorpayOrderError]', rzpErr.message);
            res.status(500).json({ error: 'Payment gateway error' });
            return;
        }
        // Delete any existing non-completed payment documents to avoid uniqueness violation on appointmentId
        yield Payment_1.default.deleteMany({ appointmentId, status: { $ne: 'completed' } });
        // Save to DB
        const payment = new Payment_1.default({
            appointmentId,
            userId,
            hospitalId,
            consultationFee: feeNum,
            advanceFee,
            amount: advanceFee, // satisfies Mongoose schema validation requirement
            razorpayOrderId: order.id,
            status: 'pending',
            createdAt: new Date()
        });
        yield payment.save();
        res.status(200).json({
            success: true,
            razorpayOrderId: order.id,
            advanceFee: advanceFee,
            keyId: process.env.RAZORPAY_KEY_ID,
            appointmentId
        });
    }
    catch (error) {
        console.error('[PaymentInitiateError]', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.initiatePayment = initiatePayment;
/**
 * @desc    Verify Razorpay payment signature (Webhook or Direct frontend callback)
 * @route   POST /api/payments/verify
 * @access  Public (Webhook / Callback endpoint)
 */
const verifyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let razorpayPaymentId = '';
        let razorpayOrderId = '';
        let razorpaySignature = '';
        let isWebhook = false;
        // Check if it is a Webhook event from Razorpay
        if (req.headers['x-razorpay-signature']) {
            isWebhook = true;
            const signature = req.headers['x-razorpay-signature'];
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'fallback_secret';
            const hmac = crypto_1.default.createHmac('sha256', webhookSecret);
            hmac.update(JSON.stringify(req.body));
            const generatedSignature = hmac.digest('hex');
            // Allow failure bypass in non-production environments to ease local simulation
            if (generatedSignature !== signature && process.env.NODE_ENV === 'production') {
                res.status(400).json({ success: false, message: 'Invalid webhook signature' });
                return;
            }
            const event = req.body.event;
            // Handle order.paid or payment.captured
            if (event === 'order.paid' || event === 'payment.captured') {
                const paymentEntity = req.body.payload.payment.entity;
                razorpayPaymentId = paymentEntity.id;
                razorpayOrderId = paymentEntity.order_id;
            }
            else {
                // Ignore other events
                res.status(200).json({ success: true, message: 'Webhook event ignored' });
                return;
            }
        }
        else {
            // Direct client callback parameters
            razorpayPaymentId = req.body.razorpayPaymentId;
            razorpayOrderId = req.body.razorpayOrderId;
            razorpaySignature = req.body.razorpaySignature;
            if (!razorpayPaymentId || !razorpayOrderId) {
                res.status(400).json({ success: false, message: 'Missing payment verification tokens' });
                return;
            }
            // Verify signature
            const secret = process.env.RAZORPAY_KEY_SECRET || 'fallback_secret';
            const hmac = crypto_1.default.createHmac('sha256', secret);
            hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);
            const generatedSignature = hmac.digest('hex');
            // Skip signature check in dev mode if keys are not fully configured
            const isTestKeys = !process.env.RAZORPAY_KEY_SECRET || ((_a = process.env.RAZORPAY_KEY_ID) === null || _a === void 0 ? void 0 : _a.startsWith('rzp_test'));
            if (generatedSignature !== razorpaySignature && !isTestKeys && process.env.NODE_ENV === 'production') {
                res.status(400).json({ success: false, message: 'Invalid payment signature' });
                return;
            }
        }
        // Retrieve the pending payment record
        const payment = yield Payment_1.default.findOne({ razorpayOrderId });
        if (!payment) {
            res.status(404).json({ success: false, message: `Payment record not found for Order ID: ${razorpayOrderId}` });
            return;
        }
        // Avoid double processing
        if (payment.status === 'completed') {
            res.status(200).json({ success: true, message: 'Payment already verified and completed', payment });
            return;
        }
        // Success: Update payment record
        payment.status = 'completed';
        payment.razorpayPaymentId = razorpayPaymentId;
        yield payment.save();
        // Update appointment status to confirmed and paymentStatus to paid
        const appointment = yield Appointment_1.default.findById(payment.appointmentId);
        if (appointment) {
            appointment.status = 'confirmed';
            appointment.paymentStatus = 'paid';
            appointment.paymentSource = 'gateway';
            appointment.paymentUpdatedAt = new Date();
            yield appointment.save();
        }
        else {
            console.error(`[VerifyPayment] Appointment not found for ID: ${payment.appointmentId}`);
        }
        // Determine if hospital is under 3-month free trial
        const hospital = yield Hospital_1.default.findById(payment.hospitalId);
        let trialActive = false;
        if (hospital) {
            const now = new Date();
            if (hospital.trialEndDate) {
                trialActive = now < new Date(hospital.trialEndDate);
            }
            else if (hospital.createdAt) {
                const trialEnd = new Date(hospital.createdAt);
                trialEnd.setMonth(trialEnd.getMonth() + 3);
                trialActive = now < trialEnd;
            }
            else {
                trialActive = false;
            }
        }
        // Calculate settlement share
        const advanceFee = payment.advanceFee || payment.amount;
        const settledAmount = trialActive ? advanceFee : Math.round(advanceFee * 0.80);
        // Next Friday at 5:00 PM settlement date calculation
        const getNextWeeklyPayoutDate = (from = new Date()) => {
            const result = new Date(from);
            const day = result.getDay();
            const daysUntilFriday = (5 - day + 7) % 7 || 7;
            result.setDate(result.getDate() + daysUntilFriday);
            result.setHours(17, 0, 0, 0);
            return result;
        };
        const settledDate = getNextWeeklyPayoutDate();
        // Create settlement record
        yield Settlement_1.default.create({
            hospitalId: payment.hospitalId,
            appointmentId: payment.appointmentId,
            amount: advanceFee,
            type: 'advance_fee',
            status: 'pending_settlement',
            trialActive,
            settledDate,
            settledAmount
        });
        // Trigger booking confirmation email notifications
        if (appointment) {
            try {
                const populatedApp = yield Appointment_1.default.findById(appointment._id)
                    .populate('patient')
                    .populate('doctor')
                    .populate('hospital');
                if (populatedApp) {
                    const dateStr = (0, dateHelper_1.formatDateIST)(populatedApp.slotTime);
                    const timeSlotStr = (0, dateHelper_1.formatTimeIST)(populatedApp.slotTime);
                    yield (0, emailService_1.sendBookingConfirmationEmail)({
                        toEmail: populatedApp.patientEmail || populatedApp.patient.email,
                        patientName: populatedApp.patientName || populatedApp.patient.name || 'Patient',
                        hospitalName: populatedApp.hospital.name || 'Hospital',
                        date: dateStr,
                        timeSlot: timeSlotStr,
                        bookingId: populatedApp._id.toString()
                    });
                    if (populatedApp.hospital.email) {
                        try {
                            yield (0, emailService_1.sendHospitalNotificationEmail)({
                                hospitalEmail: populatedApp.hospital.email,
                                hospitalName: populatedApp.hospital.name,
                                patientName: populatedApp.patientName || populatedApp.patient.name || 'Patient',
                                patientEmail: populatedApp.patientEmail || populatedApp.patient.email,
                                patientPhone: populatedApp.patientPhone || populatedApp.patient.phone,
                                date: dateStr,
                                timeSlot: timeSlotStr,
                                bookingId: populatedApp._id.toString()
                            });
                        }
                        catch (emailError) {
                            console.error('Hospital confirmation email failure (non-critical):', emailError.message);
                        }
                    }
                }
            }
            catch (emailError) {
                console.error('User email confirmation failure (non-critical):', emailError.message);
            }
        }
        res.status(200).json({
            success: true,
            message: 'Payment verified and appointment confirmed successfully',
            payment
        });
    }
    catch (error) {
        console.error('[PaymentVerifyError]', error.message);
        res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
    }
});
exports.verifyPayment = verifyPayment;
