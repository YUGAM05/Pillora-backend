import express from 'express';
import { getHospitals, getHospitalById, createHospital, updateHospital, deleteHospital, uploadHospitalImages, searchHospitals, getCities, getHospitalSettlements } from '../controllers/hospitalController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import multer from 'multer';

const router = express.Router();

router.get('/', getHospitals);
router.get('/cities', getCities);
router.get('/search', searchHospitals);
// Admin or the owning hospital account only (checked in the controller)
router.get('/:hospitalId/settlements', protect, getHospitalSettlements);
router.get('/:id', getHospitalById);
// POST /seed removed (audit B-07): it was public and deleted every hospital and doctor.
// Local seeding: src/scripts/seedHospitalsRunner.ts (refuses to run in production).
router.post('/', protect, adminOnly, createHospital);
router.put('/:id', protect, adminOnly, updateHospital);
router.delete('/:id', protect, adminOnly, deleteHospital);

// FIX: Replaced diskStorage (breaks on Vercel — no persistent disk) with
// memoryStorage so files are held in RAM and passed to the controller.
// Your uploadHospitalImages controller should read from req.files (Buffer)
// and upload to a cloud storage service like Cloudinary or S3.
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-images', protect, adminOnly, upload.array('images', 10), uploadHospitalImages);

export default router;