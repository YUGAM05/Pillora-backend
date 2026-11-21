import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware';
import { isHospital, attachHospital, requireActiveSubscription, requireHospitalPermission as can } from '../middleware/hospitalMiddleware';
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
    getAppointmentPrescriptionFile,
    autocompletePatients,
    autocompleteBookingIds,
    recordPayment,
    getPaymentSummary,
    updatePaymentStatus,
    getHospitalSubscription
} from '../controllers/hospitalDashboardController';
import { getUsage, orderPack, verifyPack, getVoiceCalls } from '../controllers/usageController';
import {
    getFollowUpReminders,
    createFollowUpReminder,
    getFollowUpReminderById,
    updateFollowUpReminder,
    cancelFollowUpReminder,
    retryFollowUpReminder,
    convertFollowUpToBooking
} from '../controllers/followUpController';
import {
    getHospitalFinancialOverview,
    getHospitalPaymentRecords,
    collectClinicBalance,
    editAppointmentPaymentRecord,
    getAppointmentPaymentHistory
} from '../controllers/financialController';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
// Logged-in hospital user (owner or active staff) with req.hospital resolved
const staff = [protect, isHospital, attachHospital];

// ─── Public Routes (No authentication required to view slots) ───────────────────
router.get('/doctors/:id/slots', getDoctorSlots);

// ─── Patient / Booking Routes (Requires login) ──────────────────────────────────
router.get('/appointments/my-bookings', protect, getMyBookings);
router.post('/appointments', protect, createAppointment);
router.post('/slots/hold', protect, holdSlot);
router.post('/slots/release-hold', protect, releaseSlotHold);

// ─── Hospital Staff Dashboard Routes (Requires authentication and hospital role) ─
router.get('/stats', ...staff, can('self'), getHospitalStats);
router.get('/analytics/booking-hours', ...staff, can('appointments'), getBookingHoursAnalytics);
router.get('/analytics/cancellation-rate', ...staff, can('appointments'), getCancellationRate);
router.get('/doctors', ...staff, can('self'), getHospitalDoctors);
router.get('/appointments', ...staff, can('appointments'), getHospitalAppointments);
router.post('/appointments/manual', ...staff, can('appointments'), createManualAppointment);
router.put('/appointments/:id/status', ...staff, can('appointments'), updateAppointmentStatus);
router.put('/appointments/:id/assign-doctor', ...staff, can('appointments'), assignDoctorToAppointment);
router.put('/appointments/:id/prescription', ...staff, can('appointments'), updateAppointmentPrescription);
router.post('/appointments/:id/invoice', ...staff, can('payments'), generateAndSendInvoice);
router.get('/slots', ...staff, can('self'), getHospitalSlots);

router.get('/patients/:patientId/notes', ...staff, can('patients'), getPatientNotes);
router.post('/patients/:patientId/notes', ...staff, can('patients'), addPatientNote);

// Autocomplete routes must be registered BEFORE /patients/:patientId routes to avoid Express treating 'autocomplete' as a patientId param
router.get('/patients/autocomplete', ...staff, can('patients'), autocompletePatients);
router.get('/bookings/autocomplete', ...staff, can('patients'), autocompleteBookingIds);
router.get('/patients/search', ...staff, can('patients'), searchPatients);
router.post('/appointments/:id/prescription', protect, upload.single('prescription'), uploadAppointmentPrescription);
router.get('/appointments/:id/prescription', protect, getAppointmentPrescription);
router.get('/appointments/:id/prescription/file', getAppointmentPrescriptionFile);

// Payment routes
router.get('/payments/summary', ...staff, can('payments'), getPaymentSummary);
router.post('/appointments/:id/payment', ...staff, can('payments'), recordPayment);
router.patch('/appointments/:id/payment-status', ...staff, can('payments'), updatePaymentStatus);

// Central Financial Management & Collections (Payments & Collections Menu)
router.get('/financial/overview', ...staff, can('settlements'), getHospitalFinancialOverview);
router.get('/financial/appointments', ...staff, can('payments'), getHospitalPaymentRecords);
router.post('/appointments/:id/collect-balance', ...staff, can('payments'), collectClinicBalance);
router.put('/appointments/:id/financial-edit', ...staff, can('payments'), editAppointmentPaymentRecord);
router.get('/appointments/:id/payment-history', ...staff, can('payments'), getAppointmentPaymentHistory);

// Hospital Subscription & 30-Day Cycle Details
router.get('/subscription', ...staff, can('planView'), getHospitalSubscription);

// Follow-Up Reminder routes (Walk-in & Online Modes)
router.get('/follow-ups', ...staff, can('followups'), getFollowUpReminders);
router.post('/follow-ups', ...staff, can('followups'), createFollowUpReminder);
router.get('/follow-ups/:id', ...staff, can('followups'), getFollowUpReminderById);
router.put('/follow-ups/:id', ...staff, can('followups'), updateFollowUpReminder);
router.put('/follow-ups/:id/cancel', ...staff, can('followups'), cancelFollowUpReminder);
router.post('/follow-ups/:id/retry', ...staff, can('followups'), retryFollowUpReminder);
router.post('/follow-ups/:id/convert-booking', ...staff, can('followups'), convertFollowUpToBooking);

// Management restricted routes (only if SELF managed)
router.post('/doctors', ...staff, can('doctorsSlots'), addDoctor);
router.put('/doctors/:id', ...staff, can('doctorsSlots'), updateDoctor);
router.delete('/doctors/:id', ...staff, can('doctorsSlots'), deleteDoctor);
router.post('/slots/generate', ...staff, can('doctorsSlots'), requireActiveSubscription, bulkGenerateSlots);
router.post('/slots/add', ...staff, can('doctorsSlots'), requireActiveSubscription, addSingleSlot);
router.post('/slots/:id/cancel', ...staff, can('doctorsSlots'), cancelSlot);
router.delete('/slots/:id', ...staff, can('doctorsSlots'), deleteSlot);

// Plan usage (WhatsApp messages, AI minutes), add-on packs, AI call history
router.get('/usage', ...staff, can('planView'), getUsage);
router.post('/packs/order', ...staff, can('planPurchase'), orderPack);
router.post('/packs/verify', ...staff, can('planPurchase'), verifyPack);
router.get('/voice-calls', ...staff, can('planView'), getVoiceCalls);

export default router;
