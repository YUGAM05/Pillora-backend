import express from 'express';
import { getSystemStats, getAdminTrends, getPlatformActivities, getLoginAnalytics, getRevenueAnalytics } from '../controllers/adminController';
import {
    getAdminFinancialOverview,
    getAdminHospitalFinancialReport,
    getAdminTransactionsLedger,
    getAdminSettlementManagement,
    recordAdminSettlementPayout,
    updateHospitalBankDetailsAdmin,
    calculateHospitalSettlementForDateRange,
    sendSettlementRequestToHospital,
    getAdminRefunds,
    processAdminRefund
} from '../controllers/financialController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protect stats route with Admin check
router.get('/stats', protect, adminOnly, getSystemStats);
router.get('/trends', protect, adminOnly, getAdminTrends); // NEW: Trend data for graphs
router.get('/activities', protect, adminOnly, getPlatformActivities); // NEW: Real-time platform activities
router.get('/login-analytics', protect, adminOnly, getLoginAnalytics); // NEW: Login analytics stats & logs
router.get('/revenue', protect, adminOnly, getRevenueAnalytics);

// User Management
import { 
    getUsers, 
    updateUserStatus, 
    getAdminProducts, 
    updateProductStatus, 
    deleteProduct, 
    toggleDealStatus, 
    getUserOrders, 
    updateProduct, 
    getAllOrders, 
    verifyUserAadhaar, 
    registerHospital, 
    getAdminHospitals, 
    toggleHospitalManagement,
    getAdminHospitalDoctors,
    adminAddDoctor,
    adminBulkGenerateSlots,
    bulkImportDonors,
    downloadBulkImportTemplate,
    createOrUpdateVoiceConfig,
    getVoiceConfigs,
    getAdminSubscriptionSummary,
    getAdminSubscriptionsList,
    adminRecordHospitalPayment,
    getAdminHospitalPayments,
    adminUpdateHospitalSubscription
} from '../controllers/adminController';
router.get('/users', protect, adminOnly, getUsers);
router.put('/users/:id/status', protect, adminOnly, updateUserStatus);
router.post('/users/:id/verify-aadhaar', protect, adminOnly, verifyUserAadhaar);
router.get('/users/:id/orders', protect, adminOnly, getUserOrders);
router.get('/orders', protect, adminOnly, getAllOrders); // NEW: Get all system orders

// Donor Bulk Import Management
router.post('/donors/bulk-import', protect, adminOnly, upload.single('file'), bulkImportDonors);
router.get('/donors/bulk-import/template', protect, adminOnly, downloadBulkImportTemplate);

// Hospital Management
router.post('/hospitals/register', protect, adminOnly, registerHospital);
router.get('/hospitals', protect, adminOnly, getAdminHospitals);
router.put('/hospitals/:id/management', protect, adminOnly, toggleHospitalManagement);
router.get('/hospitals/:id/doctors', protect, adminOnly, getAdminHospitalDoctors);
router.post('/hospitals/:id/doctors', protect, adminOnly, adminAddDoctor);
router.post('/slots/generate', protect, adminOnly, adminBulkGenerateSlots);

// Hospital Subscription & 30-Day Payment Cycle Management
router.get('/subscriptions/summary', protect, adminOnly, getAdminSubscriptionSummary);
router.get('/subscriptions', protect, adminOnly, getAdminSubscriptionsList);
router.post('/hospitals/:id/payments', protect, adminOnly, adminRecordHospitalPayment);
router.get('/hospitals/:id/payments', protect, adminOnly, getAdminHospitalPayments);
router.put('/hospitals/:id/subscription', protect, adminOnly, adminUpdateHospitalSubscription);

// Product Management
router.get('/inventory', protect, adminOnly, getAdminProducts);
router.put('/inventory/:id/status', protect, adminOnly, updateProductStatus);
router.put('/inventory/:id/deal', protect, adminOnly, toggleDealStatus);  // NEW: Toggle deal status
router.put('/inventory/:id', protect, adminOnly, updateProduct); // NEW: Edit product details
router.delete('/inventory/:id', protect, adminOnly, deleteProduct);

// Voice Configuration Management
router.post('/voice-config', protect, adminOnly, createOrUpdateVoiceConfig);
router.get('/voice-config', protect, adminOnly, getVoiceConfigs);

// Central Financial Management
router.get('/financial/overview', protect, adminOnly, getAdminFinancialOverview);
router.get('/financial/hospital/:hospitalId', protect, adminOnly, getAdminHospitalFinancialReport);
router.put('/financial/hospital/:hospitalId/bank-details', protect, adminOnly, updateHospitalBankDetailsAdmin);
router.get('/financial/hospital/:hospitalId/settlement-calculate', protect, adminOnly, calculateHospitalSettlementForDateRange);
router.post('/financial/hospital/:hospitalId/send-settlement-request', protect, adminOnly, sendSettlementRequestToHospital);
router.get('/financial/transactions', protect, adminOnly, getAdminTransactionsLedger);
router.get('/financial/settlements', protect, adminOnly, getAdminSettlementManagement);
router.post('/financial/settlements/payout', protect, adminOnly, recordAdminSettlementPayout);
router.get('/financial/refunds', protect, adminOnly, getAdminRefunds);
router.post('/financial/refunds/process', protect, adminOnly, processAdminRefund);

export default router;
