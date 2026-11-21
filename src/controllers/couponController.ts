import { Request, Response } from 'express';
import Coupon from '../models/Coupon';

// Admin: Create Coupon
export const createCoupon = async (req: Request, res: Response) => {
    try {
        const { code, discountType, discountValue, minOrderAmount, expiryDate, usageLimit } = req.body;

        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }

        const coupon = new Coupon({
            code: code.toUpperCase(),
            discountType,
            discountValue,
            minOrderAmount,
            expiryDate,
            usageLimit
        });

        await coupon.save();
        res.status(201).json(coupon);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Admin: Get All Coupons
export const getAllCoupons = async (req: Request, res: Response) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.status(200).json(coupons);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Admin: Update Coupon
export const updateCoupon = async (req: Request, res: Response) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
        res.status(200).json(coupon);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Admin: Delete Coupon
export const deleteCoupon = async (req: Request, res: Response) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
        res.status(200).json({ message: 'Coupon deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// User: Validate Coupon
export const validateCoupon = async (req: Request, res: Response) => {
    try {
        const { code } = req.body;
        const orderAmount = Number(req.body.orderAmount);
        if (typeof code !== 'string' || !code.trim() || !Number.isFinite(orderAmount) || orderAmount < 0) {
            return res.status(400).json({ message: 'Coupon code and order amount are required' });
        }
        const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true });

        if (!coupon) {
            return res.status(404).json({ message: 'Invalid coupon code' });
        }

        if (new Date() > coupon.expiryDate) {
            return res.status(400).json({ message: 'Coupon has expired' });
        }

        if (orderAmount < coupon.minOrderAmount) {
            return res.status(400).json({ message: `Minimum order amount of ₹${coupon.minOrderAmount} required` });
        }

        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            return res.status(400).json({ message: 'Coupon usage limit reached' });
        }

        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = (orderAmount * coupon.discountValue) / 100;
        } else {
            discountAmount = coupon.discountValue;
        }

        // Ensure discount doesn't exceed order amount
        discountAmount = Math.min(discountAmount, orderAmount);

        res.status(200).json({
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountAmount
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
