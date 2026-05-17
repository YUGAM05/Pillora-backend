"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const analyticsController_1 = require("../controllers/analyticsController");
// Assuming there's a protect and admin middleware
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Public endpoint for tracking
router.post('/collect', analyticsController_1.trackEvent);
// Protected endpoint for admin dashboard
router.get('/view', authMiddleware_1.protect, authMiddleware_1.adminOnly, analyticsController_1.getAnalyticsStats);
exports.default = router;
