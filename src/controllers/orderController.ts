import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order';
import Prescription from '../models/Prescription';
import Medicine from '../models/Medicine';
import { AuthRequest } from '../middleware/authMiddleware';

export const createOrder = async (req: AuthRequest, res: Response) => {
    try {
        const user_id = req.user._id;
        const { rx_id, seller_id, medicines, delivery_address } = req.body;

        // ── 1. Validate input shape ─────────────────────────────────────────
        // Prices, names and stock are NEVER taken from the client.
        if (!Array.isArray(medicines) || medicines.length === 0 || medicines.length > 50) {
            return res.status(400).json({ message: 'Your order must contain between 1 and 50 items.' });
        }
        if (!seller_id || !mongoose.isValidObjectId(seller_id)) {
            return res.status(400).json({ message: 'A valid seller is required.' });
        }
        const requested = new Map<string, number>();
        for (const item of medicines) {
            const qty = Number(item?.quantity);
            if (!item?.medicine_id || !mongoose.isValidObjectId(item.medicine_id) || !Number.isInteger(qty) || qty < 1 || qty > 100) {
                return res.status(400).json({ message: 'Each item needs a valid medicine and a quantity between 1 and 100.' });
            }
            const id = String(item.medicine_id);
            requested.set(id, (requested.get(id) || 0) + qty);
        }

        // ── 2. Load medicines from the DB (source of truth for price) ───────
        const dbMeds = await Medicine.find({ _id: { $in: [...requested.keys()] } });
        if (dbMeds.length !== requested.size) {
            return res.status(400).json({ message: 'One or more medicines no longer exist.' });
        }
        for (const med of dbMeds) {
            if (med.admin_approved !== 'approved') {
                return res.status(400).json({ message: `${med.name} is not available for sale.` });
            }
            if (String(med.seller_id) !== String(seller_id)) {
                return res.status(400).json({ message: `${med.name} is not sold by this seller.` });
            }
        }

        // ── 3. Prescription check for Rx-only medicines ─────────────────────
        const needsRx = dbMeds.some((m) => m.requires_prescription);
        let prescriptionClaimed = false;
        if (needsRx) {
            if (!rx_id || typeof rx_id !== 'string') {
                return res.status(400).json({ message: 'A valid prescription is required for one or more items.' });
            }
            // Atomically claim the prescription: must belong to this user, be approved, unused and not expired
            const now = new Date();
            const rx = await Prescription.findOneAndUpdate(
                {
                    rx_id,
                    user_id,
                    admin_status: 'approved',
                    is_used: { $ne: true },
                    $or: [{ valid_until: { $exists: false } }, { valid_until: null }, { valid_until: { $gte: now } }],
                },
                { is_used: true },
                { new: true }
            );
            if (!rx) {
                return res.status(400).json({ message: 'Prescription is invalid, not yet approved, expired or already used.' });
            }
            prescriptionClaimed = true;
        }

        // ── 4. Atomically reserve stock (never goes below zero) ─────────────
        const reserved: Array<{ id: string; qty: number }> = [];
        const releaseStock = async () => {
            for (const r of reserved) {
                await Medicine.updateOne({ _id: r.id }, { $inc: { stock: r.qty } });
            }
            if (prescriptionClaimed) await Prescription.updateOne({ rx_id, user_id }, { is_used: false });
        };
        for (const [id, qty] of requested) {
            const ok = await Medicine.findOneAndUpdate(
                { _id: id, stock: { $gte: qty } },
                { $inc: { stock: -qty } }
            );
            if (!ok) {
                await releaseStock();
                const name = dbMeds.find((m) => String(m._id) === id)?.name || 'An item';
                return res.status(409).json({ message: `${name} does not have enough stock.` });
            }
            reserved.push({ id, qty });
        }

        // ── 5. Totals from server-side prices (in paise to avoid float drift) ──
        const items = dbMeds.map((m) => ({
            medicine_id: m._id,
            name: m.name,
            quantity: requested.get(String(m._id))!,
            price: m.price,
        }));
        const subtotalPaise = items.reduce((sum, i) => sum + Math.round(i.price * 100) * i.quantity, 0);
        const subtotal = subtotalPaise / 100;

        const platform_fee = 10;
        const seller_commission = Math.round(subtotal * 0.15);
        const total_amount = (subtotalPaise + platform_fee * 100) / 100;

        // ── 6. Create Order ─────────────────────────────────────────────────
        let order;
        try {
            order = await Order.create({
                user_id,
                rx_id: needsRx ? rx_id : undefined,
                seller_id,
                medicines: items,
                total_amount,
                delivery_address,
                status: 'order_placed',
                payment_status: 'pending',
                platform_fee,
                seller_commission
            });
        } catch (createErr) {
            await releaseStock();
            throw createErr;
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