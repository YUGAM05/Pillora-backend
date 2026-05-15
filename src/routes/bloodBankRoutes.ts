import express from 'express';
import multer from 'multer';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { registerDonor, findDonors, createRequest, getRequests, getAllDonors, getAllRequestsAdmin, updateRequestStatus, findMatches, deleteDonor, deleteRequest, getMyRequests, getMyDonorProfile, verifyRequestWithAI, updateKycStatus } from '../controllers/bloodBankController';
import { exportDonorsToExcel, exportRequestsToExcel, exportDonorsToPDF, exportRequestsToPDF } from '../controllers/bloodBankExportController';
import { importDonorsFromExcel, getDonorStats } from '../controllers/bloodBankImportController';
import { downloadDonorTemplate } from '../controllers/bloodBankTemplateController';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

router.post('/donors', protect, registerDonor);
router.get('/donors', findDonors);
router.get('/matches', findMatches);
router.get('/admin/donors', protect, adminOnly, getAllDonors);
router.delete('/admin/donors/:id', protect, adminOnly, deleteDonor);

router.post('/requests', protect, createRequest);
router.get('/requests', getRequests);
router.get('/my-requests', protect, getMyRequests);
router.get('/my-donor', protect, getMyDonorProfile);
router.get('/admin/requests', protect, adminOnly, getAllRequestsAdmin);
router.delete('/admin/requests/:id', protect, adminOnly, deleteRequest);
router.patch('/admin/requests/:id/status', protect, adminOnly, updateRequestStatus);
router.patch('/admin/requests/:id/kyc', protect, adminOnly, updateKycStatus);
router.post('/admin/requests/:id/verify-ai', protect, adminOnly, verifyRequestWithAI);


// Export routes
router.get('/admin/export/donors/excel', protect, adminOnly, exportDonorsToExcel);
router.get('/admin/export/requests/excel', protect, adminOnly, exportRequestsToExcel);
router.get('/admin/export/donors/pdf', protect, adminOnly, exportDonorsToPDF);
router.get('/admin/export/requests/pdf', protect, adminOnly, exportRequestsToPDF);

// Import routes
router.post('/admin/import/donors', protect, adminOnly, upload.single('file'), importDonorsFromExcel as any);
router.get('/admin/import/donors/template', protect, adminOnly, downloadDonorTemplate);
router.get('/admin/donors/stats', protect, adminOnly, getDonorStats);

export default router;
