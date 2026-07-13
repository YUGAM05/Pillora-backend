/**
 * SMS service stub for Exotel SMS API integration.
 * TODO: Integrate with real Exotel SMS API endpoint.
 */
export const sendSms = async (phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    console.log("==========================================");
    console.log("📨 SMS AUTOMATION STUB (TODO: Exotel SMS API integration)");
    console.log(`To: ${phone}`);
    console.log(`Message: ${message}`);
    console.log("==========================================");
    
    return { success: true, messageId: "stub_sms_id_12345" };
};
