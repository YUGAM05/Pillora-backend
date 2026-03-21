import { Request, Response } from 'express';
import Order from '../models/Order';
import Prescription from '../models/Prescription';
import Medicine from '../models/Medicine';
import { AuthRequest } from '../middleware/authMiddleware';

export const createOrder = async (req: AuthRequest, res: Response) => {
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
        const order = await Order.create({
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
            await Prescription.findOneAndUpdate({ rx_id }, { is_used: true });
        }

        // 4. Reduce Medicine Stock
        for (const item of medicines) {
            await Medicine.findByIdAndUpdate(item.medicine_id, {
                $inc: { stock: -item.quantity }
            });
        }

        // 5. Emit Socket Event
        const io = req.app.get('io');
        if (io) {
            io.to(seller_id.toString()).emit('order_created', order);
        }

        res.status(201).json(order);
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

export const getUserOrders = async (req: AuthRequest, res: Response) => {
    try {
        const orders = await Order.find({ user_id: req.user._id })
            .populate('seller_id', 'name pharmacy_name')
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getOrderById = async (req: Request, res: Response) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user_id', 'name phone email')
            .populate('seller_id', 'name pharmacy_name address phone')
            .populate('delivery_agent_id', 'name phone');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.status(200).json(order);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sellerGetOrders = async (req: AuthRequest, res: Response) => {
    try {
        const orders = await Order.find({ seller_id: req.user._id })
            .populate('user_id', 'name phone')
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sellerUpdateOrderStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { status } = req.body;
        const allowedStatuses = ['confirmed_by_seller', 'out_for_pickup', 'cancelled'];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status for seller' });
        }

        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, seller_id: req.user._id },
            { status },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(order._id.toString()).emit('order_status_updated', order);
        }

        res.status(200).json(order);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deliveryGetAssignedOrders = async (req: AuthRequest, res: Response) => {
    try {
        const orders = await Order.find({ delivery_agent_id: req.user._id })
            .populate('user_id', 'name phone')
            .populate('seller_id', 'name pharmacy_name address phone');
        res.status(200).json(orders);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deliveryUpdateStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { status, delivery_location } = req.body;
        const allowedStatuses = ['out_for_pickup', 'in_transit', 'delivered'];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status for delivery agent' });
        }

        const updateData: any = { status };
        if (delivery_location) {
            updateData.delivery_location = delivery_location;
        }
        if (status === 'delivered') {
            updateData.estimated_delivery = new Date(); // Using this as actual delivery time for simplicity
        }

        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, delivery_agent_id: req.user._id },
            updateData,
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(order._id.toString()).emit('order_status_updated', order);
        }

        res.status(200).json(order);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const adminGetAllOrders = async (req: Request, res: Response) => {
    try {
        const orders = await Order.find()
            .populate('user_id', 'name')
            .populate('seller_id', 'name pharmacy_name')
            .populate('delivery_agent_id', 'name')
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const adminAssignDelivery = async (req: Request, res: Response) => {
    try {
        const { delivery_agent_id } = req.body;
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { delivery_agent_id, status: 'out_for_pickup' },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(delivery_agent_id.toString()).emit('order_assigned', order);
        }

        res.status(200).json(order);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};