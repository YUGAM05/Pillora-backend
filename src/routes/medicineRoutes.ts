import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import multer from 'multer';
import {
    sellerAddMedicine,
    sellerGetMyMedicines,
    sellerUpdateMedicine,
    sellerDeleteMedicine,
    adminGetAllMedicines,
    adminApproveMedicine,
    getApprovedMedicines,
    searchMedicinesByNames
} from '../controllers/medicineController';

const router = Router();

// ✅ Fixed: memoryStorage instead of dest: 'uploads/'
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', protect, authorize('seller'), upload.single('image'), sellerAddMedicine);
router.get('/my', protect, authorize('seller'), sellerGetMyMedicines);
router.put('/:id', protect, authorize('seller'), sellerUpdateMedicine);
router.delete('/:id', protect, authorize('seller'), sellerDeleteMedicine);

// Public routes
router.get('/approved', getApprovedMedicines);
router.post('/search', searchMedicinesByNames);

// Admin routes
router.get('/', protect, authorize('admin'), adminGetAllMedicines);
router.put('/:id/approve', protect, authorize('admin'), adminApproveMedicine);

export default router;