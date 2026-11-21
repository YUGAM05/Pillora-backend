import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware';
import { isHospital, attachHospital, requireHospitalPermission as can } from '../middleware/hospitalMiddleware';
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

// All routes require login, hospital role, and attached hospital profile (owner or
// active staff). Each route then checks the staff role's permission.
router.use(protect, isHospital, attachHospital);

// 1. Main Settings Fetch
router.get('/', can('self'), getHospitalSettings); // sections the role can't see are left out

// 2. Section A: Hospital Profile
router.put('/profile', can('hospitalSettings'), updateHospitalProfile);
router.post('/profile/logo', can('hospitalSettings'), upload.single('logo'), uploadHospitalLogo);

// 3. Section B: Staff & Doctors
// Doctors list for doctorsSlots roles; the staff list itself only for the owner (checked in controller)
router.get('/staff', can('staffManage', 'doctorsSlots'), getHospitalStaffAndDoctors);
router.post('/staff', can('staffManage'), addStaffAccount);
router.put('/staff/:id', can('staffManage'), updateStaffAccount);
router.delete('/staff/:id', can('staffManage'), deleteStaffAccount);

// 4. Section C: Appointment Settings
router.put('/appointments', can('hospitalSettings'), updateAppointmentSettings);

// 5. Section D: Payment & Bank Settings
router.put('/bank-details', can('bankDetails'), updateHospitalBankSettings);

// 6. Section E: Notification Settings
router.put('/notifications', can('hospitalSettings'), updateNotificationPreferences);

// 7. Section F: Security & Login
router.get('/security', can('self'), getSecurityOverview);
router.post('/security/change-password', can('self'), changeHospitalPassword);
router.post('/security/logout-all', can('self'), logoutAllDevices);
router.post('/security/2fa-toggle', can('hospitalSettings'), toggleTwoFactorAuth); // hospital-wide setting

// 8. Section G: Reports & Data Exports
router.get('/reports/export', can('settlements'), exportHospitalReport);

// 9. Section H: Support & Account Closure
router.get('/support/tickets', can('self'), getHospitalSupportTickets);
router.post('/support/tickets', can('self'), createHospitalSupportTicket);
// Closing the hospital's account is the owner's decision only.
router.post('/account/deactivate-request', can('staffManage'), requestAccountDeactivation);

export default router;

