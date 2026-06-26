import express from 'express';
import { cancelAppointment, createAppointment, getAppointmentDetails, holdAppointment } from '../controllers/appointmentController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/create', createAppointment);
router.post('/hold', protect, holdAppointment);
router.post('/:appointmentId/cancel', protect, cancelAppointment);
router.get('/:appointmentId', getAppointmentDetails);

export default router;
