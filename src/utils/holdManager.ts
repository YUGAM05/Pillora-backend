import Slot from '../models/Slot';
import { effectiveCapacityForDoctor } from './slotCapacity';
import { acquireHold, releaseHold as releaseSlotHold, hasActiveHold, HOLD_MS, liveSlotView } from './slotBooking';

/**
 * Slot holds — thin wrapper over utils/slotBooking.ts.
 * Holds used to live in an in-memory "redis mock", which does not work on Vercel serverless
 * (each instance had its own memory, TTL events never fired, slots stayed 'locked').
 * They are now stored on the Slot document with an expiry; see slotBooking.ts.
 */

const ISO_DATE = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d));

const emitSlot = (io: any, event: string, slot: any) => {
    if (!io || !slot) return;
    const view = liveSlotView(slot);
    io.emit(event, {
        slotId: String(slot._id),
        doctorId: (slot.doctor as any)?._id || slot.doctor,
        date: ISO_DATE(slot.startTime),
        bookedCount: view.booked_count,
        holdCount: view.hold_count,
        maxAppointments: view.max_appointments,
        status: view.status
    });
};

const FAILURE_MESSAGES: Record<string, string> = {
    NOT_FOUND: 'Slot not found',
    CANCELLED: 'Slot cancelled by admin',
    PAST: 'Slot time has passed',
    FULL: 'Slot just became full',
    ON_HOLD: 'Slot on temporary hold',
    UNAVAILABLE: 'Slot not available'
};

export const createHold = async (slotId: string, userId: string, io: any, holdMs: number = HOLD_MS): Promise<{ success: boolean; message: string; reason?: string; expiryMs?: number }> => {
    const slotDoc: any = await Slot.findById(slotId).select('doctor').lean();
    if (!slotDoc) return { success: false, message: FAILURE_MESSAGES.NOT_FOUND, reason: 'NOT_FOUND' };
    const fallbackCap = await effectiveCapacityForDoctor(slotDoc.doctor);

    const result = await acquireHold(slotId, userId, { fallbackCap, holdMs });
    if (!result.ok) {
        return { success: false, message: FAILURE_MESSAGES[result.reason] || 'Slot not available', reason: result.reason };
    }
    emitSlot(io, 'slotHeld', result.slot);
    return { success: true, message: 'Slot successfully held', expiryMs: holdMs };
};

export const releaseHold = async (slotId: string, userId: string, io: any): Promise<boolean> => {
    const slot = await releaseSlotHold(slotId, userId);
    if (slot) emitSlot(io, 'slotHoldReleased', slot);
    return !!slot;
};

export const isHeldByUser = async (slotId: string, userId: string): Promise<boolean> => {
    const slot = await Slot.findById(slotId).select('holds').lean();
    return hasActiveHold(slot, userId);
};

/**
 * Kept for app.ts (runs on a timer outside serverless). Expired holds no longer need cleanup to stop
 * counting; this only tidies stale `locked` statuses and hold arrays so stored data stays readable.
 */
export const runHoldCleanup = async (_io: any): Promise<void> => {
    try {
        const now = new Date();
        await Slot.updateMany(
            { $or: [{ status: 'locked' }, { hold_count: { $gt: 0 } }], holds: { $not: { $elemMatch: { expiresAt: { $gt: now } } } } },
            [
                {
                    $set: {
                        holds: [],
                        hold_count: 0,
                        status: {
                            $cond: [
                                { $eq: ['$status', 'locked'] },
                                { $cond: [{ $gte: [{ $ifNull: ['$booked_count', 0] }, { $ifNull: ['$max_appointments', 1] }] }, 'booked', 'available'] },
                                '$status'
                            ]
                        }
                    }
                }
            ],
            { updatePipeline: true }
        );
    } catch (err) {
        console.error('[HoldCleanup] Error in background hold cleanup:', err);
    }
};
