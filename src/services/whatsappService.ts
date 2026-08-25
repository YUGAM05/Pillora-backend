import axios from 'axios';

/**
 * Utility to format phone number to standard E.164 numeric string without '+' (e.g. 919876543210)
 */
export const formatPhoneNumber = (userPhone: string): string => {
    let clean = userPhone.replace(/[^0-9]/g, '');
    if (clean.length === 10) {
        clean = '91' + clean;
    }
    return clean;
};

/**
 * Send a WhatsApp template message via Meta Cloud API v20.0
 * 
 * @param phoneNumber Target recipient phone number
 * @param templateName Approved Meta template name (e.g. "booking_confirmation")
 * @param languageCode Template language code (e.g. "en" or "en_US")
 * @param components Optional components array (header/body parameters, buttons)
 */
export const sendWhatsAppTemplate = async (
    phoneNumber: string,
    templateName: string,
    languageCode: string = 'en',
    components: any[] = []
) => {
    const formattedPhone = formatPhoneNumber(phoneNumber);
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

        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`[WhatsApp Service] ✅ Template message sent successfully to ${formattedPhone}:`, response.data);
        return { success: true, data: response.data };
    } catch (error: any) {
        const errPayload = error.response?.data || error.message;
        console.error('[WhatsApp Service] ❌ Error sending WhatsApp template message:', errPayload);
        return { success: false, error: errPayload };
    }
};

export const sendWhatsAppBill = async (
    userPhone: string,
    customerName: string,
    orderId: string,
    amount: number,
    pdfLink: string
) => {
    const formattedPhone = formatPhoneNumber(userPhone);

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
    } catch (error) {
        console.error('[WhatsApp Service] Error sending message:', error);
        return { success: false, error };
    }
};
