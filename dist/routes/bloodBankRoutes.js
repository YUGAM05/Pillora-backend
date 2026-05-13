"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const bloodBankController_1 = require("../controllers/bloodBankController");
const bloodBankExportController_1 = require("../controllers/bloodBankExportController");
const bloodBankImportController_1 = require("../controllers/bloodBankImportController");
const bloodBankTemplateController_1 = require("../controllers/bloodBankTemplateController");
const router = express_1.default.Router();
// Configure multer for file uploads
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.post('/donors', authMiddleware_1.protect, bloodBankController_1.registerDonor);
router.get('/donors', bloodBankController_1.findDonors);
router.get('/matches', bloodBankController_1.findMatches);
router.get('/admin/donors', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankController_1.getAllDonors);
router.delete('/admin/donors/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankController_1.deleteDonor);
router.post('/requests', authMiddleware_1.protect, bloodBankController_1.createRequest);
router.get('/requests', bloodBankController_1.getRequests);
router.get('/my-requests', authMiddleware_1.protect, bloodBankController_1.getMyRequests);
router.get('/my-donor', authMiddleware_1.protect, bloodBankController_1.getMyDonorProfile);
router.get('/admin/requests', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankController_1.getAllRequestsAdmin);
router.patch('/admin/requests/:id/status', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankController_1.updateRequestStatus);
router.patch('/admin/requests/:id/kyc', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankController_1.updateKycStatus);
router.post('/admin/requests/:id/verify-ai', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankController_1.verifyRequestWithAI);
// Export routes
router.get('/admin/export/donors/excel', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankExportController_1.exportDonorsToExcel);
router.get('/admin/export/requests/excel', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankExportController_1.exportRequestsToExcel);
router.get('/admin/export/donors/pdf', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankExportController_1.exportDonorsToPDF);
router.get('/admin/export/requests/pdf', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankExportController_1.exportRequestsToPDF);
// Import routes
router.post('/admin/import/donors', authMiddleware_1.protect, authMiddleware_1.adminOnly, upload.single('file'), bloodBankImportController_1.importDonorsFromExcel);
router.get('/admin/import/donors/template', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankTemplateController_1.downloadDonorTemplate);
router.get('/admin/donors/stats', authMiddleware_1.protect, authMiddleware_1.adminOnly, bloodBankImportController_1.getDonorStats);
exports.default = router;
