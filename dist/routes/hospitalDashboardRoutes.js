"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const hospitalMiddleware_1 = require("../middleware/hospitalMiddleware");
const hospitalDashboardController_1 = require("../controllers/hospitalDashboardController");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// ─── Public Routes (No authentication required to view slots) ───────────────────
router.get('/doctors/:id/slots', hospitalDashboardController_1.getDoctorSlots);
// ─── Patient / Booking Routes (Requires login) ──────────────────────────────────
router.get('/appointments/my-bookings', authMiddleware_1.protect, hospitalDashboardController_1.getMyBookings);
router.post('/appointments', authMiddleware_1.protect, hospitalDashboardController_1.createAppointment);
router.post('/slots/hold', authMiddleware_1.protect, hospitalDashboardController_1.holdSlot);
router.post('/slots/release-hold', authMiddleware_1.protect, hospitalDashboardController_1.releaseSlotHold);
// ─── Hospital Staff Dashboard Routes (Requires authentication and hospital role) ─
router.get('/stats', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalStats);
router.get('/analytics/booking-hours', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getBookingHoursAnalytics);
router.get('/analytics/cancellation-rate', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getCancellationRate);
router.get('/doctors', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalDoctors);
router.get('/appointments', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalAppointments);
router.post('/appointments/manual', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.createManualAppointment);
router.put('/appointments/:id/status', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.updateAppointmentStatus);
router.put('/appointments/:id/assign-doctor', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.assignDoctorToAppointment);
router.put('/appointments/:id/prescription', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.updateAppointmentPrescription);
router.post('/appointments/:id/invoice', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.generateAndSendInvoice);
router.get('/slots', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalSlots);
router.get('/patients/:patientId/notes', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getPatientNotes);
router.post('/patients/:patientId/notes', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.addPatientNote);
// Autocomplete routes must be registered BEFORE /patients/:patientId routes to avoid Express treating 'autocomplete' as a patientId param
router.get('/patients/autocomplete', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.autocompletePatients);
router.get('/bookings/autocomplete', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.autocompleteBookingIds);
router.get('/patients/search', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.searchPatients);
router.post('/appointments/:id/prescription', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, upload.single('prescription'), hospitalDashboardController_1.uploadAppointmentPrescription);
router.get('/appointments/:id/prescription', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getAppointmentPrescription);
// Payment routes
router.get('/payments/summary', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getPaymentSummary);
router.post('/appointments/:id/payment', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.recordPayment);
// Management restricted routes (only if SELF managed)
router.post('/doctors', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.addDoctor);
router.put('/doctors/:id', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.updateDoctor);
router.delete('/doctors/:id', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.deleteDoctor);
router.post('/slots/generate', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.bulkGenerateSlots);
router.post('/slots/add', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.addSingleSlot);
router.post('/slots/:id/cancel', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.cancelSlot);
router.delete('/slots/:id', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.deleteSlot);
exports.default = router;
