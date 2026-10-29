import axios from 'axios';

/**
 * Sends an SMS message to a mobile number using Fast2SMS.
 * Supports 10-digit Indian mobile numbers.
 */
export const sendSms = async (
    phone: string,
    message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
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
        const response = await axios.get(url, {
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
        } else {
            const errMsg = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message || 'Fast2SMS returned failure');
            console.error(`[SMS Service] ❌ Fast2SMS delivery failure:`, errMsg);
            return { success: false, error: errMsg };
        }
    } catch (error: any) {
        const errPayload = error.response?.data || error.message;
        const errMsg = typeof errPayload === 'object' ? JSON.stringify(errPayload) : String(errPayload);
        console.error('[SMS Service] ❌ Error sending SMS via Fast2SMS:', errMsg);
        return { success: false, error: errMsg };
    }
};
