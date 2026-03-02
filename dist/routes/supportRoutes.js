"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supportController_1 = require("../controllers/supportController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// User routes
router.post('/', authMiddleware_1.protect, supportController_1.createTicket);
router.get('/my-tickets', authMiddleware_1.protect, supportController_1.getMyTickets);
// Admin routes
router.get('/admin/all', authMiddleware_1.protect, authMiddleware_1.adminOnly, supportController_1.getAllTickets);
router.patch('/admin/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, supportController_1.updateTicketStatus);
exports.default = router;
