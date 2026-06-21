"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const healthHubController_1 = require("../controllers/healthHubController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', healthHubController_1.getAllHealthTips);
router.get('/:id', healthHubController_1.getHealthTipById);
// Admin-only protected routes
router.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, healthHubController_1.createHealthTip);
router.put('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, healthHubController_1.updateHealthTip);
router.delete('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, healthHubController_1.deleteHealthTip);
exports.default = router;
