import { Router } from 'express';
import { verifyWebhook, handleWebhook } from '../controllers/whatsappController';

const router = Router();

// GET /api/webhook/whatsapp - Meta Webhook Verification
router.get('/whatsapp', verifyWebhook);

// POST /api/webhook/whatsapp - Meta Incoming Webhook Events
router.post('/whatsapp', handleWebhook);

export default router;
