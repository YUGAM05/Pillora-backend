import mongoose, { ClientSession } from 'mongoose';
import Slot, { ISlot } from '../models/Slot';
import Appointment from '../models/Appointment';

/**
 * Slot capacity, holds and seats — all enforced inside single atomic MongoDB updates.
 *
 * Model:
 *   - `booked_count`  = seats taken by real bookings (walk-in, AI call, paid online booking).
 *   - `holds[]`       = temporary checkout holds {user, expiresAt}. Only unexpired holds count.
 *   - capacity        = `max_appointments` (fallback: effective capacity from utils/slotCapacity.ts, else 1).
 *
 * A new hold or seat is granted only when
 *       booked_count + (unexpired holds of OTHER users) < capacity
 * and that condition is part of the findOneAndUpdate filter, so two concurrent requests can
 * never both pass it for the last seat (MongoDB applies single-document updates atomically).
 * `status` and `hold_count` are recomputed in the same update so they always match the counts.
 * Expired holds need no cleanup job: they stop counting the moment they expire and are pruned
 * by the next update that touches the slot.
 */

/** Checkout hold when a patient picks a slot (covers filling the checkout form). */
export const HOLD_MS = 10 * 60 * 1000;
/** Hold refreshed when the Razorpay order is created (covers the payment itself). */
export const PAYMENT_HOLD_MS = 15 * 60 * 1000;

// 'booked' is included on purpose: status is only a cached label, the capacity check in $expr is what
// decides. This also reopens group slots that older code wrongly marked 'booked' after one booking.
const BOOKABLE_STATUSES = ['available', 'locked', 'booked'];

const toOid = (v: any): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(String(v));

const bookedExpr = { $ifNull: ['$booked_count', 0] };
const capExpr = (fallbackCap: number) => ({ $ifNull: ['$max_appointments', Math.max(1, fallbackCap || 1)] });

/** Unexpired holds, optionally excluding one user's hold. */
export const activeHoldsExpr = (now: Date, excludeUser?: mongoose.Types.ObjectId) => ({
    $filter: {
        input: { $ifNull: ['$holds', []] },
        as: 'h',
        cond: {
            $and: [
                { $gt: ['$$h.expiresAt', now] },
                ...(excludeUser ? [{ $ne: ['$$h.user', excludeUser] }] : [])
            ]
        }
    }
});

/** Pipeline stage that recomputes status + hold_count. Runs after `holds` holds only active entries. */
export const statusStage = {
    $set: {
        hold_count: { $size: '$holds' },
        status: {
            $cond: [
                { $in: ['$status', ['cancelled', 'blocked']] },
                '$status',
                {
                    $cond: [
                        { $gte: ['$booked_count', '$max_appointments'] },
                        'booked',
                        {
                            $cond: [
                                { $gte: [{ $add: ['$booked_count', { $size: '$holds' }] }, '$max_appointments'] },
                                'locked',
                                'available'
                            ]
                        }
                    ]
                }
            ]
        }
    }
};

/** Capacity of a slot (slot value first, as in the booking flows; `fallbackCap` — see utils/slotCapacity.ts — when missing). */
export const slotCapacity = (slot: any, fallbackCap?: number): number =>
    Math.max(1, Number(slot?.max_appointments) || Number(fallbackCap) || 1);

/** Read-side view: status / hold_count as they are right now (expired holds ignored). Never writes. */
export const liveSlotView = (slot: any, now: Date = new Date()) => {
    const obj = typeof slot?.toObject === 'function' ? slot.toObject() : { ...slot };
    const cap = slotCapacity(obj);
    const booked = Number(obj.booked_count) || 0;
    const activeHolds = (obj.holds || []).filter((h: any) => new Date(h.expiresAt) > now).length;
    let status = obj.status;
    if (status !== 'cancelled' && status !== 'blocked') {
        status = booked >= cap ? 'booked' : (booked + activeHolds >= cap ? 'locked' : 'available');
    }
    delete obj.holds; // holder user ids are not public
    return { ...obj, status, hold_count: activeHolds, max_appointments: cap };
};

export type HoldFailure = 'NOT_FOUND' | 'CANCELLED' | 'PAST' | 'FULL' | 'ON_HOLD' | 'UNAVAILABLE';

/**
 * Create or refresh `userId`'s hold on a slot. Atomic: succeeds only if a seat is free
 * (counting other users' unexpired holds) or the user already holds one.
 */
export const acquireHold = async (
    slotId: any,
    userId: any,
    opts: { fallbackCap?: number; holdMs?: number } = {}
): Promise<{ ok: boolean; slot?: ISlot; expiresAt?: Date; reason?: HoldFailure }> => {
    if (!mongoose.Types.ObjectId.isValid(String(slotId))) return { ok: false, reason: 'NOT_FOUND' };
    const now = new Date();
    const user = toOid(userId);
    const expiresAt = new Date(now.getTime() + (opts.holdMs || HOLD_MS));
    const fallbackCap = opts.fallbackCap || 1;

    const slot = await Slot.findOneAndUpdate(
        {
            _id: toOid(slotId),
            status: { $in: BOOKABLE_STATUSES },
            endTime: { $gt: now },
            $expr: {
                $lt: [{ $add: [bookedExpr, { $size: activeHoldsExpr(now, user) }] }, capExpr(fallbackCap)]
            }
        },
        [
            {
                $set: {
                    max_appointments: capExpr(fallbackCap),
                    booked_count: bookedExpr,
                    holds: { $concatArrays: [activeHoldsExpr(now, user), [{ user, expiresAt }]] }
                }
            },
            statusStage
        ],
        { new: true, updatePipeline: true }
    );

    if (slot) return { ok: true, slot, expiresAt };

    // Explain the failure (read-only)
    const current: any = await Slot.findById(slotId).lean();
    if (!current) return { ok: false, reason: 'NOT_FOUND' };
    if (current.status === 'cancelled') return { ok: false, reason: 'CANCELLED' };
    if (!BOOKABLE_STATUSES.includes(current.status)) return { ok: false, reason: 'UNAVAILABLE' };
    if (new Date(current.endTime) <= now) return { ok: false, reason: 'PAST' };
    const cap = Number(current.max_appointments) || fallbackCap;
    if ((Number(current.booked_count) || 0) >= cap) return { ok: false, reason: 'FULL' };
    return { ok: false, reason: 'ON_HOLD' };
};

/** Remove `userId`'s hold from a slot. Returns true if a hold was removed. */
export const releaseHold = async (slotId: any, userId: any, session?: ClientSession): Promise<ISlot | null> => {
    if (!mongoose.Types.ObjectId.isValid(String(slotId))) return null;
    const now = new Date();
    const user = toOid(userId);
    return Slot.findOneAndUpdate(
        { _id: toOid(slotId), 'holds.user': user },
        [
            {
                $set: {
                    max_appointments: capExpr(1),
                    booked_count: bookedExpr,
                    holds: activeHoldsExpr(now, user)
                }
            },
            statusStage
        ],
        { new: true, updatePipeline: true, ...(session ? { session } : {}) }
    );
};

/** True if `userId` has an unexpired hold on this slot document. */
export const hasActiveHold = (slot: any, userId: any, now: Date = new Date()): boolean =>
    !!userId && (slot?.holds || []).some((h: any) => String(h.user) === String(userId) && new Date(h.expiresAt) > now);

/**
 * Take one seat (booked_count + 1). Atomic capacity check: other users' unexpired holds count
 * against capacity; `holderUserId`'s own hold (if any) is converted into the seat.
 * Returns the updated slot, or null when the slot is full / cancelled / missing.
 */
export const claimSeat = async (
    slotId: any,
    opts: { holderUserId?: any; fallbackCap?: number; appointmentId?: any; session?: ClientSession } = {}
): Promise<ISlot | null> => {
    if (!mongoose.Types.ObjectId.isValid(String(slotId))) return null;
    const now = new Date();
    const holder = opts.holderUserId ? toOid(opts.holderUserId) : undefined;
    const fallbackCap = opts.fallbackCap || 1;

    const firstStage: any = {
        max_appointments: capExpr(fallbackCap),
        booked_count: { $add: [bookedExpr, 1] },
        holds: activeHoldsExpr(now, holder)
    };
    if (opts.appointmentId) firstStage.appointment = toOid(opts.appointmentId);

    return Slot.findOneAndUpdate(
        {
            _id: toOid(slotId),
            status: { $in: BOOKABLE_STATUSES },
            $expr: {
                $lt: [{ $add: [bookedExpr, { $size: activeHoldsExpr(now, holder) }] }, capExpr(fallbackCap)]
            }
        },
        [{ $set: firstStage }, statusStage],
        { new: true, updatePipeline: true, ...(opts.session ? { session: opts.session } : {}) }
    );
};

/** Statuses in which an appointment WITHOUT the slotSeatHeld flag (older data) is assumed to hold a seat. */
const LEGACY_SEAT_STATUSES = ['confirmed', 'checked-in', 'in-consultation', 'completed'];

/**
 * Give back the seat an appointment occupies (booked_count - 1), exactly once.
 *
 * Idempotent: the appointment's `slotSeatHeld` flag is flipped to false with a conditional update
 * first, and the slot is only decremented by the request that won that flip — so double cancels or
 * concurrent cancel paths cannot decrement twice. Older appointments have no flag; they are assumed
 * to hold a seat when their status before cancelling was confirmed/checked-in/in-consultation/completed
 * (walk-in, AI call and paid online bookings). Unpaid online holds ('pending') never took a seat.
 *
 * @param priorStatus the appointment status BEFORE it was changed to cancelled.
 */
export const releaseSeat = async (
    appointment: { _id: any; slot?: any },
    priorStatus: string | undefined,
    session?: ClientSession
): Promise<boolean> => {
    if (!appointment?.slot) return false;
    const or: any[] = [{ slotSeatHeld: true }];
    if (priorStatus && LEGACY_SEAT_STATUSES.includes(priorStatus)) {
        or.push({ slotSeatHeld: { $exists: false } });
    }
    const flipped = await Appointment.findOneAndUpdate(
        { _id: appointment._id, $or: or },
        { $set: { slotSeatHeld: false } },
        { new: true, ...(session ? { session } : {}) }
    );
    if (!flipped) return false;

    const now = new Date();
    await Slot.findOneAndUpdate(
        { _id: toOid(appointment.slot) },
        [
            {
                $set: {
                    max_appointments: capExpr(1),
                    booked_count: { $max: [0, { $subtract: [bookedExpr, 1] }] },
                    holds: activeHoldsExpr(now)
                }
            },
            statusStage
        ],
        { new: true, updatePipeline: true, ...(session ? { session } : {}) }
    );
    return true;
};

/** Map a hold failure to the API codes/messages the patient site already understands. */
export const holdFailureResponse = (reason: HoldFailure): { status: number; code: string; message: string } => {
    switch (reason) {
        case 'NOT_FOUND':
            return { status: 404, code: 'NOT_FOUND', message: 'Slot not found. Please choose another.' };
        case 'CANCELLED':
            return { status: 400, code: 'SLOT_CANCELLED', message: 'This slot has been cancelled by the hospital. Please choose another.' };
        case 'PAST':
            return { status: 400, code: 'SLOT_PAST', message: 'This slot time has already passed. Please choose another.' };
        case 'FULL':
            return { status: 400, code: 'SLOT_FULL', message: 'Sorry, this slot was just booked by someone else. Please choose another slot.' };
        case 'ON_HOLD':
            return { status: 400, code: 'SLOT_ON_HOLD', message: 'This slot is temporarily held by another patient. Please try again in a few minutes or choose another.' };
        default:
            return { status: 400, code: 'SLOT_UNAVAILABLE', message: 'This slot is not available. Please choose another.' };
    }
};
