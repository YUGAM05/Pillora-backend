import { Request, Response } from 'express';
import crypto from 'crypto';
import WhatsAppEvent from '../models/WhatsAppEvent';
import WhatsAppMessage from '../models/WhatsAppMessage';

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

        console.log(`[WhatsApp Webhook Verification] Mode: ${mode}, token ${token ? "provided" : "missing"}`);

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

// Delivery statuses only move forward; "failed" can arrive at any point.
const STATUS_RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Meta signs webhook calls with the app secret (X-Hub-Signature-256). Checked when META_APP_SECRET is set. */
function signatureOk(req: Request): boolean {
    const secret = process.env.META_APP_SECRET;
    if (!secret) return true;
    const header = String(req.headers['x-hub-signature-256'] || '');
    const raw: Buffer | undefined = (req as any).rawBody;
    if (!header.startsWith('sha256=') || !raw) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return expected.length === header.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

async function applyStatus(statusItem: any) {
    const wamid = statusItem.id;
    const status = statusItem.status;
    if (!wamid || !(status in STATUS_RANK)) return;
    const at = statusItem.timestamp ? new Date(Number(statusItem.timestamp) * 1000) : new Date();
    const error = statusItem.errors?.[0] ? `${statusItem.errors[0].code}: ${statusItem.errors[0].title || statusItem.errors[0].message || ''}`.trim() : undefined;
    // Only move forward (sent -> delivered -> read); failed always wins.
    const lowerRanks = Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s] < STATUS_RANK[status]);
    await WhatsAppMessage.updateOne(
        { wamid, status: status === 'failed' ? { $ne: 'failed' } : { $in: lowerRanks } },
        { $set: { status, statusAt: at, ...(error ? { error } : {}) } }
    );
}

/**
 * @desc    Handle incoming WhatsApp Cloud API Webhook events (POST)
 * @route   POST /api/webhook/whatsapp
 * @access  Public (Meta Webhook Receiver)
 *
 * Processed BEFORE replying: on serverless hosting, work after the reply may
 * never run. Meta allows a few seconds, and this is quick.
 */
export const handleWebhook = async (req: Request, res: Response): Promise<any> => {
    if (!signatureOk(req)) {
        console.warn('[WhatsApp Webhook] Rejected: bad or missing signature');
        return res.sendStatus(401);
    }
    try {
        const body = req.body;
        if (!body || body.object !== 'whatsapp_business_account') {
            return res.status(200).send('IGNORED');
        }

        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value;
                if (!value) continue;

                // Delivery reports: update the message's status. Full details are
                // kept only for failures (to see why); the rest would just fill the database.
                if (Array.isArray(value.statuses)) {
                    for (const statusItem of value.statuses) {
                        await applyStatus(statusItem);
                        if (statusItem.status === 'failed') {
                            await WhatsAppEvent.create({
                                eventType: 'status_update',
                                status: 'failed',
                                senderPhoneNumber: statusItem.recipient_id,
                                messageType: 'status',
                                textBody: statusItem.errors ? JSON.stringify(statusItem.errors) : undefined,
                                rawPayload: { status: statusItem },
                                timestamp: statusItem.timestamp ? new Date(Number(statusItem.timestamp) * 1000) : new Date(),
                            });
                        }
                    }
                }

                // Patients' replies
                if (Array.isArray(value.messages)) {
                    for (const messageItem of value.messages) {
                        let extractedText: string | undefined;
                        if (messageItem.type === 'text') {
                            extractedText = messageItem.text?.body;
                        } else if (messageItem.type === 'button') {
                            extractedText = messageItem.button?.text || messageItem.button?.payload;
                        } else if (messageItem.type === 'interactive') {
                            extractedText = messageItem.interactive?.button_reply?.title || messageItem.interactive?.list_reply?.title || JSON.stringify(messageItem.interactive);
                        }
                        await WhatsAppEvent.create({
                            eventType: 'message_received',
                            senderPhoneNumber: messageItem.from,
                            messageType: messageItem.type || 'unknown',
                            textBody: extractedText,
                            rawPayload: { message: messageItem },
                            timestamp: messageItem.timestamp ? new Date(Number(messageItem.timestamp) * 1000) : new Date(),
                        });
                    }
                }

                // Other changes (template approvals, account updates)
                if (!value.statuses && !value.messages) {
                    await WhatsAppEvent.create({ eventType: change.field || 'other_change', rawPayload: { field: change.field, value }, timestamp: new Date() });
                }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    } catch (err: any) {
        console.error('[WhatsApp Webhook] Error processing event:', err.message || err);
        // Still 200: Meta retries failed deliveries for days, which would only repeat the error.
        return res.status(200).send('EVENT_RECEIVED');
    }
};
