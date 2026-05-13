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
// All routes require authentication and hospital role
router.use(authMiddleware_1.protect, hospitalMiddleware_1.isHospital);
// Stats and basic info (attach hospital info to req)
router.get('/stats', hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalStats);
router.get('/doctors', hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalDoctors);
router.get('/appointments', hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.getHospitalAppointments);
router.put('/appointments/:id/status', hospitalMiddleware_1.attachHospital, hospitalDashboardController_1.updateAppointmentStatus);
// Management restricted routes (only if SELF managed)
router.post('/doctors', hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.addDoctor);
router.post('/slots/generate', hospitalMiddleware_1.selfManagedOnly, hospitalDashboardController_1.bulkGenerateSlots);
// Public / User Booking routes (accessible by patients too, so we just check protect)
router.get('/doctors/:id/slots', hospitalDashboardController_1.getDoctorSlots);
router.post('/appointments', hospitalDashboardController_1.createAppointment);
exports.default = router;
