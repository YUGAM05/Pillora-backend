"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const whatsappController_1 = require("../controllers/whatsappController");
const router = (0, express_1.Router)();
// GET /api/webhook/whatsapp - Meta Webhook Verification
router.get('/whatsapp', whatsappController_1.verifyWebhook);
// POST /api/webhook/whatsapp - Meta Incoming Webhook Events
router.post('/whatsapp', whatsappController_1.handleWebhook);
exports.default = router;
