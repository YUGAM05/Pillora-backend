import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { getJwtSecret } from '../config/env';

export interface AuthRequest extends Request {
    user?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    let token: string | undefined;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        const parts = req.headers.authorization.split(/\s+/);
        token = parts[1];
    }

    if (!token || token === 'null' || token === 'undefined') {
        console.error('[AuthMiddleware] No valid token provided');
        res.status(401).json({ message: 'Not authorized, no token' });
        return;
    }

    // Verify only with the configured secret. Hard-coded fallback secrets were
    // removed: anything in source code is public and lets anyone forge tokens.
    let decoded: any = null;
    let verifyError: any = null;
    try {
        decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    } catch (err: any) {
        verifyError = err;
    }

    if (!decoded) {
        console.error('[AuthMiddleware] Token verification failed:', verifyError?.message);
        res.status(401).json({
            message: 'Not authorized, token failed',
            details: verifyError?.name === 'TokenExpiredError' ? 'session_expired' : 'invalid_token',
        });
        return;
    }

    try {
        // Support both 'id' and 'userId' payloads
        const userId = decoded.id || decoded.userId;
        console.log(`[AuthMiddleware] Decoded: UserID=${userId}, Role=${decoded.role}`);

        if (!userId) {
            res.status(401).json({ message: 'Not authorized, malformed token payload' });
            return;
        }

        req.user = await User.findById(userId).select('-passwordHash');

        if (!req.user) {
            console.error(`[AuthMiddleware] User not found for ID: ${userId}`);
            res.status(401).json({ message: 'Not authorized, user not found' });
            return;
        }

        // Admin always passes status check
        if (req.user.role !== 'admin' && req.user.status !== 'approved') {
            res.status(403).json({ message: `Account ${req.user.status}. Please contact support.` });
            return;
        }

        // Password reset check
        if (req.user.isPasswordResetRequired && req.path !== '/change-password' && req.path !== '/logout') {
            res.status(403).json({
                message: 'Password reset required before continuing',
                code: 'PASSWORD_RESET_REQUIRED'
            });
            return;
        }

        next();
    } catch (error: any) {
        console.error('[AuthMiddleware] DB lookup error:', error.message);
        res.status(500).json({ message: 'Authentication error' });
    }
};


export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as admin' });
        return;
    }
};

export const sellerOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user && (req.user.role === 'seller' || req.user.role === 'admin')) {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as seller' });
        return;
    }
};

export const deliveryOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user && (req.user.role === 'delivery' || req.user.role === 'admin')) {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as delivery partner' });
        return;
    }
};

export const hospitalOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user && (req.user.role === 'hospital' || req.user.role === 'admin')) {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as hospital partner' });
        return;
    }
};
