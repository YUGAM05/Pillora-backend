import cron from 'node-cron';
import Appointment from '../models/Appointment';
import { sendSms } from '../services/sms.service';
import { sendCountedTemplate } from '../services/usageService';
import { formatDateIST, formatTimeIST } from '../utils/dateHelper';

/** Max reminders handled per run, so one run stays well inside a serverless time limit. */
const BATCH = Number(process.env.REMINDER_BATCH_SIZE || 40);

type Which = '24h' | '2h';

const WINDOWS: Record<Which, { from: number; to: number; flag: 'reminder24hSent' | 'reminder2hSent' }> = {
    '24h': { from: 23.5, to: 24.5, flag: 'reminder24hSent' },
    '2h': { from: 1.75, to: 2.25, flag: 'reminder2hSent' },
};

async function sendReminders(which: Which, now: Date) {
    const w = WINDOWS[which];
    const start = new Date(now.getTime() + w.from * 3600 * 1000);
    const end = new Date(now.getTime() + w.to * 3600 * 1000);
    const stats = { found: 0, sent: 0, skippedQuota: 0, failed: 0 };

    const candidates = await Appointment.find({
        status: 'confirmed',
        slotTime: { $gte: start, $lte: end },
        $or: [{ [w.flag]: false }, { [w.flag]: { $exists: false } }],
    })
        .select('_id')
        .limit(BATCH)
        .lean();
    stats.found = candidates.length;

    for (const { _id } of candidates) {
        // Claim the reminder first, so two overlapping runs can never send it twice.
        const appt = await Appointment.findOneAndUpdate(
            { _id, [w.flag]: { $ne: true } },
            { $set: { [w.flag]: true } },
            { new: true }
        )
            .populate('patient')
            .populate('hospital')
            .populate('doctor');
        if (!appt) continue;

        const phone = appt.patientPhone || (appt.patient as any)?.phone;
        if (!phone) continue;
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
    return stats;
}

/**
 * Sends due 24-hour and 2-hour appointment reminders. Safe to call often:
 * each reminder is claimed before sending and goes out only once.
 * Triggered every 15 min by POST /api/cron/appointment-reminders.
 */
export async function runAppointmentReminders() {
    const now = new Date();
    const r24 = await sendReminders('24h', now);
    const r2 = await sendReminders('2h', now);
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
