"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const orderController_1 = require("../controllers/orderController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// All routes require authentication
router.post('/', authMiddleware_1.protect, orderController_1.createOrder);
router.get('/', authMiddleware_1.protect, orderController_1.getUserOrders);
router.get('/:id', authMiddleware_1.protect, orderController_1.getOrderById);
router.put('/:id/status', authMiddleware_1.protect, orderController_1.updateOrderStatus);
exports.default = router;
