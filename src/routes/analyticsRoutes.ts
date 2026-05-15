import express from 'express';
import { trackEvent, getAnalyticsStats } from '../controllers/analyticsController';
// Assuming there's a protect and admin middleware
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = express.Router();

// Public endpoint for tracking
router.post('/collect', trackEvent);

// Protected endpoint for admin dashboard
router.get('/view', protect, adminOnly, getAnalyticsStats);

export default router;
