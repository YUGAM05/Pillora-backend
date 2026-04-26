import express from 'express';
import { submitPartnerRequest, getPartnerRequests, updatePartnerRequestStatus } from '../controllers/partnerController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = express.Router();

// Public route for submitting requests
router.post('/submit', submitPartnerRequest);

// Admin routes
router.get('/all', protect, adminOnly, getPartnerRequests);
router.patch('/:id/status', protect, adminOnly, updatePartnerRequestStatus);

export default router;
