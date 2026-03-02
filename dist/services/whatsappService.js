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
exports.sendWhatsAppBill = void 0;
// NOTE: To make this work with a real WhatsApp account, you need to:
// 1. Sign up for Facebook Developers (Meta) or use a professional WhatsApp API provider
// 2. Get your Phone Number ID and Access Token
// 3. Replace the placeholder values below in your .env file
const sendWhatsAppBill = (userPhone, customerName, orderId, amount, pdfLink // In a real app, you'd generate a public link to the PDF
) => __awaiter(void 0, void 0, void 0, function* () {
    // Basic cleaning of phone number to ensure it has country code (assuming India +91 for now)
    // Remove all non-numeric characters
    let formattedPhone = userPhone.replace(/[^0-9]/g, '');
    // If number is 10 digits, add 91. If 12 digits (91...), keep it.
    if (formattedPhone.length === 10) {
        formattedPhone = '91' + formattedPhone;
    }
    console.log(`[WhatsApp Service] 🚀 Attempting to send bill to ${formattedPhone}...`);
    try {
        // --- REAL IMPLEMENTATION EXAMPLE (Commented Out) ---
        /*
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: formattedPhone,
                type: "template",
                template: {
                    name: "order_confirmation",
                    language: { code: "en" },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                { type: "text", text: customerName },
                                { type: "text", text: orderId },
                                { type: "text", text: `₹${amount}` }
                            ]
                        }
                    ]
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
        */
        // --- SIMULATED IMPLEMENTATION (For Development) ---
        console.log("==========================================");
        console.log("📨 WHATSAPP AUTOMATION SIMULATION");
        console.log(`To: ${formattedPhone}`);
        console.log(`Message: `);
        console.log(`Hello ${customerName}, thank you for choosing Apex Care!`);
        console.log(`Your order #${orderId} of ₹${amount} has been placed successfully.`);
        console.log(`We will deliver it shortly.`);
        console.log("==========================================");
        return { success: true, message: "Simulated WhatsApp sent" };
    }
    catch (error) {
        console.error('[WhatsApp Service] Error sending message:', error);
        // Don't block the order flow if whatsapp fails
        return { success: false, error };
    }
});
exports.sendWhatsAppBill = sendWhatsAppBill;
