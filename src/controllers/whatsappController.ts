import { Request, Response } from 'express';
import WhatsAppEvent from '../models/WhatsAppEvent';

/**
 * @desc    Verify WhatsApp Cloud API Webhook (GET)
 * @route   GET /api/webhook/whatsapp
 * @access  Public (Meta Webhook Verification)
 */
export const verifyWebhook = (req: Request, res: Response): any => {
    try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

        console.log(`[WhatsApp Webhook Verification] Mode: ${mode}, Token provided: ${token}`);

        if (mode === 'subscribe' && token === verifyToken) {
            console.log('[WhatsApp Webhook Verification] Verification successful!');
            return res.status(200).send(challenge);
        } else {
            console.warn('[WhatsApp Webhook Verification] Verification failed. Token mismatch or invalid mode.');
            return res.sendStatus(403);
        }
    } catch (error: any) {
        console.error('[WhatsApp Webhook Verification] Error during verification:', error.message);
        return res.status(500).json({ message: 'Internal server error during webhook verification' });
    }
};

/**
 * @desc    Handle incoming WhatsApp Cloud API Webhook events (POST)
 * @route   POST /api/webhook/whatsapp
 * @access  Public (Meta Webhook Receiver)
 */
export const handleWebhook = (req: Request, res: Response): any => {
    // 1. Immediately acknowledge event receipt to Meta with HTTP 200
    res.status(200).send('EVENT_RECEIVED');

    // 2. Process payload asynchronously in background
    (async () => {
        try {
            const body = req.body;
            console.log('[WhatsApp Webhook] Received payload:\n', JSON.stringify(body, null, 2));

            if (!body || body.object !== 'whatsapp_business_account') {
                console.log('[WhatsApp Webhook] Ignored non-whatsapp event object:', body?.object);
                return;
            }

            const entries = body.entry || [];
            for (const entry of entries) {
                const changes = entry.changes || [];
                for (const change of changes) {
                    const value = change.value;
                    if (!value) continue;

                    // Case A: Message status updates (sent, delivered, read, failed)
                    if (value.statuses && Array.isArray(value.statuses)) {
                        for (const statusItem of value.statuses) {
                            await WhatsAppEvent.create({
                                eventType: 'status_update',
                                status: statusItem.status,
                                senderPhoneNumber: statusItem.recipient_id,
                                messageType: 'status',
                                textBody: statusItem.errors ? JSON.stringify(statusItem.errors) : undefined,
                                rawPayload: body,
                                timestamp: statusItem.timestamp ? new Date(Number(statusItem.timestamp) * 1000) : new Date()
                            });
                            console.log(`[WhatsApp Webhook] Saved status update: ${statusItem.status} for ${statusItem.recipient_id}`);
                        }
                    }

                    // Case B: Incoming user messages / replies
                    if (value.messages && Array.isArray(value.messages)) {
                        for (const messageItem of value.messages) {
                            let extractedText: string | undefined;

                            if (messageItem.type === 'text') {
                                extractedText = messageItem.text?.body;
                            } else if (messageItem.type === 'button') {
                                extractedText = messageItem.button?.text || messageItem.button?.payload;
                            } else if (messageItem.type === 'interactive') {
                                extractedText = messageItem.interactive?.button_reply?.title ||
                                                messageItem.interactive?.list_reply?.title ||
                                                JSON.stringify(messageItem.interactive);
                            }

                            await WhatsAppEvent.create({
                                eventType: 'message_received',
                                status: undefined,
                                senderPhoneNumber: messageItem.from,
                                messageType: messageItem.type || 'unknown',
                                textBody: extractedText,
                                rawPayload: body,
                                timestamp: messageItem.timestamp ? new Date(Number(messageItem.timestamp) * 1000) : new Date()
                            });
                            console.log(`[WhatsApp Webhook] Saved incoming message from ${messageItem.from}: "${extractedText}"`);
                        }
                    }

                    // Fallback Case: Other changes (e.g., template status changes, account updates)
                    if (!value.statuses && !value.messages) {
                        await WhatsAppEvent.create({
                            eventType: 'other_change',
                            rawPayload: body,
                            timestamp: new Date()
                        });
                        console.log('[WhatsApp Webhook] Saved general event change');
                    }
                }
            }
        } catch (err: any) {
            console.error('[WhatsApp Webhook] Error processing event in background:', err.message || err);
        }
    })();
};
