import cron from 'node-cron';
import Hospital from '../models/Hospital';
import Notification from '../models/Notification';
import { computeSubscriptionStatus } from '../services/subscriptionService';
import { sendTelegramMessage } from '../utils/telegram';

/**
 * Checks all hospitals and updates subscription status in database.
 * Sends notifications and alerts for expiring/expired subscriptions.
 */
export async function runSubscriptionStatusCheck(): Promise<void> {
    try {
        const hospitals = await Hospital.find();
        const now = new Date();

        for (const hospital of hospitals) {
            const comp = computeSubscriptionStatus(hospital);
            let updated = false;

            // If stored status differs from real-time computed status, sync it
            if (hospital.subscriptionStatus !== comp.status) {
                hospital.subscriptionStatus = comp.status;
                updated = true;
            }

            // Handle Expired: Alert hospital user & admin
            if (comp.status === 'Expired' && hospital.paymentStatus === 'Paid') {
                if (hospital.user) {
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const alreadySent = await Notification.findOne({
                        user: hospital.user,
                        message: { $regex: /subscription has expired/i },
                        createdAt: { $gte: todayStart }
                    });

                    if (!alreadySent) {
                        await Notification.create({
                            user: hospital.user,
                            message: `🚨 Your Pillora hospital subscription has expired. New appointment slot generation is currently blocked. Please contact the Pillora Admin to renew.`,
                            type: 'error'
                        });

                        try {
                            await sendTelegramMessage(`⚠️ <b>Hospital Subscription Expired</b>\nHospital: <b>${hospital.name}</b> (${hospital.city})\nSlot generation is now blocked.`);
                        } catch (tErr: any) {
                            // Telegram optional
                        }
                    }
                }
            } else if (comp.status === 'Expiring Soon' && hospital.paymentStatus === 'Paid') {
                // Handle Expiring Soon (5 days or less): Alert hospital user
                if (hospital.user) {
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const alreadySent = await Notification.findOne({
                        user: hospital.user,
                        message: { $regex: /subscription will expire in/i },
                        createdAt: { $gte: todayStart }
                    });

                    if (!alreadySent) {
                        await Notification.create({
                            user: hospital.user,
                            message: `⏳ Notice: Your Pillora hospital subscription will expire in ${comp.daysRemaining} day(s). Please contact the Admin to arrange renewal and maintain uninterrupted slot generation.`,
                            type: 'warning'
                        });
                    }
                }
            }

            if (updated) {
                await hospital.save();
            }
        }
    } catch (err: any) {
        console.error('[SubscriptionCron] Error checking subscription statuses:', err.message);
    }
}

/**
 * Initializes daily subscription check cron at 00:05 AM IST.
 */
export const initSubscriptionExpiryCron = (): void => {
    console.log('[Cron] Initializing Hospital Subscription Expiry Cron Job (Daily at 00:05 AM IST)');

    cron.schedule('5 0 * * *', async () => {
        console.log('[Cron] Running Daily Hospital Subscription Expiry Check...');
        await runSubscriptionStatusCheck();
    }, {
        timezone: 'Asia/Kolkata'
    });

    // Also run an initial sync on server boot
    setTimeout(() => {
        runSubscriptionStatusCheck().catch(err => {
            console.warn('[SubscriptionCron] Initial sync error:', err.message);
        });
    }, 10000);
};
