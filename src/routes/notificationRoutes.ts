import express, { Request, Response } from 'express';
import { protect } from '../middleware/authMiddleware';
import { isHospital, attachHospital } from '../middleware/hospitalMiddleware';
import Notification from '../models/Notification';
import PushSubscription from '../models/PushSubscription';

const router = express.Router();

// @desc    Get all notifications for logged in user
// @route   GET /api/notifications
// @access  Private
router.get('/', protect, async (req: any, res: Response) => {
    try {
        const notifications = await Notification.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
router.put('/:id/read', protect, async (req: any, res: Response) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { read: true },
            { new: true }
        );
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Error updating notification' });
    }
});

// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
// @access  Private
router.put('/read-all', protect, async (req: any, res: Response) => {
    try {
        await Notification.updateMany(
            { user: req.user.id, read: false },
            { read: true }
        );
        res.json({ message: 'All marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating notifications' });
    }
});

// @desc    Subscribe to push notifications
// @route   POST /api/notifications/subscribe
// @access  Private/Hospital
router.post('/subscribe', protect, isHospital, attachHospital, async (req: any, res: Response) => {
    try {
        const { subscription, hospitalId } = req.body;
        const targetHospitalId = hospitalId || req.hospital?._id;

        if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
            res.status(400).json({ message: 'Missing push subscription payload or keys' });
            return;
        }

        if (!targetHospitalId) {
            res.status(400).json({ message: 'Hospital context is required' });
            return;
        }

        // Verify that the logged in hospital user is authorized for this hospital ID
        if (req.hospital?._id.toString() !== targetHospitalId.toString() && req.user.role !== 'admin') {
            res.status(403).json({ message: 'Unauthorized hospital operation' });
            return;
        }

        // Upsert the subscription using the endpoint as search criteria
        const updatedSubscription = await PushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            {
                hospitalId: targetHospitalId,
                subscription: {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.keys.p256dh,
                        auth: subscription.keys.auth
                    }
                }
            },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, data: updatedSubscription });
    } catch (error: any) {
        console.error('[PushSubscribeError]', error.message);
        res.status(500).json({ message: 'Failed to subscribe to push notifications', error: error.message });
    }
});

export default router;
