import express from 'express';
import {
    registerUser, loginUser, sendOtp, verifyOtp,
    setupMfa, verifyMfa, setupAdmin,
    refreshToken, validateSession, logoutAdmin, emergencyLockdown,
    changePassword
} from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';
import passport from '../config/passport';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { requireAdminAuth } from '../middleware/requireAdminAuth';

// ─── Rate Limiter for login endpoint ────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Increased from 5 — hospital staff may attempt login multiple times
    standardHeaders: true,
    legacyHeaders: false,
    // IMPORTANT: Custom handler ensures CORS headers are always present on 429
    // Without this, the browser sees a CORS error instead of the rate limit error.
    handler: (req: express.Request, res: express.Response) => {
        const origin = req.headers.origin;
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(429).json({
            message: 'Too many login attempts from this IP, please try again after 15 minutes'
        });
    },
});

const router = express.Router();

// ── Explicit OPTIONS preflight handler for all auth routes ───────────────────
// Belt-and-suspenders: handles any preflight that reaches the router layer.
router.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;
        if (origin === 'https://pillora-admin.vercel.app' || origin === 'https://www.pillora-admin.vercel.app') {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        return res.status(200).end();
    }
    next();
});

// CORS middleware specifically for login route
const loginCors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.headers.origin;
    if (origin === 'https://pillora-admin.vercel.app' || origin === 'https://www.pillora-admin.vercel.app') {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'https://pillora-admin.vercel.app');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
};

// Handle OPTIONS and POST for /login explicitly with login CORS middleware
router.options('/login', loginCors);

// ── Public routes ────────────────────────────────────────────────────────────
router.post('/register', registerUser);
router.post('/login', loginCors, loginLimiter, loginUser);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// ── MFA routes (semi-public — user ID required but no full auth) ─────────────
router.post('/setup-mfa', setupMfa);
router.post('/verify-mfa', verifyMfa);

// ── Session management ───────────────────────────────────────────────────────
router.post('/refresh', refreshToken);
router.get('/validate', validateSession);
router.post('/logout', logoutAdmin);

// ── Protected admin-only routes ──────────────────────────────────────────────
router.post('/emergency-lockdown', requireAdminAuth, emergencyLockdown);

// ── Setup (remove in production) ─────────────────────────────────────────────
router.get('/setup-admin', setupAdmin);
router.post('/change-password', protect, changePassword);

// ─────────────────────────────────────────────
// Google OAuth – User Panel
// ─────────────────────────────────────────────
router.get('/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false
    })
);

router.get('/google/callback',
    passport.authenticate('google', {
        session: false,
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`
    }),
    (req, res) => {
        try {
            const user = req.user as any;

            if (!user) {
                return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_user`);
            }

            const token = jwt.sign(
                { id: user._id.toString(), role: user.role },
                process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024',

                { expiresIn: '30d' }
            );

            const userData = {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePicture: user.profilePicture,
                role: user.role,
                status: user.status,
                phone: user.phone,
                address: user.address,
                location: user.location,
            };

            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const redirectUrl = `${frontendUrl}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}`;

            res.redirect(redirectUrl);
        } catch (error) {
            console.error('Error in user callback:', error);
            res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
        }
    }
);

// ─────────────────────────────────────────────
// Google OAuth – Seller Panel
// ─────────────────────────────────────────────
router.get('/google/seller',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        state: 'seller'
    })
);

router.get('/google/seller/callback',
    passport.authenticate('google', {
        session: false,
        failureRedirect: `${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=auth_failed`
    }),
    (async (req, res) => {
        try {
            const user = req.user as any;

            if (!user) {
                return res.redirect(`${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=no_user`);
            }

            if (user.role !== 'seller' && user.role !== 'admin') {
                user.role = 'seller';
                await user.save();
            }

            const token = jwt.sign(
                { id: user._id.toString(), role: user.role },
                process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024',

                { expiresIn: '30d' }
            );

            const userData = {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePicture: user.profilePicture,
                role: user.role,
                status: user.status,
                phone: user.phone,
                address: user.address,
                location: user.location,
            };

            const sellerUrl = process.env.SELLER_PANEL_URL || 'http://localhost:3003';
            const redirectUrl = `${sellerUrl}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}`;

            res.redirect(redirectUrl);
        } catch (error) {
            console.error('Error in seller callback:', error);
            res.redirect(`${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=server_error`);
        }
    })
);

// ─────────────────────────────────────────────
// Google OAuth – Delivery Panel
// ─────────────────────────────────────────────
router.get('/google/delivery',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        state: 'delivery'
    })
);

router.get('/google/delivery/callback',
    passport.authenticate('google', {
        session: false,
        failureRedirect: `${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=auth_failed`
    }),
    (async (req, res) => {
        try {
            const user = req.user as any;

            if (!user) {
                return res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=no_user`);
            }

            if (user.role !== 'delivery' && user.role !== 'admin') {
                user.role = 'delivery';
                await user.save();
            }

            const token = jwt.sign(
                { id: user._id.toString(), role: user.role },
                process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024',

                { expiresIn: '30d' }
            );

            const userData = {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePicture: user.profilePicture,
                role: user.role,
                status: user.status,
                phone: user.phone,
                address: user.address,
                location: user.location,
            };

            const deliveryUrl = process.env.DELIVERY_PANEL_URL || 'http://localhost:3002';
            const redirectUrl = `${deliveryUrl}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}`;

            res.redirect(redirectUrl);
        } catch (error) {
            console.error('Error in delivery callback:', error);
            res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=server_error`);
        }
    })
);

export default router;