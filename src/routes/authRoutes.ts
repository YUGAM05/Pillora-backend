import express from 'express';
import { registerUser, loginUser, sendOtp, verifyOtp } from '../controllers/authController';
import passport from '../config/passport';
import jwt from 'jsonwebtoken';

import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: { message: 'Too many login attempts from this IP, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

import { setupMfa, verifyMfa } from '../controllers/authController';
router.post('/setup-mfa', setupMfa);
router.post('/verify-mfa', verifyMfa);

// Setup
import { setupAdmin } from '../controllers/authController';
router.get('/setup-admin', setupAdmin);

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
                { id: user._id, role: user.role },
                process.env.JWT_SECRET!,
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
        // FIX: was hardcoded localhost:3003 — now uses env variable
        failureRedirect: `${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=auth_failed`
    }),
    (async (req, res) => {
        try {
            const user = req.user as any;

            if (!user) {
                // FIX: was hardcoded localhost:3003
                return res.redirect(`${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=no_user`);
            }

            if (user.role !== 'seller' && user.role !== 'admin') {
                user.role = 'seller';
                await user.save();
            }

            const token = jwt.sign(
                { id: user._id, role: user.role },
                process.env.JWT_SECRET!,
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
            // FIX: was hardcoded localhost:3003
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
        // FIX: was hardcoded localhost:3002 — now uses env variable
        failureRedirect: `${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=auth_failed`
    }),
    (async (req, res) => {
        try {
            const user = req.user as any;

            if (!user) {
                // FIX: was hardcoded localhost:3002
                return res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=no_user`);
            }

            if (user.role !== 'delivery' && user.role !== 'admin') {
                user.role = 'delivery';
                await user.save();
            }

            const token = jwt.sign(
                { id: user._id, role: user.role },
                process.env.JWT_SECRET!,
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
            // FIX: was hardcoded localhost:3002
            res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=server_error`);
        }
    })
);

export default router;