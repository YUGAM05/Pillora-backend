import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Payment from '../models/Payment';
import Appointment from '../models/Appointment';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import { formatDateIST, formatTimeIST } from '../utils/dateHelper';
import { sendBookingConfirmationEmail, sendHospitalNotificationEmail } from '../services/emailService';
import { sendAppointmentNotification } from '../services/pushNotificationService';
import { sendCountedTemplate } from '../services/usageService';
import { AuthRequest } from '../middleware/authMiddleware';
import { getRazorpay, razorpayErrorMessage } from '../utils/razorpayClient';
import { acquireHold, claimSeat, holdFailureResponse, PAYMENT_HOLD_MS } from '../utils/slotBooking';
import { refundRazorpayPayment, applyRefundToRecords } from '../utils/bookingCancellation';

/** 20% advance collected online (business rule — unchanged). */
const ADVANCE_RATE = 0.20;

const userIdOf = (req: AuthRequest): string => String(req.user?._id || req.user?.id || '');

/**
 * Consultation fee is ALWAYS taken from the server: the doctor's fee, or the fee stored on the
 * appointment when it was created on the server (hold flow). Client fee/amount fields are ignored.
 */
const resolveConsultationFee = async (appointment: any): Promise<number | null> => {
    const doctor: any = appointment?.doctor ? await Doctor.findById(appointment.doctor).select('fee').lean() : null;
    const fee = Number(doctor?.fee) > 0 ? Number(doctor.fee) : Number(appointment?.consultationFee);
    return fee > 0 ? fee : null;
};

/** Advance in paise and rupees, derived from the fee (rupee value is exactly paise / 100). */
const advanceFor = (fee: number) => {
    const paise = Math.round(fee * ADVANCE_RATE * 100);
    return { paise, rupees: paise / 100 };
};

/** Constant-time comparison of two hex signatures. */
const safeEqualHex = (a: string, b: string): boolean => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
};

/**
 * Shared order creation for /initiate and /create-order:
 * owner check, server-side amount, slot still available (hold refreshed for the payment window).
 */
const createOrderForAppointment = async (req: AuthRequest, res: Response, appointmentId: any, patientDetails?: any): Promise<{ order: any; payment: any; fee: number } | null> => {
    const uid = userIdOf(req);
    if (!uid) {
        res.status(401).json({ error: 'User not authenticated' });
        return null;
    }
    if (!appointmentId || !mongoose.Types.ObjectId.isValid(String(appointmentId))) {
        res.status(400).json({ error: 'Missing required parameter: appointmentId' });
        return null;
    }

    const appointment: any = await Appointment.findById(appointmentId);
    if (!appointment || String(appointment.patient) !== uid) {
        res.status(404).json({ error: 'Appointment not found' });
        return null;
    }
    if (appointment.status !== 'pending') {
        res.status(400).json({ error: appointment.status === 'cancelled' ? 'This appointment was cancelled' : 'Appointment already paid' });
        return null;
    }

    const existingCompletedPayment = await Payment.findOne({ appointmentId: appointment._id, status: { $in: ['completed', 'paid'] } });
    if (existingCompletedPayment) {
        res.status(400).json({ error: 'Appointment already paid' });
        return null;
    }

    const fee = await resolveConsultationFee(appointment);
    if (!fee) {
        res.status(400).json({ error: 'Consultation fee is not configured for this doctor' });
        return null;
    }
    const advance = advanceFor(fee);

    // The patient must still have (or be able to get) a seat before we take money.
    const slotDoc: any = await Slot.findById(appointment.slot).select('doctor').lean();
    const doctor: any = slotDoc ? await Doctor.findById(slotDoc.doctor).select('maxAppointmentsPerSlot').lean() : null;
    const hold = await acquireHold(appointment.slot, uid, { fallbackCap: doctor?.maxAppointmentsPerSlot || 1, holdMs: PAYMENT_HOLD_MS });
    if (!hold.ok) {
        const r = holdFailureResponse(hold.reason);
        res.status(409).json({ error: r.message, code: r.code });
        return null;
    }

    if (patientDetails) {
        const { patientName, patientPhone, patientEmail, patientAge } = patientDetails;
        if (typeof patientName === 'string' && patientName.trim()) appointment.patientName = patientName.trim().slice(0, 100);
        if (typeof patientPhone === 'string' && patientPhone.trim()) appointment.patientPhone = patientPhone.trim().slice(0, 20);
        if (typeof patientEmail === 'string' && patientEmail.trim()) appointment.patientEmail = patientEmail.trim().slice(0, 200);
        const age = Number(patientAge);
        if (age > 0 && age < 130) appointment.patientAge = age;
    }
    appointment.consultationFee = fee;
    await appointment.save();

    let order: any;
    try {
        order = await getRazorpay().orders.create({
            amount: advance.paise,
            currency: 'INR',
            receipt: appointment._id.toString(),
            payment_capture: 1 as any,
            notes: { appointmentId: appointment._id.toString() }
        } as any);
    } catch (rzpErr: any) {
        console.error('[RazorpayOrderError]', razorpayErrorMessage(rzpErr));
        res.status(502).json({ error: 'Payment gateway error' });
        return null;
    }

    // Older unpaid order rows for this appointment are replaced (existing behaviour)
    await Payment.deleteMany({ appointmentId: appointment._id, status: 'pending' });

    const payment = new Payment({
        appointmentId: appointment._id,
        userId: appointment.patient,
        hospitalId: appointment.hospital,
        consultationFee: fee,
        advanceFee: advance.rupees,
        amount: advance.rupees,
        amountInPaise: advance.paise,
        paymentType: 'advance',
        paymentSource: 'pillora_online',
        paymentMethod: 'razorpay',
        mode: 'online',
        razorpayOrderId: order.id,
        status: 'pending',
        settlementStatus: 'Pending'
    });
    await payment.save();

    return { order, payment, fee };
};

/**
 * @desc    Initiate Razorpay order for advance booking fee (20%)
 * @route   POST /api/payments/initiate
 * @access  Private (appointment's patient). consultationFee / hospitalId / userId in the body are ignored.
 */
export const initiatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const result = await createOrderForAppointment(req, res, req.body?.appointmentId);
        if (!result) return;
        res.status(200).json({
            success: true,
            razorpayOrderId: result.order.id,
            advanceFee: result.payment.advanceFee,
            keyId: process.env.RAZORPAY_KEY_ID,
            appointmentId: String(result.payment.appointmentId)
        });
    } catch (error: any) {
        console.error('[PaymentInitiateError]', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * @desc    Create Razorpay payment order and update appointment patient details
 * @route   POST /api/payments/create-order
 * @access  Private (appointment's patient). The `amount` in the body is ignored; the server computes it.
 */
export const createPaymentOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const result = await createOrderForAppointment(req, res, req.body?.appointmentId, req.body);
        if (!result) return;
        res.status(200).json({
            success: true,
            orderId: result.order.id,
            amount: result.order.amount,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (error: any) {
        console.error('[CreatePaymentOrderError]', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * @desc    Verify a Razorpay payment (Razorpay webhook, or the checkout page's callback)
 * @route   POST /api/payments/verify
 * @access  Webhook: X-Razorpay-Signature with RAZORPAY_WEBHOOK_SECRET.
 *          Callback: logged-in patient who owns the booking + checkout signature with RAZORPAY_KEY_SECRET.
 *
 * Flow (idempotent, safe under webhook/callback races):
 *   1. signature always verified; amount/order/status confirmed with Razorpay data.
 *   2. Payment row moved pending -> completed with ONE conditional update; only that winner continues.
 *   3. winner takes a slot seat atomically (capacity check). Success -> appointment confirmed.
 *      Slot full (hold expired and someone else booked) -> automatic refund, appointment cancelled.
 *   4. everyone else just reports the current state.
 */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
    try {
        let razorpayPaymentId = '';
        let razorpayOrderId = '';
        let paidAmountPaise: number | null = null;
        let paidCurrency = 'INR';
        const isWebhook = !!req.headers['x-razorpay-signature'];

        if (isWebhook) {
            const signature = String(req.headers['x-razorpay-signature']);
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
            if (!webhookSecret) {
                console.error('[VerifyPayment] Webhook rejected: RAZORPAY_WEBHOOK_SECRET is not set');
                res.status(400).json({ success: false, message: 'Invalid webhook signature' });
                return;
            }
            // Razorpay signs the raw body. app.ts must keep req.rawBody for this route; the re-serialised
            // body is only a fallback (still a real HMAC check, but may not match byte-for-byte).
            const rawBody: Buffer | string = (req as any).rawBody || JSON.stringify(req.body);
            const generatedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
            if (!safeEqualHex(generatedSignature, signature)) {
                res.status(400).json({ success: false, message: 'Invalid webhook signature' });
                return;
            }

            const event = req.body?.event;
            if (event !== 'order.paid' && event !== 'payment.captured') {
                res.status(200).json({ success: true, message: 'Webhook event ignored' });
                return;
            }
            const paymentEntity = req.body?.payload?.payment?.entity || {};
            razorpayPaymentId = String(paymentEntity.id || '');
            razorpayOrderId = String(paymentEntity.order_id || '');
            paidAmountPaise = Number(paymentEntity.amount);
            paidCurrency = paymentEntity.currency || 'INR';
            if (!razorpayPaymentId || !razorpayOrderId || paymentEntity.status !== 'captured') {
                res.status(200).json({ success: true, message: 'Webhook event ignored' });
                return;
            }
        } else {
            const user = (req as AuthRequest).user;
            if (!user) {
                res.status(401).json({ success: false, message: 'Please log in to verify your payment' });
                return;
            }
            razorpayPaymentId = req.body?.razorpayPaymentId;
            razorpayOrderId = req.body?.razorpayOrderId;
            const razorpaySignature = req.body?.razorpaySignature;

            if (typeof razorpayPaymentId !== 'string' || typeof razorpayOrderId !== 'string' || !razorpayPaymentId || !razorpayOrderId) {
                res.status(400).json({ success: false, message: 'Missing payment verification tokens' });
                return;
            }

            // Signature is ALWAYS checked — test keys and non-production included.
            const secret = process.env.RAZORPAY_KEY_SECRET;
            if (!secret) {
                console.error('[VerifyPayment] RAZORPAY_KEY_SECRET is not configured');
                res.status(500).json({ success: false, message: 'Payment verification unavailable' });
                return;
            }
            const generatedSignature = crypto.createHmac('sha256', secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
            if (!safeEqualHex(generatedSignature, String(razorpaySignature || ''))) {
                res.status(400).json({ success: false, message: 'Invalid payment signature' });
                return;
            }

            // Ask Razorpay what was actually paid instead of trusting the client
            try {
                let rzpPayment: any = await getRazorpay().payments.fetch(razorpayPaymentId);
                if (rzpPayment.order_id !== razorpayOrderId) {
                    res.status(400).json({ success: false, message: 'Payment does not belong to this order' });
                    return;
                }
                if (rzpPayment.status === 'authorized') {
                    // Orders are auto-capture; capture now if Razorpay has not done it yet
                    rzpPayment = await getRazorpay().payments.capture(razorpayPaymentId, rzpPayment.amount, rzpPayment.currency || 'INR');
                }
                if (rzpPayment.status !== 'captured') {
                    res.status(400).json({ success: false, message: 'Payment is not complete' });
                    return;
                }
                paidAmountPaise = Number(rzpPayment.amount);
                paidCurrency = rzpPayment.currency || 'INR';
            } catch (fetchErr: any) {
                console.error('[VerifyPayment] Could not confirm payment with Razorpay:', razorpayErrorMessage(fetchErr));
                res.status(502).json({ success: false, message: 'Could not confirm payment with the gateway. Please contact support with your payment ID.' });
                return;
            }
        }

        const payment: any = await Payment.findOne({ razorpayOrderId: String(razorpayOrderId) });
        if (!payment) {
            console.error(`[VerifyPayment] No Payment row for captured order ${razorpayOrderId} (payment ${razorpayPaymentId})`);
            res.status(404).json({ success: false, message: 'Payment record not found for this order. Please contact support with your payment ID.' });
            return;
        }

        const appointmentDoc: any = await Appointment.findById(payment.appointmentId).select('patient slot doctor status');
        if (!isWebhook) {
            const uid = userIdOf(req as AuthRequest);
            if (String(payment.userId || appointmentDoc?.patient) !== uid && String(appointmentDoc?.patient) !== uid) {
                res.status(403).json({ success: false, message: 'This payment does not belong to your account' });
                return;
            }
        }

        // The captured amount must equal the server-computed amount stored when the order was made.
        const expectedPaise = Number(payment.amountInPaise) || Math.round(Number(payment.amount) * 100);
        if (paidAmountPaise !== expectedPaise || paidCurrency !== 'INR') {
            console.error(`[VerifyPayment] Amount mismatch for order ${razorpayOrderId}: paid=${paidAmountPaise} ${paidCurrency} expected=${expectedPaise}`);
            res.status(400).json({ success: false, message: 'Paid amount does not match the booking amount. Please contact support.' });
            return;
        }

        // Step 2: single winner moves the payment to completed (money is in — record it truthfully).
        // Settlement stays 'On Hold' until the seat is secured below.
        const claimed: any = await Payment.findOneAndUpdate(
            { _id: payment._id, status: 'pending' },
            {
                $set: {
                    status: 'completed',
                    razorpayPaymentId,
                    settlementStatus: 'On Hold',
                    paymentType: 'advance',
                    paymentSource: 'pillora_online',
                    paymentMethod: 'razorpay',
                    mode: 'online'
                }
            },
            { new: true }
        );

        if (!claimed) {
            // Already processed (or being processed) by the webhook / another callback: report current state.
            for (let i = 0; i < 5; i++) {
                const current: any = await Appointment.findById(payment.appointmentId).select('status');
                if (current?.status && current.status !== 'pending') {
                    if (current.status === 'cancelled') {
                        res.status(409).json({ success: false, message: 'This slot was booked by someone else before your payment completed. Your advance is being refunded.' });
                    } else {
                        res.status(200).json({ success: true, message: 'Payment already verified and completed' });
                    }
                    return;
                }
                await sleep(1000);
            }
            res.status(202).json({ success: false, message: 'Payment received. Your booking is being confirmed — please check My Bookings in a minute.' });
            return;
        }

        const appointment: any = await Appointment.findById(payment.appointmentId);
        if (!appointment) {
            console.error(`[VerifyPayment] Appointment ${payment.appointmentId} missing for paid order ${razorpayOrderId}; payment left On Hold for admin review`);
            res.status(200).json({ success: true, message: 'Payment received. Please contact support to confirm your booking.' });
            return;
        }

        // Step 3: take the seat (converts the patient's own hold; other patients' holds count against capacity)
        const doctor: any = await Doctor.findById(appointment.doctor).select('maxAppointmentsPerSlot').lean();
        const seat = appointment.status === 'pending'
            ? await claimSeat(appointment.slot, { holderUserId: appointment.patient, fallbackCap: doctor?.maxAppointmentsPerSlot || 1, appointmentId: appointment._id })
            : null;

        if (!seat) {
            // Slot filled (or appointment no longer pending) while the patient was paying: refund, never double-book.
            const reason = appointment.status === 'pending'
                ? 'Slot became full before payment completed'
                : `Payment received for an appointment in status ${appointment.status}`;
            const refund = await refundRazorpayPayment(claimed, Number(claimed.amount), { reason, appointmentId: appointment._id.toString() });
            if (refund.ok) {
                applyRefundToRecords(claimed, appointment, refund, reason);
                await claimed.save();
            } else {
                console.error(`[VerifyPayment] AUTO-REFUND FAILED for payment ${claimed._id}: ${refund.error}`);
                claimed.notes = `${claimed.notes ? claimed.notes + '\n' : ''}Refund required (${reason}); automatic refund failed: ${refund.error}`;
                claimed.settlementStatus = 'Under Review';
                await claimed.save();
                // keep paymentStatus 'partial' so it shows in admin refund candidates
                appointment.advancePaid = Number(claimed.amount);
                appointment.paymentStatus = 'partial';
            }
            if (appointment.status === 'pending') {
                appointment.status = 'cancelled';
                appointment.notes = `${appointment.notes ? appointment.notes + '\n' : ''}Cancellation reason: ${reason}`;
            }
            await appointment.save();
            res.status(409).json({
                success: false,
                message: refund.ok
                    ? 'Sorry, this slot was booked by someone else before your payment completed. Your advance has been refunded.'
                    : 'Sorry, this slot was booked by someone else before your payment completed. Our team will refund your advance — please contact support with your payment ID.'
            });
            return;
        }

        const feeNum = Number(claimed.consultationFee) || Number(appointment.consultationFee);
        const advanceFee = Number(claimed.amount);
        const advancePaise = Number(claimed.amountInPaise) || Math.round(advanceFee * 100);
        const feePaise = Math.round(advancePaise * 0.02);
        const taxPaise = Math.round(feePaise * 0.18);

        claimed.gatewayCharges = feePaise / 100;
        claimed.gatewayTaxes = taxPaise / 100;
        claimed.netPayable = (advancePaise - feePaise - taxPaise) / 100;
        claimed.settlementStatus = 'Pending';
        await claimed.save();

        appointment.status = 'confirmed';
        appointment.slotSeatHeld = true;
        appointment.consultationFee = feeNum;
        appointment.advanceRequired = advanceFee;
        appointment.advancePaid = advanceFee;
        appointment.balancePaid = 0;
        appointment.balanceDue = Math.max(0, feeNum - advanceFee);
        appointment.paymentStatus = 'partial';
        appointment.paymentSource = 'gateway';
        appointment.paymentUpdatedAt = new Date();
        await appointment.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('slotBooked', {
                slotId: String(seat._id),
                doctorId: String(seat.doctor),
                date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(seat.startTime),
                bookedCount: seat.booked_count,
                holdCount: seat.hold_count,
                maxAppointments: seat.max_appointments,
                status: seat.status
            });
        }

        await sendBookingNotifications(appointment);

        res.status(200).json({
            success: true,
            message: 'Payment verified and appointment confirmed successfully',
            payment: claimed
        });
    } catch (error: any) {
        console.error('[PaymentVerifyError]', error.message);
        res.status(500).json({ success: false, message: 'Payment verification failed' });
    }
};

/** Email / WhatsApp / push notifications after a confirmed online booking (non-critical). */
const sendBookingNotifications = async (appointment: any): Promise<void> => {
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

            // Dispatch WhatsApp Appointment Confirmation notification
            const targetPatientPhone = populatedApp.patientPhone || 
                                       (populatedApp.patient as any)?.phoneNumber || 
                                       (populatedApp.patient as any)?.phone;

            if (targetPatientPhone) {
                try {
                    const patName = populatedApp.patientName || (populatedApp.patient as any)?.name || 'Patient';
                    const docName = populatedApp.doctorName || ((populatedApp.doctor as any)?.name ? `Dr. ${(populatedApp.doctor as any).name}` : '') || 'Doctor';
                    const hospName = (populatedApp.hospital as any)?.name || populatedApp.hospitalName || 'Pillora Hospital';

                    const apptDateRaw = populatedApp.slotTime || populatedApp.appointmentDate;
                    const d = new Date(apptDateRaw);
                    const formattedApptDate = !isNaN(d.getTime())
                        ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
                        : String(populatedApp.appointmentDate || '');

                    const formattedApptTime = !isNaN(d.getTime())
                        ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
                        : String(populatedApp.appointmentTime || '');

                    console.log(`[WhatsApp Service] 🚀 Dispatching appointment_confirmation template to ${targetPatientPhone}...`);
                    const waResult = await sendCountedTemplate(
                        { hospitalId: (populatedApp.hospital as any)?._id ?? populatedApp.hospital, kind: 'confirmation', appointmentId: populatedApp._id },
                        targetPatientPhone,
                        'appointment_confirmation',
                        'en',
                        [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: patName },
                                    { type: 'text', text: docName },
                                    { type: 'text', text: hospName },
                                    { type: 'text', text: formattedApptDate },
                                    { type: 'text', text: formattedApptTime }
                                ]
                            }
                        ]
                    );

                    if (!waResult.success) {
                        console.error('[WhatsApp Service] ❌ Failed to deliver appointment_confirmation WhatsApp message:', waResult.error);
                    } else {
                        console.log(`[WhatsApp Service] ✅ appointment_confirmation WhatsApp template delivered successfully to ${targetPatientPhone}`);
                    }
                } catch (waErr: any) {
                    console.error('[WhatsApp Service] ❌ Appointment confirmation WhatsApp dispatch error:', waErr.message || waErr);
                }
            } else {
                console.warn('[WhatsApp Service] ⚠️ Could not send WhatsApp appointment_confirmation: Patient phone number missing from appointment and user record.');
            }

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

            // Trigger real-time browser push notification to hospital admin
            try {
                const patName = populatedApp.patientName || (populatedApp.patient as any).name || 'Patient';
                const docName = populatedApp.doctorName || (populatedApp.doctor as any).name || 'Doctor';
                const hospitalId = (populatedApp.hospital as any)._id?.toString() || populatedApp.hospital.toString();
                await sendAppointmentNotification(hospitalId, {
                    appointmentId: populatedApp._id.toString(),
                    patientName: patName,
                    doctorName: docName,
                    appointmentDate: dateStr,
                    appointmentTime: timeSlotStr
                });
            } catch (pushErr: any) {
                console.error('Web Push notification broadcast failure (non-critical):', pushErr.message);
            }
        }
    } catch (emailError: any) {
        console.error('User email confirmation failure (non-critical):', emailError.message);
    }
};
