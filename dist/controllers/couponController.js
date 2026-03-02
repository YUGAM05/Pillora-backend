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
exports.validateCoupon = exports.deleteCoupon = exports.updateCoupon = exports.getAllCoupons = exports.createCoupon = void 0;
const Coupon_1 = __importDefault(require("../models/Coupon"));
// Admin: Create Coupon
const createCoupon = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { code, discountType, discountValue, minOrderAmount, expiryDate, usageLimit } = req.body;
        const existingCoupon = yield Coupon_1.default.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }
        const coupon = new Coupon_1.default({
            code: code.toUpperCase(),
            discountType,
            discountValue,
            minOrderAmount,
            expiryDate,
            usageLimit
        });
        yield coupon.save();
        res.status(201).json(coupon);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.createCoupon = createCoupon;
// Admin: Get All Coupons
const getAllCoupons = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const coupons = yield Coupon_1.default.find().sort({ createdAt: -1 });
        res.status(200).json(coupons);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getAllCoupons = getAllCoupons;
// Admin: Update Coupon
const updateCoupon = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const coupon = yield Coupon_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!coupon)
            return res.status(404).json({ message: 'Coupon not found' });
        res.status(200).json(coupon);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateCoupon = updateCoupon;
// Admin: Delete Coupon
const deleteCoupon = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const coupon = yield Coupon_1.default.findByIdAndDelete(req.params.id);
        if (!coupon)
            return res.status(404).json({ message: 'Coupon not found' });
        res.status(200).json({ message: 'Coupon deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteCoupon = deleteCoupon;
// User: Validate Coupon
const validateCoupon = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { code, orderAmount } = req.body;
        const coupon = yield Coupon_1.default.findOne({ code: code.toUpperCase(), isActive: true });
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
        }
        else {
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.validateCoupon = validateCoupon;
