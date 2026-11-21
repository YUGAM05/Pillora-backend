import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Session from '../models/Session';
import { getJwtSecret } from '../config/security';

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

        // Tokens issued before the last password change / "log out everywhere"
        // are no longer valid. iat is in seconds; allow 1s for clock rounding.
        const changedAt = req.user.tokensRevokedAt ? new Date(req.user.tokensRevokedAt).getTime() : 0;
        if (changedAt && typeof decoded.iat === 'number' && decoded.iat * 1000 < changedAt - 1000) {
            res.status(401).json({ message: 'Session expired, please log in again', details: 'session_expired' });
            return;
        }

        // Admin tokens are only valid while their admin Session (created after
        // MFA) is live, so logout / emergency lockdown actually end them.
        if (req.user.role === 'admin') {
            const session = decoded.sessionId ? await Session.findOne({ sessionId: decoded.sessionId }).lean() : null;
            if (!session || session.isRevoked || new Date() > new Date(session.expiresAt)
                || String(session.adminId) !== String(req.user._id)) {
                res.status(401).json({ message: 'Admin session is no longer valid, please log in again', details: 'session_expired' });
                return;
            }
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
