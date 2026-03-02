"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const hospitalController_1 = require("../controllers/hospitalController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const multer_1 = __importDefault(require("multer"));
const router = express_1.default.Router();
router.get('/', hospitalController_1.getHospitals);
router.get('/search', hospitalController_1.searchHospitals);
router.get('/:id', hospitalController_1.getHospitalById);
router.post('/seed', hospitalController_1.seedHospitals);
router.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, hospitalController_1.createHospital);
router.put('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, hospitalController_1.updateHospital);
router.delete('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, hospitalController_1.deleteHospital);
// FIX: Replaced diskStorage (breaks on Vercel — no persistent disk) with
// memoryStorage so files are held in RAM and passed to the controller.
// Your uploadHospitalImages controller should read from req.files (Buffer)
// and upload to a cloud storage service like Cloudinary or S3.
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.post('/upload-images', authMiddleware_1.protect, authMiddleware_1.adminOnly, upload.array('images', 10), hospitalController_1.uploadHospitalImages);
exports.default = router;
