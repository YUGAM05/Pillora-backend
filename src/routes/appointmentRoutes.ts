import express from 'express';
import { cancelAppointment } from '../controllers/appointmentController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/:appointmentId/cancel', protect, cancelAppointment);

export default router;
