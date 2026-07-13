import express from 'express';
import { getSystemStats, getAdminTrends, getPlatformActivities, getLoginAnalytics, getRevenueAnalytics } from '../controllers/adminController';
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
    getVoiceConfigs
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

// Product Management
router.get('/inventory', protect, adminOnly, getAdminProducts);
router.put('/inventory/:id/status', protect, adminOnly, updateProductStatus);
router.put('/inventory/:id/deal', protect, adminOnly, toggleDealStatus);  // NEW: Toggle deal status
router.put('/inventory/:id', protect, adminOnly, updateProduct); // NEW: Edit product details
router.delete('/inventory/:id', protect, adminOnly, deleteProduct);

// Voice Configuration Management
router.post('/voice-config', protect, adminOnly, createOrUpdateVoiceConfig);
router.get('/voice-config', protect, adminOnly, getVoiceConfigs);

export default router;
