import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { runAppointmentReminders } from '../cron/appointmentReminders';
import { runFollowUpReminders } from '../cron/followUpRemindersCron';
import { runDailyStats } from '../cron/dailyStats';
import { runSubscriptionStatusCheck } from '../cron/subscriptionExpiryCron';
import { expirePacks } from '../services/usageService';

/**
 * Scheduled jobs, triggered from outside: Vercel only runs code while a
 * request is in progress, so in-process timers (node-cron) never fire there.
 * The always-on voice server (AWS Lightsail) calls these on a timer:
 *
 *   POST /api/cron/appointment-reminders   every 15 min
 *   POST /api/cron/follow-up-reminders     every 5 min
 *   POST /api/cron/daily-stats             daily 09:00 IST
 *   POST /api/cron/subscription-expiry     daily 00:05 IST
 *   POST /api/cron/expire-packs            daily 00:10 IST
 *
 *   POST /api/cron/ping                    connection test, does nothing
 *
 * Header: x-cron-secret: <CRON_SECRET, or VOICE_API_SECRET when CRON_SECRET
 * isn't set>. The voice server already holds VOICE_API_SECRET, so it can run
 * these jobs with no extra setup. Every job is safe to run twice (reminders
 * are claimed atomically before sending), so a leaked secret can't make
 * patients get duplicate messages.
 */
const router = express.Router();

const JOBS: Record<string, () => Promise<unknown>> = {
    'appointment-reminders': runAppointmentReminders,
    'follow-up-reminders': runFollowUpReminders,
    'daily-stats': runDailyStats,
    'subscription-expiry': async () => {
        await runSubscriptionStatusCheck();
        return { ok: true };
    },
    'expire-packs': expirePacks,
    ping: async () => ({ pong: true }),
};

const sameSecret = (given: string, expected: string) =>
    expected.length >= 16 && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));

function authorised(req: Request): boolean {
    const given = String(req.headers['x-cron-secret'] || '');
    const expected = process.env.CRON_SECRET || process.env.VOICE_API_SECRET || '';
    return sameSecret(given, expected);
}

router.post('/:job', async (req: Request, res: Response): Promise<void> => {
    if (!authorised(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    const job = JOBS[req.params.job];
    if (!job) {
        res.status(404).json({ error: 'unknown_job', jobs: Object.keys(JOBS) });
        return;
    }
    const started = Date.now();
    try {
        const result = await job();
        res.json({ ok: true, job: req.params.job, ms: Date.now() - started, result });
    } catch (e: any) {
        console.error(`[Cron] ${req.params.job} failed:`, e?.message || e);
        res.status(500).json({ ok: false, job: req.params.job, error: e?.message || 'failed' });
    }
});

export default router;
