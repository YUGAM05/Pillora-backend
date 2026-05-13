import express from 'express';
import { getSystemStats, getAdminTrends } from '../controllers/adminController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = express.Router();

// Protect stats route with Admin check
router.get('/stats', protect, adminOnly, getSystemStats);
router.get('/trends', protect, adminOnly, getAdminTrends); // NEW: Trend data for graphs

// User Management
import { getUsers, updateUserStatus, getAdminProducts, updateProductStatus, deleteProduct, toggleDealStatus, getUserOrders, updateProduct, getAllOrders, verifyUserAadhaar, registerHospital, getAdminHospitals, toggleHospitalManagement } from '../controllers/adminController';
router.get('/users', protect, adminOnly, getUsers);
router.put('/users/:id/status', protect, adminOnly, updateUserStatus);
router.post('/users/:id/verify-aadhaar', protect, adminOnly, verifyUserAadhaar);
router.get('/users/:id/orders', protect, adminOnly, getUserOrders);
router.get('/orders', protect, adminOnly, getAllOrders); // NEW: Get all system orders

// Hospital Management
router.post('/hospitals/register', protect, adminOnly, registerHospital);
router.get('/hospitals', protect, adminOnly, getAdminHospitals);
router.put('/hospitals/:id/management', protect, adminOnly, toggleHospitalManagement);

// Product Management
router.get('/inventory', protect, adminOnly, getAdminProducts);
router.put('/inventory/:id/status', protect, adminOnly, updateProductStatus);
router.put('/inventory/:id/deal', protect, adminOnly, toggleDealStatus);  // NEW: Toggle deal status
router.put('/inventory/:id', protect, adminOnly, updateProduct); // NEW: Edit product details
router.delete('/inventory/:id', protect, adminOnly, deleteProduct);

export default router;
