import cron from 'node-cron';
import FollowUpReminder from '../models/FollowUpReminder';
import { dispatchFollowUpReminder } from '../services/followUpService';

/**
 * Initializes Patient Follow-Up Reminders Cron Job.
 * Runs every 2 minutes to check for due follow-up reminders.
 */
/** Sends due follow-up reminders (max 50 per run). Triggered by POST /api/cron/follow-up-reminders. */
export async function runFollowUpReminders() {
    let dispatched = 0;
        try {
            const now = new Date();
            // Find all reminders that are scheduled and their reminderDate has arrived
            const dueReminders = await FollowUpReminder.find({
                status: 'scheduled',
                reminderDate: { $lte: now }
            }).limit(50);

            if (dueReminders.length === 0) {
                return { dispatched };
            }

            console.log(`[Cron Follow-Up] Found ${dueReminders.length} due follow-up reminder(s). Dispatching...`);

            // Stop starting new ones before Vercel's time limit; the rest go on the next run.
            const deadline = Date.now() + Number(process.env.REMINDER_TIME_BUDGET_MS || 5000);
            for (const reminder of dueReminders) {
                if (Date.now() > deadline) break;
                try {
                    await dispatchFollowUpReminder(reminder._id.toString());
                    dispatched++;
                } catch (err: any) {
                    console.error(`[Cron Follow-Up] Error processing reminder ${reminder._id}:`, err.message || err);
                }
            }
        } catch (error: any) {
            console.error('[Cron Follow-Up] Error in follow-up reminders cron job:', error.message || error);
        }
    return { dispatched };
}

/** In-process timer, for long-running servers only (not used on Vercel). */
export const initFollowUpRemindersCron = () => {
    console.log('[Cron] Initializing Follow-Up Reminders Cron Job (Every 2 mins)');
    cron.schedule('*/2 * * * *', () => {
        runFollowUpReminders().catch(() => {});
    });
};
