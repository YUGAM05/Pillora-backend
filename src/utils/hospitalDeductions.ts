import mongoose from 'mongoose';
import HospitalDeduction from '../models/HospitalDeduction';
import { calculateAdvanceGatewaySplit } from './financialCalculator';

/** Payment settlement states meaning the advance has already been paid out to the hospital. */
export const PAID_OUT_STATUSES = ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation'];

export const isPaidOutToHospital = (payment: any): boolean => PAID_OUT_STATUSES.includes(String(payment?.settlementStatus || ''));

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * What a hospital-initiated cancellation of this paid online advance will cost the hospital.
 * Not yet paid out -> the Razorpay charge (2% + 18% GST) Pillora loses on the refunded payment.
 * Already paid out -> the full advance (Pillora refunds the patient from its own balance).
 */
export const hospitalCancellationCharge = (payment: any) => {
    const refundAmount = round2(Number(payment?.amount) || 0);
    const paidOut = isPaidOutToHospital(payment);
    const amount = paidOut ? refundAmount : calculateAdvanceGatewaySplit(refundAmount).gatewayCharges;
    return { refundAmount, amount: round2(amount), type: (paidOut ? 'settled_refund' : 'gateway_charge') as 'settled_refund' | 'gateway_charge', paidOut };
};

/**
 * Record the deduction after a successful refund of a hospital-cancelled booking.
 * `paidOut` must be decided BEFORE the payment's settlement status is changed by the refund.
 * Idempotent per payment (unique index); never throws.
 */
export const recordHospitalCancellationDeduction = async (args: {
    payment: any;
    appointment?: any;
    paidOut: boolean;
    reason: string;
}) => {
    const { payment, appointment, paidOut, reason } = args;
    try {
        const refundAmount = round2(Number(payment?.amount) || 0);
        if (!(refundAmount > 0) || !payment?.hospitalId) return null;
        const amount = paidOut ? refundAmount : calculateAdvanceGatewaySplit(refundAmount).gatewayCharges;
        if (!(amount > 0)) return null;
        const doc = await HospitalDeduction.findOneAndUpdate(
            { paymentId: payment._id },
            {
                $setOnInsert: {
                    hospitalId: payment.hospitalId,
                    appointmentId: appointment?._id || payment.appointmentId,
                    paymentId: payment._id,
                    type: paidOut ? 'settled_refund' : 'gateway_charge',
                    amount: round2(amount),
                    refundAmount,
                    reason: String(reason || '').slice(0, 300),
                    patientName: appointment?.patientName || payment.patientName,
                    bookingRef: String(appointment?.tokenNumber || appointment?._id || payment.appointmentId || '').slice(-8).toUpperCase(),
                    status: 'pending'
                }
            },
            { upsert: true, new: true }
        );
        return doc;
    } catch (err: any) {
        console.error('[HospitalDeduction] Could not record deduction for payment', String(payment?._id), err?.message || err);
        return null;
    }
};

/** All pending deductions for a hospital, oldest first. */
export const pendingDeductions = async (hospitalId: any) =>
    HospitalDeduction.find({ hospitalId, status: 'pending' }).sort({ createdAt: 1 }).lean();

/**
 * Which pending deductions fit into a payout of `netBefore`: oldest first, stopping at the first one
 * that does not fit (it waits for the next settlement). Never makes a payout negative.
 */
export const planDeductions = (deductions: any[], netBefore: number) => {
    let remaining = round2(netBefore);
    const applied: any[] = [];
    for (const d of deductions) {
        const amt = round2(d.amount);
        if (amt > remaining + 0.001) break;
        applied.push(d);
        remaining = round2(remaining - amt);
    }
    const total = round2(applied.reduce((s, d) => s + (Number(d.amount) || 0), 0));
    const carried = deductions.slice(applied.length);
    return {
        applied,
        total,
        netAfter: round2(Math.max(0, netBefore - total)),
        carriedForward: round2(carried.reduce((s, d) => s + (Number(d.amount) || 0), 0)),
        carriedCount: carried.length
    };
};

/** Preview for a hospital: pending deductions and how many fit into `netBefore`. */
export const previewDeductions = async (hospitalId: any, netBefore: number) => {
    const list = await pendingDeductions(hospitalId);
    const plan = planDeductions(list, netBefore);
    return { ...plan, pending: list, pendingTotal: round2(list.reduce((s, d: any) => s + (Number(d.amount) || 0), 0)) };
};

/**
 * Claim the planned deductions for a new settlement (pending -> applied). Returns false if any of them
 * was taken meanwhile (another settlement); in that case nothing stays claimed.
 */
export const claimDeductions = async (ids: any[], settlementObjectId: mongoose.Types.ObjectId): Promise<boolean> => {
    if (!ids.length) return true;
    const r = await HospitalDeduction.updateMany(
        { _id: { $in: ids }, status: 'pending' },
        { $set: { status: 'applied', settlementId: settlementObjectId, appliedAt: new Date() } }
    );
    if ((r.modifiedCount || 0) === ids.length) return true;
    await releaseDeductions(settlementObjectId);
    return false;
};

/** Undo a claim (settlement could not be saved). */
export const releaseDeductions = async (settlementObjectId: mongoose.Types.ObjectId) => {
    await HospitalDeduction.updateMany(
        { settlementId: settlementObjectId, status: 'applied' },
        { $set: { status: 'pending' }, $unset: { settlementId: 1, appliedAt: 1 } }
    );
};

/** Short rows for API responses / UI. */
export const deductionRows = (list: any[]) =>
    list.map((d: any) => ({
        _id: d._id,
        type: d.type,
        amount: round2(d.amount),
        refundAmount: round2(d.refundAmount),
        patientName: d.patientName || 'Patient',
        bookingRef: d.bookingRef || '',
        reason: d.reason || '',
        status: d.status,
        createdAt: d.createdAt,
        appliedAt: d.appliedAt
    }));

/**
 * Create a settlement with the hospital's pending deductions taken off `netBefore`:
 * plans which deductions fit, claims them for the new settlement id, runs `create(settlementObjectId, plan)`,
 * and releases the claim if creating fails. Returns { ok: false } when another settlement took a deduction
 * at the same moment (caller answers 409 and the admin retries).
 */
export const createWithDeductions = async <T>(
    hospitalId: any,
    netBefore: number,
    create: (settlementObjectId: mongoose.Types.ObjectId, plan: ReturnType<typeof planDeductions>) => Promise<T>
): Promise<{ ok: true; result: T; plan: ReturnType<typeof planDeductions> } | { ok: false }> => {
    const plan = planDeductions(await pendingDeductions(hospitalId), netBefore);
    const settlementObjectId = new mongoose.Types.ObjectId();
    const claimed = await claimDeductions(plan.applied.map((d: any) => d._id), settlementObjectId);
    if (!claimed) return { ok: false };
    try {
        const result = await create(settlementObjectId, plan);
        return { ok: true, result, plan };
    } catch (err) {
        await releaseDeductions(settlementObjectId);
        throw err;
    }
};
