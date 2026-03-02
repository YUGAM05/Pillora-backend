"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const sellerController_1 = require("../controllers/sellerController");
const router = express_1.default.Router();
// Product Routes
router.get('/dashboard', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_1.getSellerDashboard);
router.get('/inventory', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_1.getSellerInventory);
router.post('/inventory', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_1.addSellerProduct);
router.put('/inventory/:id', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_1.updateSellerProduct);
router.delete('/inventory/:id', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_1.deleteSellerProduct);
// Order Routes
const sellerController_2 = require("../controllers/sellerController");
router.get('/orders', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_2.getSellerOrders);
router.put('/orders/:id/status', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_2.updateOrderStatus);
router.put('/profile', authMiddleware_1.protect, authMiddleware_1.sellerOnly, sellerController_2.updateSellerProfile);
exports.default = router;
