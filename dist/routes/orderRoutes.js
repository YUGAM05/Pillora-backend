"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const roleMiddleware_1 = require("../middleware/roleMiddleware");
const orderController_1 = require("../controllers/orderController");
const router = (0, express_1.Router)();
router.post('/', authMiddleware_1.protect, orderController_1.createOrder);
router.get('/my', authMiddleware_1.protect, orderController_1.getUserOrders);
router.get('/:id', authMiddleware_1.protect, orderController_1.getOrderById);
// Seller routes
router.get('/seller', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('seller'), orderController_1.sellerGetOrders);
router.put('/seller/:id/status', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('seller'), orderController_1.sellerUpdateOrderStatus);
// Delivery routes
router.get('/delivery', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('delivery'), orderController_1.deliveryGetAssignedOrders);
router.put('/delivery/:id/status', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('delivery'), orderController_1.deliveryUpdateStatus);
// Admin routes
router.get('/admin', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('admin'), orderController_1.adminGetAllOrders);
router.put('/admin/:id/assign-delivery', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('admin'), orderController_1.adminAssignDelivery);
exports.default = router;
