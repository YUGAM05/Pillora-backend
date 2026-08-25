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
exports.handleWebhook = exports.verifyWebhook = void 0;
const WhatsAppEvent_1 = __importDefault(require("../models/WhatsAppEvent"));
/**
 * @desc    Verify WhatsApp Cloud API Webhook (GET)
 * @route   GET /api/webhook/whatsapp
 * @access  Public (Meta Webhook Verification)
 */
const verifyWebhook = (req, res) => {
    try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
        console.log(`[WhatsApp Webhook Verification] Mode: ${mode}, Token provided: ${token}`);
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('[WhatsApp Webhook Verification] Verification successful!');
            return res.status(200).send(challenge);
        }
        else {
            console.warn('[WhatsApp Webhook Verification] Verification failed. Token mismatch or invalid mode.');
            return res.sendStatus(403);
        }
    }
    catch (error) {
        console.error('[WhatsApp Webhook Verification] Error during verification:', error.message);
        return res.status(500).json({ message: 'Internal server error during webhook verification' });
    }
};
exports.verifyWebhook = verifyWebhook;
/**
 * @desc    Handle incoming WhatsApp Cloud API Webhook events (POST)
 * @route   POST /api/webhook/whatsapp
 * @access  Public (Meta Webhook Receiver)
 */
const handleWebhook = (req, res) => {
    // 1. Immediately acknowledge event receipt to Meta with HTTP 200
    res.status(200).send('EVENT_RECEIVED');
    // 2. Process payload asynchronously in background
    (() => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const body = req.body;
            console.log('[WhatsApp Webhook] Received payload:\n', JSON.stringify(body, null, 2));
            if (!body || body.object !== 'whatsapp_business_account') {
                console.log('[WhatsApp Webhook] Ignored non-whatsapp event object:', body === null || body === void 0 ? void 0 : body.object);
                return;
            }
            const entries = body.entry || [];
            for (const entry of entries) {
                const changes = entry.changes || [];
                for (const change of changes) {
                    const value = change.value;
                    if (!value)
                        continue;
                    // Case A: Message status updates (sent, delivered, read, failed)
                    if (value.statuses && Array.isArray(value.statuses)) {
                        for (const statusItem of value.statuses) {
                            yield WhatsAppEvent_1.default.create({
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
                            let extractedText;
                            if (messageItem.type === 'text') {
                                extractedText = (_a = messageItem.text) === null || _a === void 0 ? void 0 : _a.body;
                            }
                            else if (messageItem.type === 'button') {
                                extractedText = ((_b = messageItem.button) === null || _b === void 0 ? void 0 : _b.text) || ((_c = messageItem.button) === null || _c === void 0 ? void 0 : _c.payload);
                            }
                            else if (messageItem.type === 'interactive') {
                                extractedText = ((_e = (_d = messageItem.interactive) === null || _d === void 0 ? void 0 : _d.button_reply) === null || _e === void 0 ? void 0 : _e.title) ||
                                    ((_g = (_f = messageItem.interactive) === null || _f === void 0 ? void 0 : _f.list_reply) === null || _g === void 0 ? void 0 : _g.title) ||
                                    JSON.stringify(messageItem.interactive);
                            }
                            yield WhatsAppEvent_1.default.create({
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
                        yield WhatsAppEvent_1.default.create({
                            eventType: 'other_change',
                            rawPayload: body,
                            timestamp: new Date()
                        });
                        console.log('[WhatsApp Webhook] Saved general event change');
                    }
                }
            }
        }
        catch (err) {
            console.error('[WhatsApp Webhook] Error processing event in background:', err.message || err);
        }
    }))();
};
exports.handleWebhook = handleWebhook;
