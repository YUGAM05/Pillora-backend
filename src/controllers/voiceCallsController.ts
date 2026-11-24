import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import VoiceCall from '../models/VoiceCall';
import VoiceHospitalConfig from '../models/VoiceHospitalConfig';
import { currentMonth } from '../services/usageService';

/**
 * AI receptionist call history for the hospital dashboard ("AI calls" tab):
 * every call the AI answered, whether it ended in a booking, and a call-back
 * list for reception.
 *   GET   /api/hospital/dashboard/voice-calls?filter=all|booked|not_booked&before=<ISO date>&limit=30
 *   PATCH /api/hospital/dashboard/voice-calls/:id/called-back { done: boolean }
 */

const NOT_BOOKED = ['no_booking', 'ended_early', 'unavailable'];
const PAGE_MAX = 50;

const hospitalIdOf = (req: AuthRequest) => (req as any).hospital._id;

const callView = (c: any, bookedLater = false) => ({
    id: String(c._id),
    at: c.startedAt || c.createdAt,
    from: c.from || null,
    durationSeconds: c.durationSeconds ?? 0,
    billedSeconds: c.billedSeconds ?? 0,
    outcome: c.outcome,
    language: c.language || null,
    appointment: c.appointment && typeof c.appointment === 'object' && c.appointment.patientName !== undefined
        ? {
            patientName: c.appointment.patientName,
            doctorName: c.appointment.doctorName,
            date: c.appointment.appointmentDate,
            time: c.appointment.appointmentTime,
            status: c.appointment.status,
        }
        : null,
    calledBackAt: c.calledBackAt || null,
    calledBackBy: c.calledBackBy && typeof c.calledBackBy === 'object' ? c.calledBackBy.name || null : null,
    bookedLater,
});

/** This month (India time): calls, bookings, calls still waiting for a call-back, minutes used. */
async function monthSummary(hospitalId: any) {
    const month = currentMonth();
    const start = new Date(`${month}-01T00:00:00+05:30`);
    const calls = await VoiceCall.find({ hospital: hospitalId, createdAt: { $gte: start } })
        .select('from outcome createdAt calledBackAt billedSeconds')
        .sort({ createdAt: 1 })
        .limit(10000)
        .lean();
    let booked = 0;
    let billedSeconds = 0;
    const lastBookingAt = new Map<string, number>(); // caller -> time of their latest booked call
    for (const c of calls as any[]) {
        billedSeconds += c.billedSeconds || 0;
        if (c.outcome === 'booked') {
            booked++;
            if (c.from) lastBookingAt.set(c.from, new Date(c.createdAt).getTime());
        }
    }
    // Waiting for a call-back: didn't book, not marked as called back, and the
    // same number didn't book on a later call.
    const waiting = (calls as any[]).filter(
        (c) => c.outcome !== 'booked' && !c.calledBackAt && !(c.from && (lastBookingAt.get(c.from) ?? 0) > new Date(c.createdAt).getTime())
    ).length;
    return {
        month,
        calls: calls.length,
        booked,
        notBooked: calls.length - booked,
        waitingForCallBack: waiting,
        minutesUsed: Math.round((billedSeconds / 60) * 10) / 10,
    };
}

/** GET /api/hospital/dashboard/voice-calls */
export const getVoiceCalls = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospitalId = hospitalIdOf(req);
        const filter = String(req.query.filter || 'all');
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), PAGE_MAX);
        const before = req.query.before ? new Date(String(req.query.before)) : null;

        const q: any = { hospital: hospitalId };
        if (filter === 'booked') q.outcome = 'booked';
        else if (filter === 'not_booked') q.outcome = { $in: NOT_BOOKED };
        if (before && !isNaN(before.getTime())) q.createdAt = { $lt: before };

        const [rows, summary, numbers] = await Promise.all([
            VoiceCall.find(q)
                .sort({ createdAt: -1 })
                .limit(limit + 1)
                .populate('appointment', 'patientName appointmentDate appointmentTime doctorName status')
                .populate('calledBackBy', 'name')
                .lean(),
            monthSummary(hospitalId),
            VoiceHospitalConfig.find({ hospitalId }).select('exotelNumber isEnabled').lean(),
        ]);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit) as any[];

        // A caller who didn't book but booked on a later AI call needs no call-back.
        const callers = [...new Set(page.filter((c) => c.outcome !== 'booked' && c.from).map((c) => c.from))];
        const bookings = callers.length
            ? await VoiceCall.find({ hospital: hospitalId, from: { $in: callers }, outcome: 'booked' }).select('from createdAt').lean()
            : [];
        const bookedLater = (c: any) =>
            c.outcome !== 'booked' && (bookings as any[]).some((b) => b.from === c.from && new Date(b.createdAt) > new Date(c.createdAt));

        res.json({
            calls: page.map((c) => callView(c, bookedLater(c))),
            hasMore,
            nextBefore: hasMore ? page[page.length - 1].createdAt : null,
            summary,
            numbers: (numbers as any[]).map((v) => ({ number: v.exotelNumber, enabled: v.isEnabled })),
        });
    } catch (error: any) {
        console.error('[VoiceCalls] list failed:', error.message);
        res.status(500).json({ message: 'Could not load AI calls' });
    }
};

/** PATCH /api/hospital/dashboard/voice-calls/:id/called-back { done } : mark (or unmark) a call as called back. */
export const setVoiceCallCalledBack = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ message: 'Invalid call id' });
            return;
        }
        const done = req.body?.done !== false;
        const call = await VoiceCall.findOneAndUpdate(
            { _id: req.params.id, hospital: hospitalIdOf(req) },
            done
                ? { $set: { calledBackAt: new Date(), calledBackBy: (req as any).user?._id } }
                : { $unset: { calledBackAt: 1, calledBackBy: 1 } },
            { new: true }
        )
            .populate('appointment', 'patientName appointmentDate appointmentTime doctorName status')
            .populate('calledBackBy', 'name')
            .lean();
        if (!call) {
            res.status(404).json({ message: 'Call not found' });
            return;
        }
        res.json({ success: true, call: callView(call) });
    } catch (error: any) {
        console.error('[VoiceCalls] called-back failed:', error.message);
        res.status(500).json({ message: 'Could not update the call' });
    }
};
