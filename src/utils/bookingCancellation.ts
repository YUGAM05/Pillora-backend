import Appointment from '../models/Appointment';
import Payment from '../models/Payment';
import { getRazorpay, razorpayErrorMessage } from './razorpayClient';
import { releaseSeat, releaseHold } from './slotBooking';
import { isPaidOutToHospital, recordHospitalCancellationDeduction } from './hospitalDeductions';
import { notifyPatientOfCancellation } from './cancellationNotice';

// ok=true: gatewayRefundId/gatewayStatus/amount set. ok=false: error set.
export type RefundResult = { ok: boolean; gatewayRefundId?: string; gatewayStatus?: string; amount?: number; error?: string };

/**
 * Refund (part of) an online Razorpay payment. Never pretends: returns ok only when Razorpay
 * accepted the refund, otherwise the gateway's error. Caller decides what to record.
 */
export const refundRazorpayPayment = async (
    payment: any,
    amountRupees: number,
    notes: Record<string, string>
): Promise<RefundResult> => {
    if (!payment?.razorpayPaymentId) {
        return { ok: false, error: 'This payment has no Razorpay payment ID, so it cannot be refunded through the gateway.' };
    }
    const paid = Number(payment.amount) || 0;
    if (!(amountRupees > 0) || amountRupees > paid + 0.001) {
        return { ok: false, error: `Refund amount must be more than 0 and at most the paid amount (₹${paid}).` };
    }
    try {
        const refund: any = await getRazorpay().payments.refund(payment.razorpayPaymentId, {
            amount: Math.round(amountRupees * 100),
            notes
        } as any);
        return { ok: true, gatewayRefundId: refund.id, gatewayStatus: refund.status || 'pending', amount: amountRupees };
    } catch (err: any) {
        return { ok: false, error: razorpayErrorMessage(err) };
    }
};

/**
 * Apply a successful full/partial refund to the Payment and Appointment documents (not saved).
 * An advance that was already paid out to the hospital keeps its settlement status (the money did go
 * out); the recovery is tracked as a HospitalDeduction instead.
 */
export const applyRefundToRecords = (payment: any, appointment: any, refund: RefundResult, reason: string) => {
    const refundAmount = Number(refund.amount) || 0;
    const paid = Number(payment.amount) || 0;
    const full = refundAmount >= paid - 0.001;
    const paidOut = isPaidOutToHospital(payment);
    payment.status = full ? (refund.gatewayStatus === 'processed' ? 'refunded' : 'refund_initiated') : payment.status;
    // A refunded advance must not be paid out to the hospital; a partial refund needs an admin decision.
    if (!paidOut) payment.settlementStatus = full ? 'refunded' : 'Under Review';
    payment.refundDetails = {
        refundId: refund.gatewayRefundId,
        amount: refundAmount,
        reason,
        refundedAt: new Date()
    };
    if (appointment) {
        appointment.advancePaid = Math.max(0, (Number(appointment.advancePaid) || 0) - refundAmount);
        if (full) appointment.paymentStatus = 'refunded';
        appointment.paymentUpdatedAt = new Date();
    }
};

export type CancelActor = 'patient' | 'hospital' | 'admin';

// ok=true: appointment + refund set. ok=false: status (HTTP) set.
export type CancelResult = {
    ok: boolean;
    appointment?: any;
    refund?: 'refunded' | 'retained' | 'none';
    refundAmount?: number;
    /** What the hospital is charged for this cancellation (taken from its next settlement). */
    hospitalCharge?: number;
    status?: number;
    message: string;
};

/**
 * Shared cancellation logic (patient / hospital / admin), keeping the existing policy:
 *   - hospital or admin cancels a paid online booking  -> full refund of the advance via Razorpay
 *       hospital: its next settlement is reduced by the Razorpay charge Pillora loses (2.36%), or by the
 *       full advance if that advance was already paid out (HospitalDeduction); admin: Pillora bears it
 *   - hospital or admin cancels                        -> the patient is told (in-app, email, WhatsApp)
 *   - patient cancels a paid online booking            -> no refund (advance retained_by_pillora)
 *   - unpaid pending booking                           -> pending payment marked failed
 * If the Razorpay refund fails, NOTHING is changed and the error is returned (no fake "refunded").
 * The seat on the slot (and any checkout hold) is given back exactly once.
 * Authorization is the caller's job.
 */
export const cancelAppointmentWithPolicy = async (appointmentId: any, actor: CancelActor, reason?: string): Promise<CancelResult> => {
    const appointment: any = await Appointment.findById(appointmentId);
    if (!appointment) return { ok: false, status: 404, message: 'Appointment not found' };
    if (appointment.status === 'cancelled') return { ok: false, status: 400, message: 'Appointment is already cancelled' };

    const priorStatus = appointment.status;
    const payment: any = await Payment.findOne({
        appointmentId: appointment._id,
        paymentSource: 'pillora_online',
        status: { $in: ['completed', 'paid', 'pending'] }
    }).sort({ createdAt: -1 });

    let refundOutcome: 'refunded' | 'retained' | 'none' = 'none';
    let refundAmount = 0;
    let hospitalCharge = 0;
    const cancelReason = reason || (actor === 'patient' ? 'Cancelled by patient' : actor === 'hospital' ? 'Hospital cancelled appointment' : 'Cancelled by Pillora admin');

    if (payment && (payment.status === 'completed' || payment.status === 'paid')) {
        if (actor === 'hospital' || actor === 'admin') {
            const paidOut = isPaidOutToHospital(payment);
            const refund = await refundRazorpayPayment(payment, Number(payment.amount) || 0, {
                reason: cancelReason,
                appointmentId: appointment._id.toString()
            });
            if (!refund.ok) {
                console.error(`[CancelRefundError] appointment ${appointment._id}:`, refund.error);
                return {
                    ok: false,
                    status: 502,
                    message: `The appointment was NOT cancelled because the refund of the online advance failed: ${refund.error}. Please try again or contact Pillora support.`
                };
            }
            applyRefundToRecords(payment, appointment, refund, cancelReason);
            refundOutcome = 'refunded';
            refundAmount = Number(refund.amount) || 0;
            if (actor === 'hospital') {
                const deduction = await recordHospitalCancellationDeduction({ payment, appointment, paidOut, reason: cancelReason });
                hospitalCharge = Number(deduction?.amount) || 0;
            }
        } else {
            payment.settlementStatus = 'retained_by_pillora';
            refundOutcome = 'retained';
        }
        await payment.save();
    } else if (payment && payment.status === 'pending') {
        payment.status = 'failed';
        payment.settlementStatus = 'not_applicable';
        await payment.save();
    }

    appointment.status = 'cancelled';
    appointment.notes = appointment.notes ? `${appointment.notes}\nCancellation reason: ${cancelReason}` : `Cancellation reason: ${cancelReason}`;
    await appointment.save();

    await releaseSeat(appointment, priorStatus);
    if (appointment.slot && appointment.patient) {
        await releaseHold(appointment.slot, appointment.patient);
    }

    if (actor === 'hospital' || actor === 'admin') {
        // Fire and forget: messages must never block or fail the cancellation
        void notifyPatientOfCancellation(appointment, refundAmount);
    }

    const message = refundOutcome === 'refunded'
        ? `Appointment cancelled. ₹${refundAmount.toFixed(2)} has been refunded to the patient` +
          (hospitalCharge > 0 ? `; ₹${hospitalCharge.toFixed(2)} will be deducted from your next settlement.` : '.')
        : refundOutcome === 'retained'
            ? 'Appointment cancelled. As per policy, the advance paid online is not refunded for patient cancellations.'
            : 'Appointment cancelled successfully.';
    return { ok: true, appointment, refund: refundOutcome, refundAmount, hospitalCharge, message };
};
