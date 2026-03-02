"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const deliveryController_1 = require("../controllers/deliveryController");
const router = express_1.default.Router();
router.get('/dashboard', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_1.getDeliveryDashboard);
router.get('/available', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_1.getAvailableDeliveries);
router.get('/my-deliveries', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_1.getMyDeliveries);
router.put('/accept/:orderId', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_1.acceptDelivery);
router.put('/pickup/:orderId', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_1.confirmPickup);
router.put('/deliver/:orderId', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_1.confirmDelivery);
router.put('/status/:orderId', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_1.updateDeliveryStatus);
const deliveryController_2 = require("../controllers/deliveryController");
router.put('/location', authMiddleware_1.protect, authMiddleware_1.deliveryOnly, deliveryController_2.updateMyLocation);
exports.default = router;
