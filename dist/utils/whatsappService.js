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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppMessage = void 0;
/**
 * Send a WhatsApp message (Simulation - Twilio removed)
 * @param to Phone number to send the message to
 * @param content Message body OR template configuration
 */
const sendWhatsAppMessage = (to, content) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const messageBody = typeof content === 'string' ? content : JSON.stringify(content);
        console.log(`[WhatsApp Simulation] 📱 Sending message to ${toFormatted}`);
        console.log(`[WhatsApp Content]: ${messageBody}`);
        console.log(`[WhatsApp Status]: Successfully "sent" (Simulated)`);
        return { sid: `SIM_${Date.now()}` };
    }
    catch (error) {
        console.error('Error in WhatsApp simulation:', error);
        return { error: 'Simulation error' };
    }
});
exports.sendWhatsAppMessage = sendWhatsAppMessage;
