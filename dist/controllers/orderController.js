"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.updateOrderStatus = exports.getOrderById = exports.getUserOrders = exports.createOrder = void 0;
const Order_1 = __importDefault(require("../models/Order"));
const Inventory_1 = __importDefault(require("../models/Inventory"));
const Coupon_1 = __importDefault(require("../models/Coupon"));
// @desc    Create new order
// @route   POST /api/orders
// @access  Private (user must be logged in)
const createOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { items, shippingAddress, totalAmount, paymentMethod, notes, shippingLocation, couponCode, discountAmount } = req.body;
        // Validate required fields
        if (!items || !shippingAddress || !totalAmount) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }
        // Verify user is authenticated
        if (!req.user) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        // Check stock availability for all items
        for (const item of items) {
            const product = yield Inventory_1.default.findById(item.productId);
            if (!product) {
                res.status(404).json({ message: `Product ${item.name} not found` });
                return;
            }
            if (product.stock < item.quantity) {
                res.status(400).json({ message: `Only ${product.stock} left in stock for ${item.name}` });
                return;
            }
        }
        // Calculate breakdown
        const medicineSubtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const platformFee = 10;
        const sellerCommission = Math.round(medicineSubtotal * 0.15);
        let calculatedTotal = medicineSubtotal + platformFee;
        // Apply coupon if present
        let finalDiscountAmount = 0;
        if (couponCode) {
            const coupon = yield Coupon_1.default.findOne({ code: couponCode.toUpperCase(), isActive: true });
            if (coupon && new Date() <= coupon.expiryDate && medicineSubtotal >= coupon.minOrderAmount) {
                if (coupon.discountType === 'percentage') {
                    finalDiscountAmount = (medicineSubtotal * coupon.discountValue) / 100;
                }
                else {
                    finalDiscountAmount = coupon.discountValue;
                }
                finalDiscountAmount = Math.min(finalDiscountAmount, medicineSubtotal);
                calculatedTotal -= finalDiscountAmount;
                // Increment usage count
                yield Coupon_1.default.findByIdAndUpdate(coupon._id, { $inc: { usageCount: 1 } });
            }
        }
        // Create order
        const order = yield Order_1.default.create({
            user: req.user._id,
            items: items.map((item) => ({
                product: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            shippingAddress,
            shippingLocation,
            medicineSubtotal,
            platformFee,
            sellerCommission,
            totalAmount: calculatedTotal,
            paymentMethod: paymentMethod || 'cod',
            paymentStatus: 'pending',
            orderStatus: 'pending',
            notes,
            couponCode: couponCode ? couponCode.toUpperCase() : undefined,
            discountAmount: finalDiscountAmount
        });
        // Update stock for each product
        for (const item of items) {
            yield Inventory_1.default.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } });
        }
        // 🚀 AUTOMATION: Send WhatsApp Bill
        try {
            const { sendWhatsAppBill } = yield Promise.resolve().then(() => __importStar(require('../services/whatsappService')));
            if (shippingAddress && shippingAddress.phone) {
                const customerName = req.user.name || shippingAddress.fullName;
                // Use Environment Variable for the Frontend URL instead of localhost
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                sendWhatsAppBill(shippingAddress.phone, customerName, order._id.toString().slice(-8).toUpperCase(), calculatedTotal, // Use the calculated total for the bill
                `${frontendUrl}/order-success/${order._id}`).catch((err) => console.error('WhatsApp Automation Failed:', err));
            }
        }
        catch (waError) {
            console.error('Failed to init WhatsApp service:', waError);
        }
        res.status(201).json(order);
    }
    catch (error) {
        console.error('Order creation error:', {
            message: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({ message: 'Error creating order', error: error.message });
    }
});
exports.createOrder = createOrder;
// @desc    Get user's orders
const getUserOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        const orders = yield Order_1.default.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .populate('items.product', 'name category');
        res.json(orders);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching orders', error });
    }
});
exports.getUserOrders = getUserOrders;
// @desc    Get single order by ID
const getOrderById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const order = yield Order_1.default.findById(req.params.id)
            .populate({
            path: 'items.product',
            select: 'name category seller',
            populate: {
                path: 'seller',
                select: 'name phone location'
            }
        })
            .populate('user', 'name email location')
            .populate('assignedDelivery', 'name phone location');
        if (!order) {
            res.status(404).json({ message: 'Order not found' });
            return;
        }
        if (!req.user || order.user._id.toString() !== req.user._id.toString()) {
            res.status(403).json({ message: 'Not authorized to view this order' });
            return;
        }
        res.json(order);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching order', error });
    }
});
exports.getOrderById = getOrderById;
// @desc    Update order status
const updateOrderStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const order = yield Order_1.default.findByIdAndUpdate(id, { orderStatus: status }, { new: true });
        if (!order) {
            res.status(404).json({ message: 'Order not found' });
            return;
        }
        res.json(order);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating order status', error });
    }
});
exports.updateOrderStatus = updateOrderStatus;
