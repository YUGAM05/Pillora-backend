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
exports.sendTelegramMessage = void 0;
const axios_1 = __importDefault(require("axios"));
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const sendTelegramMessage = (message) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn('[Telegram] BOT_TOKEN or CHAT_ID is not configured');
            return;
        }
        yield axios_1.default.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'HTML',
        });
    }
    catch (err) {
        console.error('Telegram notification failed:', ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message);
    }
});
exports.sendTelegramMessage = sendTelegramMessage;
