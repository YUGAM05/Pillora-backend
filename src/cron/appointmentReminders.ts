import cron from 'node-cron';
import Appointment from '../models/Appointment';
import { sendSms } from '../services/sms.service';
import { sendCountedTemplate } from '../services/usageService';
import { formatDateIST, formatTimeIST } from '../utils/dateHelper';

/** Max reminders looked at per window per run. */
const BATCH = Number(process.env.REMINDER_BATCH_SIZE || 40);
/**
 * No new reminder is started after this long, so a run always ends inside
 * Vercel's time limit (10 s on the Hobby plan, including start-up). A reminder
 * is only marked sent when it is claimed, right before sending, so whatever
 * is left simply goes out on the next run, 15 minutes later.
 */
const TIME_BUDGET_MS = Number(process.env.REMINDER_TIME_BUDGET_MS || 5000);
/** Reminders sent at the same time. */
const CONCURRENCY = 4;

type Which = '24h' | '2h';
type Stats = { found: number; sent: number; skippedQuota: number; failed: number; deferred: number };

const WINDOWS: Record<Which, { from: number; to: number; flag: 'reminder24hSent' | 'reminder2hSent' }> = {
    '24h': { from: 23.5, to: 24.5, flag: 'reminder24hSent' },
    '2h': { from: 1.75, to: 2.25, flag: 'reminder2hSent' },
};

async function sendReminders(which: Which, now: Date, deadline: number): Promise<Stats> {
    const w = WINDOWS[which];
    const start = new Date(now.getTime() + w.from * 3600 * 1000);
    const end = new Date(now.getTime() + w.to * 3600 * 1000);
    const stats: Stats = { found: 0, sent: 0, skippedQuota: 0, failed: 0, deferred: 0 };

    const candidates = await Appointment.find({
        status: 'confirmed',
        slotTime: { $gte: start, $lte: end },
        $or: [{ [w.flag]: false }, { [w.flag]: { $exists: false } }],
    })
        .select('_id')
        .limit(BATCH)
        .lean();
    stats.found = candidates.length;

    const queue = candidates.map((c) => c._id);
    const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
            if (Date.now() > deadline) {
                stats.deferred++; // left unclaimed: the next run sends it
                continue;
            }
            await remindOne(which, id, stats);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return stats;
}

async function remindOne(which: Which, _id: unknown, stats: Stats) {
    const w = WINDOWS[which];
    // Claim the reminder first, so two overlapping runs can never send it twice.
    const appt = await Appointment.findOneAndUpdate(
        { _id, [w.flag]: { $ne: true } },
        { $set: { [w.flag]: true } },
        { new: true }
    )
        .populate('patient')
        .populate('hospital')
        .populate('doctor');
    if (!appt) return;

    const phone = appt.patientPhone || (appt.patient as any)?.phone;
    if (!phone) return;
    const patientName = appt.patientName || (appt.patient as any)?.name || 'Patient';
    const hospitalName = appt.hospitalName || (appt.hospital as any)?.name || 'Pillora Hospital';
    const doctorName =
        appt.doctorName ||
        ((appt.doctor as any)?.name
            ? (appt.doctor as any).name.trim().toLowerCase().startsWith('dr')
                ? (appt.doctor as any).name.trim()
                : `Dr. ${(appt.doctor as any).name.trim()}`
            : 'Doctor');
    const dateStr = formatDateIST(appt.slotTime);
    const timeSlotStr = formatTimeIST(appt.slotTime);

    // WhatsApp reminder (approved template: patient, doctor, hospital, date, time),
    // counted against the hospital's allowance; pauses when messages run out.
    try {
        const r = await sendCountedTemplate(
            { hospitalId: (appt.hospital as any)?._id ?? appt.hospital, kind: 'reminder', appointmentId: appt._id },
            phone,
            'appointment_reminder',
            'en',
            [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: patientName },
                        { type: 'text', text: doctorName },
                        { type: 'text', text: hospitalName },
                        { type: 'text', text: dateStr },
                        { type: 'text', text: timeSlotStr },
                    ],
                },
            ]
        );
        if (r.success) stats.sent++;
        else if (r.skipped) stats.skippedQuota++;
        else stats.failed++;
    } catch (waErr: any) {
        stats.failed++;
        console.error(`[Reminders ${which}] WhatsApp error for ${appt._id}:`, waErr.message || waErr);
    }

    // SMS reminder alongside (existing behaviour)
    try {
        const message =
            which === '24h'
                ? `Reminder: Hi ${patientName}, your appointment with ${doctorName} at ${hospitalName} is scheduled for tomorrow at ${timeSlotStr}. Appt ID: ${appt._id}`
                : `Reminder: Hi ${patientName}, your appointment with ${doctorName} at ${hospitalName} is in 2 hours (${timeSlotStr}). Appt ID: ${appt._id}`;
        await sendSms(phone, message);
    } catch (smsErr: any) {
        console.error(`[Reminders ${which}] SMS error for ${appt._id}:`, smsErr.message || smsErr);
    }
}

/**
 * Sends due 24-hour and 2-hour appointment reminders. Safe to call often:
 * each reminder is claimed before sending and goes out only once.
 * Triggered every 15 min by POST /api/cron/appointment-reminders.
 */
export async function runAppointmentReminders() {
    const now = new Date();
    const deadline = Date.now() + TIME_BUDGET_MS;
    // 2-hour reminders first: their window is shorter (2 runs instead of 4).
    const r2 = await sendReminders('2h', now, deadline);
    const r24 = await sendReminders('24h', now, deadline);
    console.log('[Reminders] run done', JSON.stringify({ '24h': r24, '2h': r2 }));
    return { '24h': r24, '2h': r2 };
}

/** In-process timer, for long-running servers only (not used on Vercel). */
export const initAppointmentRemindersCron = () => {
    console.log('[Cron] Initializing Appointment Reminders Cron Job (Every 15 mins)');
    cron.schedule('*/15 * * * *', () => {
        runAppointmentReminders().catch((error: any) => console.error('[Cron] Error running appointment reminders:', error.message || error));
    });
};
