import cron from 'node-cron';
import Analytics from '../models/Analytics';
import User from '../models/User';
import BloodRequest from '../models/BloodRequest';
import { sendTelegramMessage } from '../utils/telegram';

/** Sends the daily stats summary. Triggered daily at 09:00 IST by POST /api/cron/daily-stats. */
export async function runDailyStats() {
    console.log('[Cron] Running Daily Stats Job...');
    try {
      // Get the start and end of today in Asia/Kolkata time zone
      const dateString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // "YYYY-MM-DD"
      const start = new Date(`${dateString}T00:00:00+05:30`);
      const end = new Date(`${dateString}T23:59:59.999+05:30`);

      const [views, newUsers, bloodRequests] = await Promise.all([
        Analytics.countDocuments({ type: 'pageview', timestamp: { $gte: start, $lte: end } }),
        User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        BloodRequest.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      ]);

      const formattedDate = new Date().toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      const message = `📊 <b>Pillora Daily Stats — ${formattedDate}</b>\n👀 Views: ${views}\n👤 New Users: ${newUsers}\n🩸 Blood Requests: ${bloodRequests}`;
      
      await sendTelegramMessage(message);
      console.log('[Cron] Daily Stats sent successfully');
    } catch (err) {
      console.error('[Cron] Error running daily stats:', err);
    }
  return { ok: true };
}

/** In-process timer, for long-running servers only (not used on Vercel). */
export const initDailyStatsCron = () => {
  console.log('[Cron] Initializing Daily Stats Cron Job at 09:00 AM IST');
  cron.schedule('0 9 * * *', () => {
    runDailyStats().catch(() => {});
  }, { timezone: 'Asia/Kolkata' });
};
