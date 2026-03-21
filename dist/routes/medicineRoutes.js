"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const roleMiddleware_1 = require("../middleware/roleMiddleware");
const multer_1 = __importDefault(require("multer"));
const medicineController_1 = require("../controllers/medicineController");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ dest: 'uploads/' });
router.post('/', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('seller'), upload.single('image'), medicineController_1.sellerAddMedicine);
router.get('/my', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('seller'), medicineController_1.sellerGetMyMedicines);
router.put('/:id', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('seller'), medicineController_1.sellerUpdateMedicine);
router.delete('/:id', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('seller'), medicineController_1.sellerDeleteMedicine);
// Public routes
router.get('/approved', medicineController_1.getApprovedMedicines);
router.post('/search', medicineController_1.searchMedicinesByNames);
// Admin routes
router.get('/', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('admin'), medicineController_1.adminGetAllMedicines);
router.put('/:id/approve', authMiddleware_1.protect, (0, roleMiddleware_1.authorize)('admin'), medicineController_1.adminApproveMedicine);
exports.default = router;
