import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import Hospital from '../models/Hospital';

export const isHospital = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.role === 'hospital') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Hospital role required.' });
    }
};

export const selfManagedOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const hospital = await Hospital.findOne({ user: req.user?._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        
        if (hospital.management_type !== 'SELF') {
            res.status(403).json({ 
                message: 'This hospital is managed by Pillora. You cannot modify records directly. Please contact admin to switch to Self-Managed mode.' 
            });
            return;
        }
        
        (req as any).hospital = hospital;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const attachHospital = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const hospital = await Hospital.findOne({ user: req.user?._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        (req as any).hospital = hospital;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
