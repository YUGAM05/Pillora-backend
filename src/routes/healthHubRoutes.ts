import express from 'express';
import { createHealthTip, getAllHealthTips, deleteHealthTip, getHealthTipById, updateHealthTip } from '../controllers/healthHubController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', getAllHealthTips);
router.get('/:id', getHealthTipById);

// Admin-only protected routes
router.post('/', protect, adminOnly, createHealthTip);
router.put('/:id', protect, adminOnly, updateHealthTip);
router.delete('/:id', protect, adminOnly, deleteHealthTip);

export default router;
