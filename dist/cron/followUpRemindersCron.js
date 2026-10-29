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
exports.initFollowUpRemindersCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const FollowUpReminder_1 = __importDefault(require("../models/FollowUpReminder"));
const followUpService_1 = require("../services/followUpService");
/**
 * Initializes Patient Follow-Up Reminders Cron Job.
 * Runs every 2 minutes to check for due follow-up reminders.
 */
const initFollowUpRemindersCron = () => {
    console.log('[Cron] Initializing Follow-Up Reminders Cron Job (Every 2 mins)');
    node_cron_1.default.schedule('*/2 * * * *', () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const now = new Date();
            // Find all reminders that are scheduled and their reminderDate has arrived
            const dueReminders = yield FollowUpReminder_1.default.find({
                status: 'scheduled',
                reminderDate: { $lte: now }
            }).limit(50);
            if (dueReminders.length === 0) {
                return;
            }
            console.log(`[Cron Follow-Up] Found ${dueReminders.length} due follow-up reminder(s). Dispatching...`);
            for (const reminder of dueReminders) {
                try {
                    yield (0, followUpService_1.dispatchFollowUpReminder)(reminder._id.toString());
                }
                catch (err) {
                    console.error(`[Cron Follow-Up] Error processing reminder ${reminder._id}:`, err.message || err);
                }
            }
        }
        catch (error) {
            console.error('[Cron Follow-Up] Error in follow-up reminders cron job:', error.message || error);
        }
    }));
};
exports.initFollowUpRemindersCron = initFollowUpRemindersCron;
