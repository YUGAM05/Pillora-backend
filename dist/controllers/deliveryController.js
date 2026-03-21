"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMyLocation = exports.updateDeliveryStatus = exports.confirmDelivery = exports.confirmPickup = exports.acceptDelivery = exports.getMyDeliveries = exports.getAvailableDeliveries = exports.getDeliveryDashboard = void 0;
const User_1 = __importDefault(require("../models/User"));
const Order_1 = __importDefault(require("../models/Order"));
const mongoose_1 = __importDefault(require("mongoose"));
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};
const calculateEarning = (distance) => {
    // First 5 KM: ₹7 per KM
    // After 5 KM: ₹12 per KM
    if (distance <= 5) {
        return Math.round(distance * 7);
    }
    else {
        return Math.round((5 * 7) + ((distance - 5) * 12));
    }
};
const getDeliveryDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        console.log(`[getDeliveryDashboard] User ID: ${userId}`);
        const assignedCount = yield Order_1.default.countDocuments({ delivery_agent_id: userId, status: { $ne: 'delivered' } });
        const completedOrders = yield Order_1.default.find({ delivery_agent_id: userId, status: 'delivered' });
        const completedCount = completedOrders.length;
        const totalEarnings = completedOrders.reduce((sum, order) => sum + (order.deliveryEarning || 0), 0);
        res.json({
            stats: {
                currentDeliveries: assignedCount,
                completedDeliveries: completedCount,
                earnings: totalEarnings
            }
        });
    }
    catch (error) {
        console.error("[getDeliveryDashboard] Error:", error);
        res.status(500).json({ message: 'Error fetching delivery stats', error: error.message });
    }
});
exports.getDeliveryDashboard = getDeliveryDashboard;
const getAvailableDeliveries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`[getAvailableDeliveries] Fetching available orders...`);
        const orders = yield Order_1.default.find({
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
            var _a, _b, _c, _d;
            try {
                const orderObj = order.toObject();
                const sellerLoc = (_c = (_b = (_a = order.items[0]) === null || _a === void 0 ? void 0 : _a.product) === null || _b === void 0 ? void 0 : _b.seller) === null || _c === void 0 ? void 0 : _c.location;
                const userLoc = order.shippingLocation || ((_d = order.user) === null || _d === void 0 ? void 0 : _d.location);
                if (sellerLoc && userLoc) {
                    const distance = calculateDistance(sellerLoc.lat, sellerLoc.lng, userLoc.lat, userLoc.lng);
                    orderObj.estimatedDistance = isNaN(distance) ? "0.00" : distance.toFixed(2);
                    orderObj.estimatedEarning = isNaN(distance) ? 0 : calculateEarning(distance);
                }
                return orderObj;
            }
            catch (mapErr) {
                console.error("[getAvailableDeliveries] Mapping error for order:", order._id, mapErr);
                return order.toObject();
            }
        });
        res.json(enhancedOrders);
    }
    catch (error) {
        console.error("[getAvailableDeliveries] Error:", error);
        res.status(500).json({ message: 'Error fetching available deliveries', error: error.message });
    }
});
exports.getAvailableDeliveries = getAvailableDeliveries;
const getMyDeliveries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        console.log(`[getMyDeliveries] Fetching deliveries for user: ${userId}`);
        const orders = yield Order_1.default.find({ delivery_agent_id: userId })
            .populate('user', 'name email phone location')
            .populate({
            path: 'items.product',
            populate: {
                path: 'seller',
                select: 'name email phone location address'
            }
        });
        res.json(orders);
    }
    catch (error) {
        console.error("[getMyDeliveries] Error:", error);
        res.status(500).json({ message: 'Error fetching your deliveries', error: error.message });
    }
});
exports.getMyDeliveries = getMyDeliveries;
const acceptDelivery = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const { orderId } = req.params;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        console.log(`[acceptDelivery] Start - Order: ${orderId}, User: ${userId}`);
        if (!mongoose_1.default.Types.ObjectId.isValid(orderId)) {
            console.warn(`[acceptDelivery] Invalid Order ID: ${orderId}`);
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }
        const order = yield Order_1.default.findById(orderId)
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
        const sellerLoc = (_e = (_d = (_c = order.items[0]) === null || _c === void 0 ? void 0 : _c.product) === null || _d === void 0 ? void 0 : _d.seller) === null || _e === void 0 ? void 0 : _e.location;
        const userLoc = order.shippingLocation || ((_f = order.user) === null || _f === void 0 ? void 0 : _f.location);
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
        yield order.save();
        console.log(`[acceptDelivery] Success - Order: ${orderId} assigned to ${userId}`);
        res.json({ message: 'Delivery accepted', order });
    }
    catch (error) {
        console.error("[acceptDelivery] FATAL Error:", error);
        res.status(500).json({ message: 'Error accepting delivery', error: error.message, stack: error.stack });
    }
});
exports.acceptDelivery = acceptDelivery;
const confirmPickup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { orderId } = req.params;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        console.log(`[ConfirmPickup] Attempt - Order: ${orderId}, User: ${userId}`);
        if (!mongoose_1.default.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }
        const order = yield Order_1.default.findOne({ _id: orderId, delivery_agent_id: userId });
        if (!order) {
            console.warn(`[ConfirmPickup] Not found or not assigned. Order: ${orderId}, User: ${userId}`);
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }
        order.orderStatus = 'picked_up';
        yield order.save();
        console.log(`[ConfirmPickup] Success - Order: ${orderId}`);
        res.json({ message: 'Order picked up from seller', order });
    }
    catch (error) {
        console.error("[ConfirmPickup] FATAL Error:", error);
        res.status(500).json({ message: 'Error confirming pickup', error: error.message, stack: error.stack });
    }
});
exports.confirmPickup = confirmPickup;
const confirmDelivery = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { orderId } = req.params;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        console.log(`[ConfirmDelivery] Attempt - Order: ${orderId}, User: ${userId}`);
        if (!mongoose_1.default.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }
        const order = yield Order_1.default.findOne({ _id: orderId, delivery_agent_id: userId });
        if (!order) {
            console.warn(`[ConfirmDelivery] Not found or not assigned. Order: ${orderId}, User: ${userId}`);
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }
        order.status = 'delivered';
        order.payment_status = 'paid'; // Assume paid on delivery if COD
        yield order.save();
        console.log(`[ConfirmDelivery] Success - Order: ${orderId}`);
        res.json({ message: 'Order delivered successfully', order });
    }
    catch (error) {
        console.error("[ConfirmDelivery] FATAL Error:", error);
        res.status(500).json({ message: 'Error confirming delivery', error: error.message, stack: error.stack });
    }
});
exports.confirmDelivery = confirmDelivery;
const updateDeliveryStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        console.log(`[UpdateStatus] Attempt - Order: ${orderId}, Status: ${status}, User: ${userId}`);
        if (!mongoose_1.default.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }
        const order = yield Order_1.default.findOne({ _id: orderId, delivery_agent_id: userId });
        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }
        if (status)
            order.orderStatus = status;
        yield order.save();
        res.json({ message: 'Order status updated', order });
    }
    catch (error) {
        console.error("[UpdateStatus] FATAL Error:", error);
        res.status(500).json({ message: 'Error updating status', error: error.message, stack: error.stack });
    }
});
exports.updateDeliveryStatus = updateDeliveryStatus;
const updateMyLocation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { lat, lng } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        const user = yield User_1.default.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.location = { lat, lng };
        yield user.save();
        res.json({ message: 'Location updated successfully', location: user.location });
    }
    catch (error) {
        console.error("[UpdateMyLocation] Error:", error);
        res.status(500).json({ message: 'Error updating location', error: error.message });
    }
});
exports.updateMyLocation = updateMyLocation;
