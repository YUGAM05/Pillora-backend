import express, { Request, Response, NextFunction } from 'express';
import { initiatePayment, verifyPayment, createPaymentOrder } from '../controllers/paymentController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/initiate', protect, initiatePayment);
router.post('/create-order', protect, createPaymentOrder);

// Razorpay webhooks (signed with X-Razorpay-Signature) are verified by their HMAC inside the controller.
// Checkout-page callbacks must come from the logged-in patient who owns the booking.
const protectUnlessWebhook = (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-razorpay-signature']) return next();
    return (protect as any)(req, res, next);
};
router.post('/verify', protectUnlessWebhook, verifyPayment);

export default router;
