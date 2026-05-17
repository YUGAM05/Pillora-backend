"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const hospitalPanelController_1 = require("../controllers/hospitalPanelController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
router.use(authMiddleware_1.hospitalOnly);
router.get('/profile', hospitalPanelController_1.getHospitalProfile);
router.post('/slots/generate', hospitalPanelController_1.generateSlots);
router.get('/slots/:doctorId', hospitalPanelController_1.getDoctorSlots);
router.get('/appointments', hospitalPanelController_1.getHospitalAppointments);
exports.default = router;
