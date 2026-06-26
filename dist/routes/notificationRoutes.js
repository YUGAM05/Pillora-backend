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
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const hospitalMiddleware_1 = require("../middleware/hospitalMiddleware");
const Notification_1 = __importDefault(require("../models/Notification"));
const PushSubscription_1 = __importDefault(require("../models/PushSubscription"));
const router = express_1.default.Router();
// @desc    Get all notifications for logged in user
// @route   GET /api/notifications
// @access  Private
router.get('/', authMiddleware_1.protect, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const notifications = yield Notification_1.default.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(notifications);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
}));
// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
router.put('/:id/read', authMiddleware_1.protect, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const notification = yield Notification_1.default.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { read: true }, { new: true });
        res.json(notification);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating notification' });
    }
}));
// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
// @access  Private
router.put('/read-all', authMiddleware_1.protect, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield Notification_1.default.updateMany({ user: req.user.id, read: false }, { read: true });
        res.json({ message: 'All marked as read' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating notifications' });
    }
}));
// @desc    Subscribe to push notifications
// @route   POST /api/notifications/subscribe
// @access  Private/Hospital
router.post('/subscribe', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { subscription, hospitalId } = req.body;
        const targetHospitalId = hospitalId || ((_a = req.hospital) === null || _a === void 0 ? void 0 : _a._id);
        if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
            res.status(400).json({ message: 'Missing push subscription payload or keys' });
            return;
        }
        if (!targetHospitalId) {
            res.status(400).json({ message: 'Hospital context is required' });
            return;
        }
        // Verify that the logged in hospital user is authorized for this hospital ID
        if (((_b = req.hospital) === null || _b === void 0 ? void 0 : _b._id.toString()) !== targetHospitalId.toString() && req.user.role !== 'admin') {
            res.status(403).json({ message: 'Unauthorized hospital operation' });
            return;
        }
        // Upsert the subscription using the endpoint as search criteria
        const updatedSubscription = yield PushSubscription_1.default.findOneAndUpdate({ 'subscription.endpoint': subscription.endpoint }, {
            hospitalId: targetHospitalId,
            subscription: {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth
                }
            }
        }, { upsert: true, new: true });
        res.status(200).json({ success: true, data: updatedSubscription });
    }
    catch (error) {
        console.error('[PushSubscribeError]', error.message);
        res.status(500).json({ message: 'Failed to subscribe to push notifications', error: error.message });
    }
}));
exports.default = router;
