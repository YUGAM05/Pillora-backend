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
router.post('/appointments', authMiddleware_1.protect, hospitalDashboardController_1.createAppointment);
// ─── Hospital Staff Dashboard Routes (Requires authentication and hospital role) ─
router.get('/stats', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalStats);
router.get('/doctors', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalDoctors);
router.get('/appointments', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalAppointments);
router.put('/appointments/:id/status', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.updateAppointmentStatus);
// Management restricted routes (only if SELF managed)
router.post('/doctors', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.addDoctor);
router.post('/slots/generate', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.bulkGenerateSlots);
exports.default = router;
