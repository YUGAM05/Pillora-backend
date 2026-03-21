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
exports.adminAssignDelivery = exports.adminGetAllOrders = exports.deliveryUpdateStatus = exports.deliveryGetAssignedOrders = exports.sellerUpdateOrderStatus = exports.sellerGetOrders = exports.getOrderById = exports.getUserOrders = exports.createOrder = void 0;
const Order_1 = __importDefault(require("../models/Order"));
const Prescription_1 = __importDefault(require("../models/Prescription"));
const Medicine_1 = __importDefault(require("../models/Medicine"));
const createOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user_id = req.user._id;
        const { rx_id, seller_id, medicines, delivery_address } = req.body;
        // 1. Calculate totals
        let subtotal = 0;
        for (const item of medicines) {
            subtotal += item.price * item.quantity;
        }
        const platform_fee = 10;
        const seller_commission = Math.round(subtotal * 0.15);
        const total_amount = subtotal + platform_fee; // simplified
        // 2. Create Order
        const order = yield Order_1.default.create({
            user_id,
            rx_id,
            seller_id,
            medicines,
            total_amount,
            delivery_address,
            status: 'order_placed',
            payment_status: 'pending',
            platform_fee,
            seller_commission
        });
        // 3. Update Prescription if provided
        if (rx_id) {
            yield Prescription_1.default.findOneAndUpdate({ rx_id }, { is_used: true });
        }
        // 4. Reduce Medicine Stock
        for (const item of medicines) {
            yield Medicine_1.default.findByIdAndUpdate(item.medicine_id, {
                $inc: { stock: -item.quantity }
            });
        }
        // 5. Emit Socket Event
        const io = req.app.get('io');
        if (io) {
            io.to(seller_id.toString()).emit('order_created', order);
        }
        res.status(201).json(order);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});
exports.createOrder = createOrder;
const getUserOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield Order_1.default.find({ user_id: req.user._id })
            .populate('seller_id', 'name pharmacy_name')
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getUserOrders = getUserOrders;
const getOrderById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const order = yield Order_1.default.findById(req.params.id)
            .populate('user_id', 'name phone email')
            .populate('seller_id', 'name pharmacy_name address phone')
            .populate('delivery_agent_id', 'name phone');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.status(200).json(order);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getOrderById = getOrderById;
const sellerGetOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield Order_1.default.find({ seller_id: req.user._id })
            .populate('user_id', 'name phone')
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.sellerGetOrders = sellerGetOrders;
const sellerUpdateOrderStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status } = req.body;
        const allowedStatuses = ['confirmed_by_seller', 'out_for_pickup', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status for seller' });
        }
        const order = yield Order_1.default.findOneAndUpdate({ _id: req.params.id, seller_id: req.user._id }, { status }, { new: true });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const io = req.app.get('io');
        if (io) {
            io.to(order._id.toString()).emit('order_status_updated', order);
        }
        res.status(200).json(order);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.sellerUpdateOrderStatus = sellerUpdateOrderStatus;
const deliveryGetAssignedOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield Order_1.default.find({ delivery_agent_id: req.user._id })
            .populate('user_id', 'name phone')
            .populate('seller_id', 'name pharmacy_name address phone');
        res.status(200).json(orders);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deliveryGetAssignedOrders = deliveryGetAssignedOrders;
const deliveryUpdateStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, delivery_location } = req.body;
        const allowedStatuses = ['out_for_pickup', 'in_transit', 'delivered'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status for delivery agent' });
        }
        const updateData = { status };
        if (delivery_location) {
            updateData.delivery_location = delivery_location;
        }
        if (status === 'delivered') {
            updateData.estimated_delivery = new Date(); // Using this as actual delivery time for simplicity
        }
        const order = yield Order_1.default.findOneAndUpdate({ _id: req.params.id, delivery_agent_id: req.user._id }, updateData, { new: true });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const io = req.app.get('io');
        if (io) {
            io.to(order._id.toString()).emit('order_status_updated', order);
        }
        res.status(200).json(order);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deliveryUpdateStatus = deliveryUpdateStatus;
const adminGetAllOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield Order_1.default.find()
            .populate('user_id', 'name')
            .populate('seller_id', 'name pharmacy_name')
            .populate('delivery_agent_id', 'name')
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.adminGetAllOrders = adminGetAllOrders;
const adminAssignDelivery = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { delivery_agent_id } = req.body;
        const order = yield Order_1.default.findByIdAndUpdate(req.params.id, { delivery_agent_id, status: 'out_for_pickup' }, { new: true });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const io = req.app.get('io');
        if (io) {
            io.to(delivery_agent_id.toString()).emit('order_assigned', order);
        }
        res.status(200).json(order);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.adminAssignDelivery = adminAssignDelivery;
