import express from 'express';
import {
    registerUser, loginUser, sendOtp, verifyOtp,
    sendPhoneOtp, verifyPhoneOtp,
    setupMfa, verifyMfa,
    refreshToken, validateSession, logoutAdmin, emergencyLockdown,
    changePassword, forgotPassword, verifyResetToken, resetPassword
} from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';
import passport from '../config/passport';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireAdminAuth } from '../middleware/requireAdminAuth';
import LoginHistory from '../models/LoginHistory';
import { getJwtSecret, applyCorsHeaders } from '../config/security';

// ─── Rate limiters for OTP / MFA / register (brute-force protection) ────────
const simpleLimiter = (max: number, message: string) => rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: express.Request, res: express.Response) => {
        applyCorsHeaders(req.headers.origin, res);
        res.status(429).json({ message });
    },
});
const otpLimiter = simpleLimiter(10, 'Too many OTP attempts. Please try again in 15 minutes.');
const mfaLimiter = simpleLimiter(10, 'Too many authenticator attempts. Please try again in 15 minutes.');
const registerLimiter = simpleLimiter(10, 'Too many sign-up attempts. Please try again later.');

// ─── Rate Limiter for login endpoint ────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Increased from 5 — hospital staff may attempt login multiple times
    standardHeaders: true,
    legacyHeaders: false,
    // IMPORTANT: Custom handler ensures CORS headers are always present on 429
    // Without this, the browser sees a CORS error instead of the rate limit error.
    handler: (req: express.Request, res: express.Response) => {
        applyCorsHeaders(req.headers.origin, res);
        res.status(429).json({
            message: 'Too many login attempts from this IP, please try again after 15 minutes'
        });
    },
});

// Rate limiters for forgot-password
const forgotPasswordIpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    // ipKeyGenerator groups IPv6 addresses by /56 so a client can't dodge the limit by rotating addresses.
    keyGenerator: (req) => ipKeyGenerator(req.ip || 'unknown-ip'),
    handler: (req: express.Request, res: express.Response) => {
        applyCorsHeaders(req.headers.origin, res);
        res.status(429).json({
            message: 'Too many requests from this IP. Please try again after an hour.'
        });
    }
});

const forgotPasswordEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.body.email || '').toString().trim().toLowerCase(),
    handler: (req: express.Request, res: express.Response) => {
        applyCorsHeaders(req.headers.origin, res);
        res.status(429).json({
            message: 'Too many password reset requests for this email. Please try again after an hour.'
        });
    }
});

const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: express.Request, res: express.Response) => {
        applyCorsHeaders(req.headers.origin, res);
        res.status(429).json({
            message: 'Too many reset attempts. Please try again after 15 minutes.'
        });
    }
});

const router = express.Router();

// ── OPTIONS preflight for auth routes: allowlisted origins only ─────────────
router.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        applyCorsHeaders(req.headers.origin, res);
        return res.status(204).end();
    }
    next();
});

// CORS for the login route (same allowlist as app.ts)
const loginCors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    applyCorsHeaders(req.headers.origin, res);
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
};

// Handle OPTIONS and POST for /login explicitly with login CORS middleware
router.options('/login', loginCors);

// ── Public routes ────────────────────────────────────────────────────────────
router.post('/register', registerLimiter, registerUser);
router.post('/login', loginCors, loginLimiter, loginUser);
router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/phone/send-otp', otpLimiter, sendPhoneOtp);
router.post('/phone/verify-otp', otpLimiter, verifyPhoneOtp);
router.post('/forgot-password', forgotPasswordIpLimiter, forgotPasswordEmailLimiter, forgotPassword);
router.get('/verify-reset-token', verifyResetToken);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

// ── MFA routes: require the short-lived mfaToken issued by /login after a correct password
router.post('/setup-mfa', mfaLimiter, setupMfa);
router.post('/verify-mfa', mfaLimiter, verifyMfa);

// ── Session management ───────────────────────────────────────────────────────
router.post('/refresh', refreshToken);
router.get('/validate', validateSession);
router.post('/logout', logoutAdmin);

// ── Protected admin-only routes ──────────────────────────────────────────────
router.post('/emergency-lockdown', requireAdminAuth, emergencyLockdown);

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

            // Record login history
            const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim()
                || req.ip || req.socket.remoteAddress || 'unknown';
            const ua = req.headers['user-agent'] || 'unknown';
            LoginHistory.create({
                user: user._id,
                email: user.email,
                ipAddress: ip,
                userAgent: ua
            }).catch(err => console.error('Error logging Google user login:', err));

            const token = jwt.sign(
                { id: user._id.toString(), role: user.role },
                getJwtSecret(),

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

            // Record login history
            const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim()
                || req.ip || req.socket.remoteAddress || 'unknown';
            const ua = req.headers['user-agent'] || 'unknown';
            LoginHistory.create({
                user: user._id,
                email: user.email,
                ipAddress: ip,
                userAgent: ua
            }).catch(err => console.error('Error logging Google seller login:', err));

            if (user.role !== 'seller' && user.role !== 'admin') {
                user.role = 'seller';
                await user.save();
            }

            const token = jwt.sign(
                { id: user._id.toString(), role: user.role },
                getJwtSecret(),

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

            // Record login history
            const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim()
                || req.ip || req.socket.remoteAddress || 'unknown';
            const ua = req.headers['user-agent'] || 'unknown';
            LoginHistory.create({
                user: user._id,
                email: user.email,
                ipAddress: ip,
                userAgent: ua
            }).catch(err => console.error('Error logging Google delivery login:', err));

            if (user.role !== 'delivery' && user.role !== 'admin') {
                user.role = 'delivery';
                await user.save();
            }

            const token = jwt.sign(
                { id: user._id.toString(), role: user.role },
                getJwtSecret(),

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