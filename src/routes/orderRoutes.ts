import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import {
    createOrder,
    getUserOrders,
    getOrderById,
    sellerGetOrders,
    sellerUpdateOrderStatus,
    deliveryGetAssignedOrders,
    deliveryUpdateStatus,
    adminGetAllOrders,
    adminAssignDelivery
} from '../controllers/orderController';

const router = Router();

router.post('/', protect, createOrder);
router.get('/my', protect, getUserOrders);

// Seller routes — MUST be before /:id
router.get('/seller', protect, authorize('seller'), sellerGetOrders);
router.put('/seller/:id/status', protect, authorize('seller'), sellerUpdateOrderStatus);

// Delivery routes — MUST be before /:id
router.get('/delivery', protect, authorize('delivery'), deliveryGetAssignedOrders);
router.put('/delivery/:id/status', protect, authorize('delivery'), deliveryUpdateStatus);

// Admin routes — MUST be before /:id
router.get('/admin', protect, authorize('admin'), adminGetAllOrders);
router.put('/admin/:id/assign-delivery', protect, authorize('admin'), adminAssignDelivery);

// Generic /:id route — MUST come last to avoid swallowing named paths above
router.get('/:id', protect, getOrderById);

export default router;
