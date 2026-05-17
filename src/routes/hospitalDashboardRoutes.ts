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
    createAppointment,
    getMyBookings
} from '../controllers/hospitalDashboardController';

const router = express.Router();

// ─── Public Routes (No authentication required to view slots) ───────────────────
router.get('/doctors/:id/slots', getDoctorSlots);

// ─── Patient / Booking Routes (Requires login) ──────────────────────────────────
router.get('/appointments/my-bookings', protect, getMyBookings);
router.post('/appointments', protect, createAppointment);

// ─── Hospital Staff Dashboard Routes (Requires authentication and hospital role) ─
router.get('/stats', protect, isHospital, attachHospital, getHospitalStats);
router.get('/doctors', protect, isHospital, attachHospital, getHospitalDoctors);
router.get('/appointments', protect, isHospital, attachHospital, getHospitalAppointments);
router.put('/appointments/:id/status', protect, isHospital, attachHospital, updateAppointmentStatus);

// Management restricted routes (only if SELF managed)
router.post('/doctors', protect, isHospital, selfManagedOnly, addDoctor);
router.post('/slots/generate', protect, isHospital, selfManagedOnly, bulkGenerateSlots);

export default router;
