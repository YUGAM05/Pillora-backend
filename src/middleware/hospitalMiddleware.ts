import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import {
    resolveHospitalAccess, permissionsForRole, hasHospitalPermission,
    HospitalPermission, PERMISSION_LABELS
} from '../utils/hospitalAccess';

export const isHospital = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.role === 'hospital') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Hospital role required.' });
    }
};

/**
 * Resolves the hospital for the logged-in hospital user (owner or staff) and
 * sets req.hospital, req.staffRole and req.hospitalPermissions.
 * Deactivated staff get 403.
 */
export const attachHospital = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const access = await resolveHospitalAccess(req.user);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }
        (req as any).hospital = access.hospital;
        (req as any).staffRole = access.staffRole;
        (req as any).hospitalPermissions = permissionsForRole(access.staffRole);
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Kept for existing route definitions; same resolution as attachHospital.
export const selfManagedOnly = attachHospital;

/**
 * Server-side permission check for hospital routes. Use after attachHospital.
 * Passing several permissions allows the request when the role has any of them.
 */
export const requireHospitalPermission = (...perms: HospitalPermission[]) =>
    (req: AuthRequest, res: Response, next: NextFunction) => {
        const role = (req as any).staffRole as string | undefined;
        if (!role) {
            res.status(403).json({ message: 'Hospital access could not be verified' });
            return;
        }
        if (perms.some(p => hasHospitalPermission(role, p))) {
            next();
            return;
        }
        res.status(403).json({
            message: `Your role (${role}) does not have access to ${PERMISSION_LABELS[perms[0]]}`,
            code: 'ROLE_FORBIDDEN',
            staffRole: role,
        });
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
            const access = await resolveHospitalAccess(req.user);
            if (!access.ok) {
                res.status(access.status).json({ message: access.message });
                return;
            }
            hospital = access.hospital;
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
