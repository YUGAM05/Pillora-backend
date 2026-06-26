"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const appointmentController_1 = require("../controllers/appointmentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.post('/create', appointmentController_1.createAppointment);
router.post('/hold', authMiddleware_1.protect, appointmentController_1.holdAppointment);
router.post('/:appointmentId/cancel', authMiddleware_1.protect, appointmentController_1.cancelAppointment);
router.get('/:appointmentId', appointmentController_1.getAppointmentDetails);
exports.default = router;
