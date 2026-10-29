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
exports.initSubscriptionExpiryCron = void 0;
exports.runSubscriptionStatusCheck = runSubscriptionStatusCheck;
const node_cron_1 = __importDefault(require("node-cron"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Notification_1 = __importDefault(require("../models/Notification"));
const subscriptionService_1 = require("../services/subscriptionService");
const telegram_1 = require("../utils/telegram");
/**
 * Checks all hospitals and updates subscription status in database.
 * Sends notifications and alerts for expiring/expired subscriptions.
 */
function runSubscriptionStatusCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const hospitals = yield Hospital_1.default.find();
            const now = new Date();
            for (const hospital of hospitals) {
                const comp = (0, subscriptionService_1.computeSubscriptionStatus)(hospital);
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
                        const alreadySent = yield Notification_1.default.findOne({
                            user: hospital.user,
                            message: { $regex: /subscription has expired/i },
                            createdAt: { $gte: todayStart }
                        });
                        if (!alreadySent) {
                            yield Notification_1.default.create({
                                user: hospital.user,
                                message: `🚨 Your Pillora hospital subscription has expired. New appointment slot generation is currently blocked. Please contact the Pillora Admin to renew.`,
                                type: 'error'
                            });
                            try {
                                yield (0, telegram_1.sendTelegramMessage)(`⚠️ <b>Hospital Subscription Expired</b>\nHospital: <b>${hospital.name}</b> (${hospital.city})\nSlot generation is now blocked.`);
                            }
                            catch (tErr) {
                                // Telegram optional
                            }
                        }
                    }
                }
                else if (comp.status === 'Expiring Soon' && hospital.paymentStatus === 'Paid') {
                    // Handle Expiring Soon (5 days or less): Alert hospital user
                    if (hospital.user) {
                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        const alreadySent = yield Notification_1.default.findOne({
                            user: hospital.user,
                            message: { $regex: /subscription will expire in/i },
                            createdAt: { $gte: todayStart }
                        });
                        if (!alreadySent) {
                            yield Notification_1.default.create({
                                user: hospital.user,
                                message: `⏳ Notice: Your Pillora hospital subscription will expire in ${comp.daysRemaining} day(s). Please contact the Admin to arrange renewal and maintain uninterrupted slot generation.`,
                                type: 'warning'
                            });
                        }
                    }
                }
                if (updated) {
                    yield hospital.save();
                }
            }
        }
        catch (err) {
            console.error('[SubscriptionCron] Error checking subscription statuses:', err.message);
        }
    });
}
/**
 * Initializes daily subscription check cron at 00:05 AM IST.
 */
const initSubscriptionExpiryCron = () => {
    console.log('[Cron] Initializing Hospital Subscription Expiry Cron Job (Daily at 00:05 AM IST)');
    node_cron_1.default.schedule('5 0 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
        console.log('[Cron] Running Daily Hospital Subscription Expiry Check...');
        yield runSubscriptionStatusCheck();
    }), {
        timezone: 'Asia/Kolkata'
    });
    // Also run an initial sync on server boot
    setTimeout(() => {
        runSubscriptionStatusCheck().catch(err => {
            console.warn('[SubscriptionCron] Initial sync error:', err.message);
        });
    }, 10000);
};
exports.initSubscriptionExpiryCron = initSubscriptionExpiryCron;
