import express from 'express';
import { 
    getHospitalProfile, 
    generateSlots, 
    getHospitalAppointments,
    getDoctorSlots 
} from '../controllers/hospitalPanelController';
import { protect, hospitalOnly } from '../middleware/authMiddleware';

const router = express.Router();

router.use(protect);
router.use(hospitalOnly);

router.get('/profile', getHospitalProfile);
router.post('/slots/generate', generateSlots);
router.get('/slots/:doctorId', getDoctorSlots);
router.get('/appointments', getHospitalAppointments);

export default router;
