import express from 'express';
import { submitPartnerRequest, getPartnerRequests, updatePartnerRequestStatus } from '../controllers/partnerController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { publicFormLimiter } from '../utils/formRateLimit';

const router = express.Router();

// Public route for submitting requests
router.post('/submit', publicFormLimiter, submitPartnerRequest);

// Admin routes
router.get('/all', protect, adminOnly, getPartnerRequests);
router.patch('/:id/status', protect, adminOnly, updatePartnerRequestStatus);

export default router;
