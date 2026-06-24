import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:team@pillora.in';

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(
        vapidEmail,
        vapidPublicKey,
        vapidPrivateKey
    );
} else {
    console.warn('[PushNotificationService] VAPID keys are not configured in environment variables.');
}

export interface PushNotificationData {
    appointmentId: string;
    patientName: string;
    doctorName: string;
    appointmentDate: string;
    appointmentTime: string;
}

/**
 * Sends a push notification to all active service workers registered for a specific hospital.
 */
export const sendAppointmentNotification = async (hospitalId: string, appointmentData: PushNotificationData) => {
    try {
        const subscriptions = await PushSubscription.find({ hospitalId });

        if (subscriptions.length === 0) {
            console.log(`[PushNotificationService] No push subscriptions found for hospital ID: ${hospitalId}`);
            return;
        }

        const payload = JSON.stringify({
            title: 'New Appointment Booked! 📅',
            body: `Patient: ${appointmentData.patientName}\nDoctor: ${appointmentData.doctorName}\nTime: ${appointmentData.appointmentDate} at ${appointmentData.appointmentTime}`,
            icon: '/android-chrome-192x192.png',
            data: {
                url: `/hospital/dashboard?tab=appointments&bookingId=${appointmentData.appointmentId}`
            }
        });

        console.log(`[PushNotificationService] Broadcasting appointment notification to ${subscriptions.length} devices for hospital ID ${hospitalId}`);

        const sendPromises = subscriptions.map(async (subRecord: any) => {
            const pushSubscription = {
                endpoint: subRecord.subscription.endpoint,
                keys: {
                    p256dh: subRecord.subscription.keys.p256dh,
                    auth: subRecord.subscription.keys.auth
                }
            };

            try {
                await webpush.sendNotification(pushSubscription, payload);
            } catch (err: any) {
                // If endpoint has expired or user has revoked permissions
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`[PushNotificationService] Removing expired/revoked subscription endpoint: ${pushSubscription.endpoint}`);
                    await PushSubscription.deleteOne({ _id: subRecord._id });
                } else {
                    console.error(`[PushNotificationService] Error delivering notification to endpoint ${pushSubscription.endpoint}:`, err.message);
                }
            }
        });

        await Promise.all(sendPromises);
    } catch (error: any) {
        console.error('[PushNotificationService] Failed to broadcast appointment notifications:', error.message);
    }
};
