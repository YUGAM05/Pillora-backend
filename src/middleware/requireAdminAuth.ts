import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Session from '../models/Session';
import AuditLog from '../models/AuditLog';

/**
 * Express middleware: Verify JWT + check session in database.
 * Applied to all admin-only API routes.
 */
export const requireAdminAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // 1. Extract token from Authorization header
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        // 2. Verify JWT signature and decode
        let decoded: any;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024');

        } catch (err: any) {
            if (err.name === 'TokenExpiredError') {
                res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
                return;
            }
            res.status(401).json({ message: 'Invalid token' });
            return;
        }

        // 3. Check admin role
        if (decoded.role !== 'admin') {
            res.status(403).json({ message: 'Admin access required' });
            return;
        }

        // 4. If JWT contains a sessionId, verify it in the database
        if (decoded.sessionId) {
            const session = await Session.findOne({ sessionId: decoded.sessionId });

            if (!session) {
                res.status(401).json({ message: 'Session not found' });
                return;
            }

            if (session.isRevoked) {
                res.status(401).json({ message: 'Session has been revoked', code: 'SESSION_REVOKED' });
                return;
            }

            if (new Date() > session.expiresAt) {
                res.status(401).json({ message: 'Session expired', code: 'SESSION_EXPIRED' });
                return;
            }
        }

        // 5. Attach user info to request
        (req as any).adminUser = decoded;
        next();
    } catch (error: any) {
        console.error('[requireAdminAuth] Error:', error.message);
        res.status(500).json({ message: 'Authentication error' });
    }
};
