"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const couponController_1 = require("../controllers/couponController");
const router = express_1.default.Router();
// Admin routes
router.post('/admin', couponController_1.createCoupon);
router.get('/admin', couponController_1.getAllCoupons);
router.put('/admin/:id', couponController_1.updateCoupon);
router.delete('/admin/:id', couponController_1.deleteCoupon);
// User routes
router.post('/validate', couponController_1.validateCoupon);
exports.default = router;
