import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { isHospital, selfManagedOnly, attachHospital } from '../middleware/hospitalMiddleware';
import {
    getHospitalStats,
    getHospitalDoctors,
    addDoctor,
    updateDoctor,
    bulkGenerateSlots,
    getHospitalAppointments,
    updateAppointmentStatus,
    getDoctorSlots,
    createAppointment,
    getMyBookings,
    getHospitalSlots,
    addSingleSlot,
    cancelSlot,
    holdSlot,
    releaseSlotHold,
    deleteSlot,
    createManualAppointment
} from '../controllers/hospitalDashboardController';

const router = express.Router();

// ─── Public Routes (No authentication required to view slots) ───────────────────
router.get('/doctors/:id/slots', getDoctorSlots);

// ─── Patient / Booking Routes (Requires login) ──────────────────────────────────
router.get('/appointments/my-bookings', protect, getMyBookings);
router.post('/appointments', protect, createAppointment);
router.post('/slots/hold', protect, holdSlot);
router.post('/slots/release-hold', protect, releaseSlotHold);

// ─── Hospital Staff Dashboard Routes (Requires authentication and hospital role) ─
router.get('/stats', protect, isHospital, attachHospital, getHospitalStats);
router.get('/doctors', protect, isHospital, attachHospital, getHospitalDoctors);
router.get('/appointments', protect, isHospital, attachHospital, getHospitalAppointments);
router.post('/appointments/manual', protect, isHospital, attachHospital, createManualAppointment);
router.put('/appointments/:id/status', protect, isHospital, attachHospital, updateAppointmentStatus);
router.get('/slots', protect, isHospital, attachHospital, getHospitalSlots);

// Management restricted routes (only if SELF managed)
router.post('/doctors', protect, isHospital, selfManagedOnly, addDoctor);
router.put('/doctors/:id', protect, isHospital, selfManagedOnly, updateDoctor);
router.post('/slots/generate', protect, isHospital, selfManagedOnly, bulkGenerateSlots);
router.post('/slots/add', protect, isHospital, selfManagedOnly, addSingleSlot);
router.post('/slots/:id/cancel', protect, isHospital, selfManagedOnly, cancelSlot);
router.delete('/slots/:id', protect, isHospital, selfManagedOnly, deleteSlot);

export default router;
