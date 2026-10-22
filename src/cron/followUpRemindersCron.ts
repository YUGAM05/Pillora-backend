import cron from 'node-cron';
import FollowUpReminder from '../models/FollowUpReminder';
import { dispatchFollowUpReminder } from '../services/followUpService';

/**
 * Initializes Patient Follow-Up Reminders Cron Job.
 * Runs every 2 minutes to check for due follow-up reminders.
 */
export const initFollowUpRemindersCron = () => {
    console.log('[Cron] Initializing Follow-Up Reminders Cron Job (Every 2 mins)');

    cron.schedule('*/2 * * * *', async () => {
        try {
            const now = new Date();
            // Find all reminders that are scheduled and their reminderDate has arrived
            const dueReminders = await FollowUpReminder.find({
                status: 'scheduled',
                reminderDate: { $lte: now }
            }).limit(50);

            if (dueReminders.length === 0) {
                return;
            }

            console.log(`[Cron Follow-Up] Found ${dueReminders.length} due follow-up reminder(s). Dispatching...`);

            for (const reminder of dueReminders) {
                try {
                    await dispatchFollowUpReminder(reminder._id.toString());
                } catch (err: any) {
                    console.error(`[Cron Follow-Up] Error processing reminder ${reminder._id}:`, err.message || err);
                }
            }
        } catch (error: any) {
            console.error('[Cron Follow-Up] Error in follow-up reminders cron job:', error.message || error);
        }
    });
};
