import express from 'express';
import { cancelAppointment, createAppointment } from '../controllers/appointmentController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/create', createAppointment);
router.post('/:appointmentId/cancel', protect, cancelAppointment);

export default router;
