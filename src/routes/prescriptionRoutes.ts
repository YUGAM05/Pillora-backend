import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import multer from 'multer';
import {
    uploadPrescription,
    getUserPrescriptions,
    getPrescriptionById,
    adminGetAllPrescriptions,
    adminVerifyPrescription
} from '../controllers/prescriptionController';

const router = Router();

// ✅ Fixed: memoryStorage instead of dest: 'uploads/'
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', protect, upload.single('prescription'), uploadPrescription);
router.get('/my', protect, getUserPrescriptions);
router.get('/:id', protect, getPrescriptionById);

// Admin routes
router.get('/', protect, authorize('admin'), adminGetAllPrescriptions);
router.put('/:id/verify', protect, authorize('admin'), adminVerifyPrescription);

export default router;