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
exports.sendWhatsAppBill = exports.sendWhatsAppTemplate = exports.formatPhoneNumber = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Utility to format phone number to standard E.164 numeric string without '+' (e.g. 919876543210)
 */
const formatPhoneNumber = (userPhone) => {
    let clean = userPhone.replace(/[^0-9]/g, '');
    if (clean.length === 10) {
        clean = '91' + clean;
    }
    return clean;
};
exports.formatPhoneNumber = formatPhoneNumber;
/**
 * Send a WhatsApp template message via Meta Cloud API v20.0
 *
 * @param phoneNumber Target recipient phone number
 * @param templateName Approved Meta template name (e.g. "booking_confirmation")
 * @param languageCode Template language code (e.g. "en" or "en_US")
 * @param components Optional components array (header/body parameters, buttons)
 */
const sendWhatsAppTemplate = (phoneNumber_1, templateName_1, ...args_1) => __awaiter(void 0, [phoneNumber_1, templateName_1, ...args_1], void 0, function* (phoneNumber, templateName, languageCode = 'en', components = []) {
    var _a;
    const formattedPhone = (0, exports.formatPhoneNumber)(phoneNumber);
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[WhatsApp Service] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in process.env.');
        return { success: false, error: 'WhatsApp API configuration missing in environment variables' };
    }
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    console.log(`[WhatsApp Service] 🚀 Sending template "${templateName}" to ${formattedPhone}...`);
    try {
        const payload = {
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: languageCode
                },
                components: components.length > 0 ? components : undefined
            }
        };
        const response = yield axios_1.default.post(url, payload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`[WhatsApp Service] ✅ Template message sent successfully to ${formattedPhone}:`, response.data);
        return { success: true, data: response.data };
    }
    catch (error) {
        const errPayload = ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message;
        console.error('[WhatsApp Service] ❌ Error sending WhatsApp template message:', errPayload);
        return { success: false, error: errPayload };
    }
});
exports.sendWhatsAppTemplate = sendWhatsAppTemplate;
const sendWhatsAppBill = (userPhone, customerName, orderId, amount, pdfLink) => __awaiter(void 0, void 0, void 0, function* () {
    const formattedPhone = (0, exports.formatPhoneNumber)(userPhone);
    console.log(`[WhatsApp Service] 🚀 Attempting to send bill to ${formattedPhone}...`);
    try {
        console.log("==========================================");
        console.log("📨 WHATSAPP AUTOMATION SIMULATION");
        console.log(`To: ${formattedPhone}`);
        console.log(`Message: `);
        console.log(`Hello ${customerName}, thank you for choosing Pillora!`);
        console.log(`Your order #${orderId} of ₹${amount} has been placed successfully.`);
        console.log(`We will deliver it shortly.`);
        console.log("==========================================");
        return { success: true, message: "Simulated WhatsApp sent" };
    }
    catch (error) {
        console.error('[WhatsApp Service] Error sending message:', error);
        return { success: false, error };
    }
});
exports.sendWhatsAppBill = sendWhatsAppBill;
