/**
 * Send a WhatsApp message (Simulation - Twilio removed)
 * @param to Phone number to send the message to
 * @param content Message body OR template configuration
 */
export const sendWhatsAppMessage = async (to: string, content: string | { contentSid: string, contentVariables: string }) => {
    try {
        const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const messageBody = typeof content === 'string' ? content : JSON.stringify(content);

        console.log(`[WhatsApp Simulation] 📱 Sending message to ${toFormatted}`);
        console.log(`[WhatsApp Content]: ${messageBody}`);
        console.log(`[WhatsApp Status]: Successfully "sent" (Simulated)`);

        return { sid: `SIM_${Date.now()}` };
    } catch (error) {
        console.error('Error in WhatsApp simulation:', error);
        return { error: 'Simulation error' };
    }
};
