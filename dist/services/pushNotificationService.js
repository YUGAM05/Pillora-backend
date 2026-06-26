"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAppointmentNotification = void 0;
const web_push_1 = __importDefault(require("web-push"));
const PushSubscription_1 = __importDefault(require("../models/PushSubscription"));
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:team@pillora.in';
if (vapidPublicKey && vapidPrivateKey) {
    web_push_1.default.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}
else {
    console.warn('[PushNotificationService] VAPID keys are not configured in environment variables.');
}
/**
 * Sends a push notification to all active service workers registered for a specific hospital.
 */
const sendAppointmentNotification = (hospitalId, appointmentData) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const subscriptions = yield PushSubscription_1.default.find({ hospitalId });
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
        const sendPromises = subscriptions.map((subRecord) => __awaiter(void 0, void 0, void 0, function* () {
            const pushSubscription = {
                endpoint: subRecord.subscription.endpoint,
                keys: {
                    p256dh: subRecord.subscription.keys.p256dh,
                    auth: subRecord.subscription.keys.auth
                }
            };
            try {
                yield web_push_1.default.sendNotification(pushSubscription, payload);
            }
            catch (err) {
                // If endpoint has expired or user has revoked permissions
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`[PushNotificationService] Removing expired/revoked subscription endpoint: ${pushSubscription.endpoint}`);
                    yield PushSubscription_1.default.deleteOne({ _id: subRecord._id });
                }
                else {
                    console.error(`[PushNotificationService] Error delivering notification to endpoint ${pushSubscription.endpoint}:`, err.message);
                }
            }
        }));
        yield Promise.all(sendPromises);
    }
    catch (error) {
        console.error('[PushNotificationService] Failed to broadcast appointment notifications:', error.message);
    }
});
exports.sendAppointmentNotification = sendAppointmentNotification;
