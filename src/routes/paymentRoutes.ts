import express from 'express';
import { initiatePayment, verifyPayment, createPaymentOrder } from '../controllers/paymentController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/initiate', protect, initiatePayment);
router.post('/create-order', protect, createPaymentOrder);
router.post('/verify', verifyPayment);

export default router;
