import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

export interface AuthRequest extends Request {
    user?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const secret = process.env.JWT_SECRET;
            
            if (!secret) {
                console.error('[AuthMiddleware] ERROR: JWT_SECRET is not defined in environment variables!');
            }

            // Fallback for development if secret is missing
            const secretToUse = secret || 'defaultSecret';
            
            if (token === 'null' || token === 'undefined' || !token) {
                console.error('[AuthMiddleware] Rejected: Token is literal "null", "undefined" or empty');
                res.status(401).json({ message: 'Not authorized, invalid token format' });
                return;
            }

            const decoded: any = jwt.verify(token, secretToUse);

            // Fetch user from DB to check status
            // Support both 'id' (new standard) and 'userId' (legacy) token payloads
            const userId = decoded.id || decoded.userId;
            
            if (!userId) {
                console.error('[AuthMiddleware] Decoded token missing id/userId');
                res.status(401).json({ message: 'Not authorized, malformed token payload' });
                return;
            }

            req.user = await User.findById(userId).select('-passwordHash');

            if (!req.user) {
                console.error(`[AuthMiddleware] User not found for ID: ${userId}`);
                res.status(401).json({ message: 'Not authorized, user not found' });
                return;
            }

            // Check if user is approved
            if (req.user.status !== 'approved' && req.user.role !== 'admin') {
                res.status(403).json({ message: `Account ${req.user.status}. Please contact support.` });
                return;
            }

            // Check if seller is approved
            if (req.user.role === 'seller' && req.user.status !== 'approved') {
                res.status(403).json({ message: 'Seller account pending approval' });
                return;
            }

            // Check for password reset requirement
            if (req.user.isPasswordResetRequired && req.path !== '/change-password' && req.path !== '/logout') {
                res.status(403).json({ 
                    message: 'Password reset required before continuing', 
                    code: 'PASSWORD_RESET_REQUIRED' 
                });
                return;
            }

            next();
        } catch (error: any) {
            console.error('[AuthMiddleware] Token Verification Failed:', error.name, '-', error.message);
            console.error('[AuthMiddleware] Token being verified (start):', token?.substring(0, 15) + '...');
            console.error('[AuthMiddleware] JWT_SECRET present in process.env:', !!process.env.JWT_SECRET);
            
            res.status(401).json({ 
                message: 'Not authorized, token failed',
                details: error.name === 'TokenExpiredError' ? 'session_expired' : 'invalid_token',
                error: error.message
            });
            return;
        }

    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
        return;
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
