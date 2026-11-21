import express from 'express';
import { createTicket, getAllTickets, updateTicketStatus, getMyTickets, createGuestTicket } from '../controllers/supportController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { publicFormLimiter } from '../utils/formRateLimit';

const router = express.Router();

// Public routes
router.post('/guest', publicFormLimiter, createGuestTicket);

// User routes
router.post('/', protect, createTicket);
router.get('/my-tickets', protect, getMyTickets);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllTickets);
router.patch('/admin/:id', protect, adminOnly, updateTicketStatus);

export default router;
