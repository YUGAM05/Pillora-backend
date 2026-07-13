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
exports.sendSms = void 0;
/**
 * SMS service stub for Exotel SMS API integration.
 * TODO: Integrate with real Exotel SMS API endpoint.
 */
const sendSms = (phone, message) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("==========================================");
    console.log("📨 SMS AUTOMATION STUB (TODO: Exotel SMS API integration)");
    console.log(`To: ${phone}`);
    console.log(`Message: ${message}`);
    console.log("==========================================");
    return { success: true, messageId: "stub_sms_id_12345" };
});
exports.sendSms = sendSms;
