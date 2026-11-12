"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const hospitalMiddleware_1 = require("../middleware/hospitalMiddleware");
const hospitalSettingsController_1 = require("../controllers/hospitalSettingsController");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// All routes require login, hospital role, and attached hospital profile
router.use(authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital);
// 1. Main Settings Fetch
router.get('/', hospitalSettingsController_1.getHospitalSettings);
// 2. Section A: Hospital Profile
router.put('/profile', hospitalSettingsController_1.updateHospitalProfile);
router.post('/profile/logo', upload.single('logo'), hospitalSettingsController_1.uploadHospitalLogo);
// 3. Section B: Staff & Doctors
router.get('/staff', hospitalSettingsController_1.getHospitalStaffAndDoctors);
router.post('/staff', hospitalSettingsController_1.addStaffAccount);
router.put('/staff/:id', hospitalSettingsController_1.updateStaffAccount);
router.delete('/staff/:id', hospitalSettingsController_1.deleteStaffAccount);
// 4. Section C: Appointment Settings
router.put('/appointments', hospitalSettingsController_1.updateAppointmentSettings);
// 5. Section D: Payment & Bank Settings
router.put('/bank-details', hospitalSettingsController_1.updateHospitalBankSettings);
// 6. Section E: Notification Settings
router.put('/notifications', hospitalSettingsController_1.updateNotificationPreferences);
// 7. Section F: Security & Login
router.get('/security', hospitalSettingsController_1.getSecurityOverview);
router.post('/security/change-password', hospitalSettingsController_1.changeHospitalPassword);
router.post('/security/logout-all', hospitalSettingsController_1.logoutAllDevices);
router.post('/security/2fa-toggle', hospitalSettingsController_1.toggleTwoFactorAuth);
// 8. Section G: Reports & Data Exports
router.get('/reports/export', hospitalSettingsController_1.exportHospitalReport);
// 9. Section H: Support & Account Closure
router.get('/support/tickets', hospitalSettingsController_1.getHospitalSupportTickets);
router.post('/support/tickets', hospitalSettingsController_1.createHospitalSupportTicket);
router.post('/account/deactivate-request', hospitalSettingsController_1.requestAccountDeactivation);
exports.default = router;
