import express from 'express';
import multer from 'multer';
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
    createManualAppointment,
    deleteDoctor,
    getBookingHoursAnalytics,
    getCancellationRate,
    assignDoctorToAppointment,
    getPatientNotes,
    addPatientNote,
    updateAppointmentPrescription,
    generateAndSendInvoice,
    searchPatients,
    uploadAppointmentPrescription,
    getAppointmentPrescription,
    autocompletePatients,
    autocompleteBookingIds
} from '../controllers/hospitalDashboardController';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Public Routes (No authentication required to view slots) ───────────────────
router.get('/doctors/:id/slots', getDoctorSlots);

// ─── Patient / Booking Routes (Requires login) ──────────────────────────────────
router.get('/appointments/my-bookings', protect, getMyBookings);
router.post('/appointments', protect, createAppointment);
router.post('/slots/hold', protect, holdSlot);
router.post('/slots/release-hold', protect, releaseSlotHold);

// ─── Hospital Staff Dashboard Routes (Requires authentication and hospital role) ─
router.get('/stats', protect, isHospital, attachHospital, getHospitalStats);
router.get('/analytics/booking-hours', protect, isHospital, attachHospital, getBookingHoursAnalytics);
router.get('/analytics/cancellation-rate', protect, isHospital, attachHospital, getCancellationRate);
router.get('/doctors', protect, isHospital, attachHospital, getHospitalDoctors);
router.get('/appointments', protect, isHospital, attachHospital, getHospitalAppointments);
router.post('/appointments/manual', protect, isHospital, attachHospital, createManualAppointment);
router.put('/appointments/:id/status', protect, isHospital, attachHospital, updateAppointmentStatus);
router.put('/appointments/:id/assign-doctor', protect, isHospital, attachHospital, assignDoctorToAppointment);
router.put('/appointments/:id/prescription', protect, isHospital, attachHospital, updateAppointmentPrescription);
router.post('/appointments/:id/invoice', protect, isHospital, attachHospital, generateAndSendInvoice);
router.get('/slots', protect, isHospital, attachHospital, getHospitalSlots);

router.get('/patients/:patientId/notes', protect, isHospital, attachHospital, getPatientNotes);
router.post('/patients/:patientId/notes', protect, isHospital, attachHospital, addPatientNote);

// Autocomplete routes must be registered BEFORE /patients/:patientId routes to avoid Express treating 'autocomplete' as a patientId param
router.get('/patients/autocomplete', protect, isHospital, attachHospital, autocompletePatients);
router.get('/bookings/autocomplete', protect, isHospital, attachHospital, autocompleteBookingIds);
router.get('/patients/search', protect, isHospital, attachHospital, searchPatients);
router.post('/appointments/:id/prescription', protect, isHospital, attachHospital, upload.single('prescription'), uploadAppointmentPrescription);
router.get('/appointments/:id/prescription', protect, isHospital, attachHospital, getAppointmentPrescription);

// Management restricted routes (only if SELF managed)
router.post('/doctors', protect, isHospital, selfManagedOnly, addDoctor);
router.put('/doctors/:id', protect, isHospital, selfManagedOnly, updateDoctor);
router.delete('/doctors/:id', protect, isHospital, selfManagedOnly, deleteDoctor);
router.post('/slots/generate', protect, isHospital, selfManagedOnly, bulkGenerateSlots);
router.post('/slots/add', protect, isHospital, selfManagedOnly, addSingleSlot);
router.post('/slots/:id/cancel', protect, isHospital, selfManagedOnly, cancelSlot);
router.delete('/slots/:id', protect, isHospital, selfManagedOnly, deleteSlot);

export default router;
