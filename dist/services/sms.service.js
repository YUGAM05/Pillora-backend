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
exports.sendSms = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Sends an SMS message to a mobile number using Fast2SMS.
 * Supports 10-digit Indian mobile numbers.
 */
const sendSms = (phone, message) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const rawDigits = (phone || '').replace(/\D/g, '');
    const cleanPhone = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
    if (!cleanPhone || cleanPhone.length !== 10) {
        const errorMsg = `Invalid 10-digit phone number for SMS: "${phone}"`;
        console.warn(`[SMS Service] ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
        const errorMsg = 'FAST2SMS_API_KEY is not configured in environment variables';
        console.warn(`[SMS Service] ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
    try {
        console.log(`[SMS Service] 🚀 Dispatching SMS to ${cleanPhone} via Fast2SMS...`);
        const url = 'https://www.fast2sms.com/dev/bulkV2';
        const response = yield axios_1.default.get(url, {
            params: {
                authorization: apiKey,
                message: message,
                language: 'english',
                route: 'q',
                numbers: cleanPhone
            },
            timeout: 10000
        });
        const data = response.data;
        if (data && data.return === true) {
            const reqId = data.request_id || `F2S_${Date.now()}`;
            console.log(`[SMS Service] ✅ Fast2SMS sent successfully to ${cleanPhone}. Request ID: ${reqId}`);
            return { success: true, messageId: reqId };
        }
        else {
            const errMsg = Array.isArray(data === null || data === void 0 ? void 0 : data.message) ? data.message.join(', ') : ((data === null || data === void 0 ? void 0 : data.message) || 'Fast2SMS returned failure');
            console.error(`[SMS Service] ❌ Fast2SMS delivery failure:`, errMsg);
            return { success: false, error: errMsg };
        }
    }
    catch (error) {
        const errPayload = ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message;
        const errMsg = typeof errPayload === 'object' ? JSON.stringify(errPayload) : String(errPayload);
        console.error('[SMS Service] ❌ Error sending SMS via Fast2SMS:', errMsg);
        return { success: false, error: errMsg };
    }
});
exports.sendSms = sendSms;
