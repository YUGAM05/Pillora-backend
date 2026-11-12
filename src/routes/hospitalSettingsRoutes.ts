import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware';
import { isHospital, attachHospital } from '../middleware/hospitalMiddleware';
import {
    getHospitalSettings,
    updateHospitalProfile,
    uploadHospitalLogo,
    getHospitalStaffAndDoctors,
    addStaffAccount,
    updateStaffAccount,
    deleteStaffAccount,
    updateAppointmentSettings,
    updateHospitalBankSettings,
    updateNotificationPreferences,
    getSecurityOverview,
    changeHospitalPassword,
    logoutAllDevices,
    toggleTwoFactorAuth,
    exportHospitalReport,
    getHospitalSupportTickets,
    createHospitalSupportTicket,
    requestAccountDeactivation
} from '../controllers/hospitalSettingsController';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require login, hospital role, and attached hospital profile
router.use(protect, isHospital, attachHospital);

// 1. Main Settings Fetch
router.get('/', getHospitalSettings);

// 2. Section A: Hospital Profile
router.put('/profile', updateHospitalProfile);
router.post('/profile/logo', upload.single('logo'), uploadHospitalLogo);

// 3. Section B: Staff & Doctors
router.get('/staff', getHospitalStaffAndDoctors);
router.post('/staff', addStaffAccount);
router.put('/staff/:id', updateStaffAccount);
router.delete('/staff/:id', deleteStaffAccount);

// 4. Section C: Appointment Settings
router.put('/appointments', updateAppointmentSettings);

// 5. Section D: Payment & Bank Settings
router.put('/bank-details', updateHospitalBankSettings);

// 6. Section E: Notification Settings
router.put('/notifications', updateNotificationPreferences);

// 7. Section F: Security & Login
router.get('/security', getSecurityOverview);
router.post('/security/change-password', changeHospitalPassword);
router.post('/security/logout-all', logoutAllDevices);
router.post('/security/2fa-toggle', toggleTwoFactorAuth);

// 8. Section G: Reports & Data Exports
router.get('/reports/export', exportHospitalReport);

// 9. Section H: Support & Account Closure
router.get('/support/tickets', getHospitalSupportTickets);
router.post('/support/tickets', createHospitalSupportTicket);
router.post('/account/deactivate-request', requestAccountDeactivation);

export default router;

