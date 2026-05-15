"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const adminController_1 = require("../controllers/adminController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Protect stats route with Admin check
router.get('/stats', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_1.getSystemStats);
router.get('/trends', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_1.getAdminTrends); // NEW: Trend data for graphs
// User Management
const adminController_2 = require("../controllers/adminController");
router.get('/users', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.getUsers);
router.put('/users/:id/status', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.updateUserStatus);
router.post('/users/:id/verify-aadhaar', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.verifyUserAadhaar);
router.get('/users/:id/orders', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.getUserOrders);
router.get('/orders', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.getAllOrders); // NEW: Get all system orders
// Hospital Management
router.post('/hospitals/register', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.registerHospital);
router.get('/hospitals', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.getAdminHospitals);
router.put('/hospitals/:id/management', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.toggleHospitalManagement);
router.get('/hospitals/:id/doctors', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.getAdminHospitalDoctors);
router.post('/hospitals/:id/doctors', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.adminAddDoctor);
router.post('/slots/generate', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.adminBulkGenerateSlots);
// Product Management
router.get('/inventory', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.getAdminProducts);
router.put('/inventory/:id/status', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.updateProductStatus);
router.put('/inventory/:id/deal', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.toggleDealStatus); // NEW: Toggle deal status
router.put('/inventory/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.updateProduct); // NEW: Edit product details
router.delete('/inventory/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, adminController_2.deleteProduct);
exports.default = router;
