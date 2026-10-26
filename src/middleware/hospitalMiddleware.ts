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

import { computeSubscriptionStatus } from '../services/subscriptionService';

/**
 * Strict backend enforcement middleware:
 * Blocks creation, generation, addition, or bulk-generation of appointment slots
 * if the hospital's 30-day subscription is Pending Payment or Expired.
 */
export const requireActiveSubscription = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        let hospital = (req as any).hospital;
        if (!hospital && req.user?._id) {
            hospital = await Hospital.findOne({ user: req.user._id });
            (req as any).hospital = hospital;
        }

        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }

        const sub = computeSubscriptionStatus(hospital);

        if (!sub.isValid || !sub.canGenerateSlots) {
            res.status(403).json({
                code: 'SUBSCRIPTION_REQUIRED',
                status: sub.status,
                daysRemaining: sub.daysRemaining,
                message: 'Your Pillora subscription has expired or your payment is pending. Please contact the Pillora Admin to renew your subscription before generating new appointment slots.'
            });
            return;
        }

        (req as any).subscription = sub;
        next();
    } catch (error: any) {
        res.status(500).json({ message: 'Error verifying hospital subscription', error: error.message });
    }
};
