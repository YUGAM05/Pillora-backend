"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const hospitalMiddleware_1 = require("../middleware/hospitalMiddleware");
const settlementController_1 = require("../controllers/settlementController");
const router = express_1.default.Router();
// Admin Payout Routes
router.get('/admin/dashboard', authMiddleware_1.protect, authMiddleware_1.adminOnly, settlementController_1.getAdminSettlementsDashboard);
router.get('/admin/hospital/:hospitalId', authMiddleware_1.protect, authMiddleware_1.adminOnly, settlementController_1.getAdminHospitalSettlementDetails);
router.get('/admin/hospital/:hospitalId/bank-details', authMiddleware_1.protect, authMiddleware_1.adminOnly, settlementController_1.getHospitalBankDetails);
router.put('/admin/hospital/:hospitalId/bank-details', authMiddleware_1.protect, authMiddleware_1.adminOnly, settlementController_1.updateHospitalBankDetails);
router.post('/admin/transfer', authMiddleware_1.protect, authMiddleware_1.adminOnly, settlementController_1.initiateManualSettlement);
router.get('/admin/history', authMiddleware_1.protect, authMiddleware_1.adminOnly, settlementController_1.getAdminSettlementHistory);
router.get('/admin/analytics', authMiddleware_1.protect, authMiddleware_1.adminOnly, settlementController_1.getAdminSettlementAnalytics);
// Hospital Panel Finance Routes
router.get('/hospital/dashboard', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, settlementController_1.getHospitalSettlementsDashboard);
router.get('/hospital/expected', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, settlementController_1.getHospitalExpectedSettlement);
router.get('/hospital/history', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, settlementController_1.getHospitalSettlementHistory);
router.post('/hospital/confirm/:id', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, settlementController_1.confirmSettlementPayment);
router.post('/hospital/dispute/:id', authMiddleware_1.protect, hospitalMiddleware_1.isHospital, hospitalMiddleware_1.attachHospital, settlementController_1.disputeSettlementPayment);
exports.default = router;
