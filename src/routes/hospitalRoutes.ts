import express from 'express';
import { getHospitals, getHospitalById, seedHospitals, createHospital, updateHospital, deleteHospital, uploadHospitalImages, searchHospitals, getCities, getHospitalSettlements } from '../controllers/hospitalController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import multer from 'multer';

const router = express.Router();

router.get('/', getHospitals);
router.get('/cities', getCities);
router.get('/search', searchHospitals);
router.get('/:hospitalId/settlements', protect, getHospitalSettlements);
router.get('/:id', getHospitalById);
router.post('/seed', seedHospitals);
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