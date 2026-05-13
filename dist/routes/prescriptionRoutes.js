"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const roleMiddleware_1 = require("../middleware/roleMiddleware");
const multer_1 = __importDefault(require("multer"));
const prescriptionController_1 = require("../controllers/prescriptionController");
const router = (0, express_1.Router)();
// ✅ Fixed: memoryStorage instead of dest: 'uploads/'
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.post('/', authMiddleware_1.protect, upload.single('prescription'), prescriptionController_1.uploadPrescription);
router.get('/my', authMiddleware_1.protect, prescriptionController_1.getUserPrescriptions);
router.get('/:id', authMiddleware_1.protect, prescriptionController_1.getPrescriptionById);
// Admin routes
router.get('/', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('admin'), prescriptionController_1.adminGetAllPrescriptions);
router.put('/:id/verify', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('admin'), prescriptionController_1.adminVerifyPrescription);
exports.default = router;
