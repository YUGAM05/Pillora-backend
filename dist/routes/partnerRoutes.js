"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const partnerController_1 = require("../controllers/partnerController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Public route for submitting requests
router.post('/submit', partnerController_1.submitPartnerRequest);
// Admin routes
router.get('/all', authMiddleware_1.protect, authMiddleware_1.adminOnly, partnerController_1.getPartnerRequests);
router.patch('/:id/status', authMiddleware_1.protect, authMiddleware_1.adminOnly, partnerController_1.updatePartnerRequestStatus);
exports.default = router;
