import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { isHospital, attachHospital, requireHospitalPermission } from '../middleware/hospitalMiddleware';
import {
    getAdminSettlementsDashboard,
    getAdminHospitalSettlementDetails,
    updateHospitalBankDetails,
    getHospitalBankDetails,
    initiateManualSettlement,
    getAdminSettlementHistory,
    getAdminSettlementAnalytics,
    getHospitalSettlementsDashboard,
    getHospitalExpectedSettlement,
    getHospitalSettlementHistory,
    confirmSettlementPayment,
    disputeSettlementPayment
} from '../controllers/settlementController';

const router = express.Router();

// Admin Payout Routes
router.get('/admin/dashboard', protect, adminOnly, getAdminSettlementsDashboard);
router.get('/admin/hospital/:hospitalId', protect, adminOnly, getAdminHospitalSettlementDetails);
router.get('/admin/hospital/:hospitalId/bank-details', protect, adminOnly, getHospitalBankDetails);
router.put('/admin/hospital/:hospitalId/bank-details', protect, adminOnly, updateHospitalBankDetails);
router.post('/admin/transfer', protect, adminOnly, initiateManualSettlement);
router.get('/admin/history', protect, adminOnly, getAdminSettlementHistory);
router.get('/admin/analytics', protect, adminOnly, getAdminSettlementAnalytics);

// Hospital Panel Finance Routes
router.get('/hospital/dashboard', protect, isHospital, attachHospital, requireHospitalPermission('settlements'), getHospitalSettlementsDashboard);
router.get('/hospital/expected', protect, isHospital, attachHospital, requireHospitalPermission('settlements'), getHospitalExpectedSettlement);
router.get('/hospital/history', protect, isHospital, attachHospital, requireHospitalPermission('settlements'), getHospitalSettlementHistory);
router.post('/hospital/confirm/:id', protect, isHospital, attachHospital, requireHospitalPermission('settlements'), confirmSettlementPayment);
router.post('/hospital/dispute/:id', protect, isHospital, attachHospital, requireHospitalPermission('settlements'), disputeSettlementPayment);

export default router;
