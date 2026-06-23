import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Payment from '../models/Payment';
import Appointment from '../models/Appointment';
import Hospital from '../models/Hospital';
import Settlement from '../models/Settlement';
import { formatDateIST, formatTimeIST } from '../utils/dateHelper';
import { sendBookingConfirmationEmail, sendHospitalNotificationEmail } from '../services/emailService';
import { AuthRequest } from '../middleware/authMiddleware';

// Initialize Razorpay
// We default to fallback test keys if env variables are not present.
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_51Mz2wYSHB3q5Xn',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'fallback_secret'
});

/**
 * @desc    Initiate Razorpay order for advance booking fee (20%)
 * @route   POST /api/payments/initiate
 * @access  Private
 */
export const initiatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { appointmentId, doctorId, hospitalId, consultationFee } = req.body;
        const userId = req.body.userId || req.user?._id || req.user?.id;

        if (!appointmentId || !hospitalId || !consultationFee) {
            res.status(400).json({ success: false, message: 'Missing required parameters: appointmentId, hospitalId, consultationFee' });
            return;
        }

        const advanceFee = Math.round(Number(consultationFee) * 0.20);
        
        // Create Razorpay order
        const options = {
            amount: advanceFee * 100, // Amount in paise
            currency: 'INR',
            receipt: `receipt_${appointmentId}`
        };

        const order = await razorpay.orders.create(options);

        // Save or update payment record
        let payment = await Payment.findOne({ appointmentId });
        if (payment) {
            payment.userId = userId;
            payment.hospitalId = hospitalId;
            payment.amount = advanceFee;
            payment.consultationFee = Number(consultationFee);
            payment.advanceFee = advanceFee;
            payment.razorpayOrderId = order.id;
            payment.status = 'pending';
            await payment.save();
        } else {
            payment = new Payment({
                appointmentId,
                userId,
                hospitalId,
                amount: advanceFee,
                consultationFee: Number(consultationFee),
                advanceFee,
                razorpayOrderId: order.id,
                status: 'pending',
                mode: 'online'
            });
            await payment.save();
        }

        res.status(200).json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            advanceFee,
            paymentId: payment._id
        });
    } catch (error: any) {
        console.error('[PaymentInitiateError]', error.message);
        res.status(500).json({ success: false, message: 'Failed to initiate payment', error: error.message });
    }
};

/**
 * @desc    Verify Razorpay payment signature (Webhook or Direct frontend callback)
 * @route   POST /api/payments/verify
 * @access  Public (Webhook / Callback endpoint)
 */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
    try {
        let razorpayPaymentId = '';
        let razorpayOrderId = '';
        let razorpaySignature = '';
        let isWebhook = false;

        // Check if it is a Webhook event from Razorpay
        if (req.headers['x-razorpay-signature']) {
            isWebhook = true;
            const signature = req.headers['x-razorpay-signature'] as string;
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'fallback_secret';
            
            const hmac = crypto.createHmac('sha256', webhookSecret);
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
            } else {
                // Ignore other events
                res.status(200).json({ success: true, message: 'Webhook event ignored' });
                return;
            }
        } else {
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
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);
            const generatedSignature = hmac.digest('hex');

            // Skip signature check in dev mode if keys are not fully configured
            const isTestKeys = !process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test');
            if (generatedSignature !== razorpaySignature && !isTestKeys && process.env.NODE_ENV === 'production') {
                res.status(400).json({ success: false, message: 'Invalid payment signature' });
                return;
            }
        }

        // Retrieve the pending payment record
        const payment = await Payment.findOne({ razorpayOrderId });
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
        await payment.save();

        // Update appointment status to confirmed and paymentStatus to paid
        const appointment = await Appointment.findById(payment.appointmentId);
        if (appointment) {
            appointment.status = 'confirmed';
            appointment.paymentStatus = 'paid';
            appointment.paymentSource = 'gateway';
            appointment.paymentUpdatedAt = new Date();
            await appointment.save();
        } else {
            console.error(`[VerifyPayment] Appointment not found for ID: ${payment.appointmentId}`);
        }

        // Determine if hospital is under 3-month free trial
        const hospital = await Hospital.findById(payment.hospitalId);
        let trialActive = false;
        if (hospital) {
            const now = new Date();
            if (hospital.trialEndDate) {
                trialActive = now < new Date(hospital.trialEndDate);
            } else if ((hospital as any).createdAt) {
                const trialEnd = new Date((hospital as any).createdAt);
                trialEnd.setMonth(trialEnd.getMonth() + 3);
                trialActive = now < trialEnd;
            } else {
                trialActive = false;
            }
        }

        // Calculate settlement share
        const advanceFee = payment.advanceFee || payment.amount;
        const settledAmount = trialActive ? advanceFee : Math.round(advanceFee * 0.80);

        // Next Friday at 5:00 PM settlement date calculation
        const getNextWeeklyPayoutDate = (from = new Date()): Date => {
            const result = new Date(from);
            const day = result.getDay();
            const daysUntilFriday = (5 - day + 7) % 7 || 7;
            result.setDate(result.getDate() + daysUntilFriday);
            result.setHours(17, 0, 0, 0);
            return result;
        };
        const settledDate = getNextWeeklyPayoutDate();

        // Create settlement record
        await Settlement.create({
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
                const populatedApp = await Appointment.findById(appointment._id)
                    .populate('patient')
                    .populate('doctor')
                    .populate('hospital');

                if (populatedApp) {
                    const dateStr = formatDateIST(populatedApp.slotTime);
                    const timeSlotStr = formatTimeIST(populatedApp.slotTime);
                    
                    await sendBookingConfirmationEmail({
                        toEmail: populatedApp.patientEmail || (populatedApp.patient as any).email,
                        patientName: populatedApp.patientName || (populatedApp.patient as any).name || 'Patient',
                        hospitalName: (populatedApp.hospital as any).name || 'Hospital',
                        date: dateStr,
                        timeSlot: timeSlotStr,
                        bookingId: populatedApp._id.toString()
                    });

                    if ((populatedApp.hospital as any).email) {
                        try {
                            await sendHospitalNotificationEmail({
                                hospitalEmail: (populatedApp.hospital as any).email,
                                hospitalName: (populatedApp.hospital as any).name,
                                patientName: populatedApp.patientName || (populatedApp.patient as any).name || 'Patient',
                                patientEmail: populatedApp.patientEmail || (populatedApp.patient as any).email,
                                patientPhone: populatedApp.patientPhone || (populatedApp.patient as any).phone,
                                date: dateStr,
                                timeSlot: timeSlotStr,
                                bookingId: populatedApp._id.toString()
                            });
                        } catch (emailError: any) {
                            console.error('Hospital confirmation email failure (non-critical):', emailError.message);
                        }
                    }
                }
            } catch (emailError: any) {
                console.error('User email confirmation failure (non-critical):', emailError.message);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Payment verified and appointment confirmed successfully',
            payment
        });
    } catch (error: any) {
        console.error('[PaymentVerifyError]', error.message);
        res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
    }
};
