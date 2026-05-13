import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { isHospital, selfManagedOnly, attachHospital } from '../middleware/hospitalMiddleware';
import {
    getHospitalStats,
    getHospitalDoctors,
    addDoctor,
    bulkGenerateSlots,
    getHospitalAppointments,
    updateAppointmentStatus,
    getDoctorSlots,
    createAppointment
} from '../controllers/hospitalDashboardController';

const router = express.Router();

// All routes require authentication and hospital role
router.use(protect, isHospital);

// Stats and basic info (attach hospital info to req)
router.get('/stats', attachHospital, getHospitalStats);
router.get('/doctors', attachHospital, getHospitalDoctors);
router.get('/appointments', attachHospital, getHospitalAppointments);
router.put('/appointments/:id/status', attachHospital, updateAppointmentStatus);

// Management restricted routes (only if SELF managed)
router.post('/doctors', selfManagedOnly, addDoctor);
router.post('/slots/generate', selfManagedOnly, bulkGenerateSlots);

// Public / User Booking routes (accessible by patients too, so we just check protect)
router.get('/doctors/:id/slots', getDoctorSlots);
router.post('/appointments', createAppointment);

export default router;
