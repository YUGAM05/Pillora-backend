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
exports.initDailyStatsCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const Analytics_1 = __importDefault(require("../models/Analytics"));
const User_1 = __importDefault(require("../models/User"));
const BloodRequest_1 = __importDefault(require("../models/BloodRequest"));
const telegram_1 = require("../utils/telegram");
const initDailyStatsCron = () => {
    console.log('[Cron] Initializing Daily Stats Cron Job at 09:00 AM IST');
    // '0 9 * * *' triggers every day at 9:00 AM
    node_cron_1.default.schedule('0 9 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
        console.log('[Cron] Running Daily Stats Job...');
        try {
            // Get the start and end of today in Asia/Kolkata time zone
            const dateString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // "YYYY-MM-DD"
            const start = new Date(`${dateString}T00:00:00+05:30`);
            const end = new Date(`${dateString}T23:59:59.999+05:30`);
            const [views, newUsers, bloodRequests] = yield Promise.all([
                Analytics_1.default.countDocuments({ type: 'pageview', timestamp: { $gte: start, $lte: end } }),
                User_1.default.countDocuments({ createdAt: { $gte: start, $lte: end } }),
                BloodRequest_1.default.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            ]);
            const formattedDate = new Date().toLocaleDateString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
            const message = `📊 <b>Pillora Daily Stats — ${formattedDate}</b>\n👀 Views: ${views}\n👤 New Users: ${newUsers}\n🩸 Blood Requests: ${bloodRequests}`;
            yield (0, telegram_1.sendTelegramMessage)(message);
            console.log('[Cron] Daily Stats sent successfully');
        }
        catch (err) {
            console.error('[Cron] Error running daily stats:', err);
        }
    }), {
        timezone: 'Asia/Kolkata'
    });
};
exports.initDailyStatsCron = initDailyStatsCron;
