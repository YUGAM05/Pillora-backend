import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { createCoupon, getAllCoupons, updateCoupon, deleteCoupon, validateCoupon } from '../controllers/couponController';

const router = express.Router();

// Admin routes
router.post('/admin', protect, adminOnly, createCoupon);
router.get('/admin', protect, adminOnly, getAllCoupons);
router.put('/admin/:id', protect, adminOnly, updateCoupon);
router.delete('/admin/:id', protect, adminOnly, deleteCoupon);

// User routes
router.post('/validate', validateCoupon);

export default router;
