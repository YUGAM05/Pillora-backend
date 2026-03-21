import Notification from '../models/Notification';
import User from '../models/User';
import Order from '../models/Order';
import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import mongoose from 'mongoose';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const calculateEarning = (distance: number) => {
    // First 5 KM: ₹7 per KM
    // After 5 KM: ₹12 per KM
    if (distance <= 5) {
        return Math.round(distance * 7);
    } else {
        return Math.round((5 * 7) + ((distance - 5) * 12));
    }
};

export const getDeliveryDashboard = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?._id;
        console.log(`[getDeliveryDashboard] User ID: ${userId}`);

        const assignedCount = await Order.countDocuments({ delivery_agent_id: userId, status: { $ne: 'delivered' } });
        const completedOrders = await Order.find({ delivery_agent_id: userId, status: 'delivered' });

        const completedCount = completedOrders.length;
        const totalEarnings = completedOrders.reduce((sum, order) => sum + (order.deliveryEarning || 0), 0);

        res.json({
            stats: {
                currentDeliveries: assignedCount,
                completedDeliveries: completedCount,
                earnings: totalEarnings
            }
        });
    } catch (error) {
        console.error("[getDeliveryDashboard] Error:", error);
        res.status(500).json({ message: 'Error fetching delivery stats', error: (error as any).message });
    }
};

export const getAvailableDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        console.log(`[getAvailableDeliveries] Fetching available orders...`);
        const orders = await Order.find({
            status: { $in: ['confirmed', 'shipped'] },
            delivery_agent_id: { $exists: false }
        })
            .populate('user', 'name email phone location')
            .populate({
                path: 'items.product',
                populate: {
                    path: 'seller',
                    select: 'name email phone location address'
                }
            });

        console.log(`[getAvailableDeliveries] Found ${orders.length} orders.`);

        // Add estimated distance and earnings to each available order
        const enhancedOrders = orders.map(order => {
            try {
                const orderObj = order.toObject();
                const sellerLoc = (order.items[0]?.product as any)?.seller?.location;
                const userLoc = order.shippingLocation || (order.user as any)?.location;

                if (sellerLoc && userLoc) {
                    const distance = calculateDistance(sellerLoc.lat, sellerLoc.lng, userLoc.lat, userLoc.lng);
                    (orderObj as any).estimatedDistance = isNaN(distance) ? "0.00" : distance.toFixed(2);
                    (orderObj as any).estimatedEarning = isNaN(distance) ? 0 : calculateEarning(distance);
                }
                return orderObj;
            } catch (mapErr) {
                console.error("[getAvailableDeliveries] Mapping error for order:", order._id, mapErr);
                return order.toObject();
            }
        });

        res.json(enhancedOrders);
    } catch (error) {
        console.error("[getAvailableDeliveries] Error:", error);
        res.status(500).json({ message: 'Error fetching available deliveries', error: (error as any).message });
    }
};

export const getMyDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?._id;
        console.log(`[getMyDeliveries] Fetching deliveries for user: ${userId}`);
        const orders = await Order.find({ delivery_agent_id: userId })
            .populate('user', 'name email phone location')
            .populate({
                path: 'items.product',
                populate: {
                    path: 'seller',
                    select: 'name email phone location address'
                }
            });
        res.json(orders);
    } catch (error) {
        console.error("[getMyDeliveries] Error:", error);
        res.status(500).json({ message: 'Error fetching your deliveries', error: (error as any).message });
    }
};

export const acceptDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { orderId } = req.params;
        const userId = req.user?._id || req.user?.id;

        console.log(`[acceptDelivery] Start - Order: ${orderId}, User: ${userId}`);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.warn(`[acceptDelivery] Invalid Order ID: ${orderId}`);
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }

        const order = await Order.findById(orderId)
            .populate('user', 'location')
            .populate({
                path: 'items.product',
                populate: {
                    path: 'seller',
                    select: 'location'
                }
            });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.assignedDelivery) {
            return res.status(400).json({ message: 'Order already assigned' });
        }

        // Calculate and fix the earning at the time of acceptance
        const sellerLoc = (order.items[0]?.product as any)?.seller?.location;
        const userLoc = order.shippingLocation || (order.user as any)?.location;

        if (sellerLoc && userLoc) {
            const distance = calculateDistance(sellerLoc.lat, sellerLoc.lng, userLoc.lat, userLoc.lng);
            if (!isNaN(distance)) {
                const deliveryFee = calculateEarning(distance);
                const adminCommission = Math.round(deliveryFee * 0.10);
                const partnerEarning = deliveryFee - adminCommission;

                order.deliveryDistance = parseFloat(distance.toFixed(2));
                order.deliveryFee = deliveryFee;
                order.adminDeliveryCommission = adminCommission;
                order.deliveryEarning = partnerEarning;

                // Ensure totalAmount correctly reflects all components
                order.totalAmount = (order.medicineSubtotal || 0) + (order.platformFee || 10) + deliveryFee;
            }
        }

        order.assignedDelivery = userId;
        order.orderStatus = 'out_for_pickup';
        await order.save();

        console.log(`[acceptDelivery] Success - Order: ${orderId} assigned to ${userId}`);
        res.json({ message: 'Delivery accepted', order });
    } catch (error) {
        console.error("[acceptDelivery] FATAL Error:", error);
        res.status(500).json({ message: 'Error accepting delivery', error: (error as any).message, stack: (error as any).stack });
    }
};

export const confirmPickup = async (req: AuthRequest, res: Response) => {
    try {
        const { orderId } = req.params;
        const userId = req.user?._id || req.user?.id;
        console.log(`[ConfirmPickup] Attempt - Order: ${orderId}, User: ${userId}`);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }

        const order = await Order.findOne({ _id: orderId, delivery_agent_id: userId });

        if (!order) {
            console.warn(`[ConfirmPickup] Not found or not assigned. Order: ${orderId}, User: ${userId}`);
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        order.orderStatus = 'picked_up';
        await order.save();
        console.log(`[ConfirmPickup] Success - Order: ${orderId}`);

        res.json({ message: 'Order picked up from seller', order });
    } catch (error) {
        console.error("[ConfirmPickup] FATAL Error:", error);
        res.status(500).json({ message: 'Error confirming pickup', error: (error as any).message, stack: (error as any).stack });
    }
};

export const confirmDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { orderId } = req.params;
        const userId = req.user?._id || req.user?.id;
        console.log(`[ConfirmDelivery] Attempt - Order: ${orderId}, User: ${userId}`);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }

        const order = await Order.findOne({ _id: orderId, delivery_agent_id: userId });

        if (!order) {
            console.warn(`[ConfirmDelivery] Not found or not assigned. Order: ${orderId}, User: ${userId}`);
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        order.status = 'delivered';
        order.payment_status = 'paid'; // Assume paid on delivery if COD
        await order.save();
        console.log(`[ConfirmDelivery] Success - Order: ${orderId}`);

        res.json({ message: 'Order delivered successfully', order });
    } catch (error) {
        console.error("[ConfirmDelivery] FATAL Error:", error);
        res.status(500).json({ message: 'Error confirming delivery', error: (error as any).message, stack: (error as any).stack });
    }
};

export const updateDeliveryStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const userId = req.user?._id || req.user?.id;

        console.log(`[UpdateStatus] Attempt - Order: ${orderId}, Status: ${status}, User: ${userId}`);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }

        const order = await Order.findOne({ _id: orderId, delivery_agent_id: userId });

        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        if (status) order.orderStatus = status;
        await order.save();

        res.json({ message: 'Order status updated', order });
    } catch (error) {
        console.error("[UpdateStatus] FATAL Error:", error);
        res.status(500).json({ message: 'Error updating status', error: (error as any).message, stack: (error as any).stack });
    }
};

export const updateMyLocation = async (req: AuthRequest, res: Response) => {
    try {
        const { lat, lng } = req.body;
        const userId = req.user?._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.location = { lat, lng };
        await user.save();

        res.json({ message: 'Location updated successfully', location: user.location });
    } catch (error) {
        console.error("[UpdateMyLocation] Error:", error);
        res.status(500).json({ message: 'Error updating location', error: (error as any).message });
    }
};
