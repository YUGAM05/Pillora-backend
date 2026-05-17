"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const hospitalMiddleware_1 = require("../middleware/hospitalMiddleware");
const hospitalDashboardController_1 = require("../controllers/hospitalDashboardController");
const router = express_1.default.Router();
// ─── Public Routes (No authentication required to view slots) ───────────────────
router.get('/doctors/:id/slots', hospitalDashboardController_1.getDoctorSlots);
// ─── Patient / Booking Routes (Requires login) ──────────────────────────────────
router.get('/appointments/my-bookings', authMiddleware_1.protect, hospitalDashboardController_1.getMyBookings);
router.post('/appointments', authMiddleware_1.protect, hospitalDashboardController_1.createAppointment);
router.post('/slots/hold', authMiddleware_1.protect, hospitalDashboardController_1.holdSlot);
router.post('/slots/release-hold', authMiddleware_1.protect, hospitalDashboardController_1.releaseSlotHold);
// ─── Hospital Staff Dashboard Routes (Requires authentication and hospital role) ─
router.get('/stats', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalStats);
router.get('/doctors', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalDoctors);
router.get('/appointments', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalAppointments);
router.put('/appointments/:id/status', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.updateAppointmentStatus);
router.get('/slots', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalSlots);
// Management restricted routes (only if SELF managed)
router.post('/doctors', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.addDoctor);
router.put('/doctors/:id', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.updateDoctor);
router.post('/slots/generate', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.bulkGenerateSlots);
router.post('/slots/add', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.addSingleSlot);
router.post('/slots/:id/cancel', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.cancelSlot);
router.delete('/slots/:id', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.deleteSlot);
exports.default = router;
