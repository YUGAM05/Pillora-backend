"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const passport_1 = __importDefault(require("../config/passport"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const requireAdminAuth_1 = require("../middleware/requireAdminAuth");
const LoginHistory_1 = __importDefault(require("../models/LoginHistory"));
// ─── Rate Limiter for login endpoint ────────────────────────────────────────
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Increased from 5 — hospital staff may attempt login multiple times
    standardHeaders: true,
    legacyHeaders: false,
    // IMPORTANT: Custom handler ensures CORS headers are always present on 429
    // Without this, the browser sees a CORS error instead of the rate limit error.
    handler: (req, res) => {
        const origin = req.headers.origin;
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        else {
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
// Rate limiters for forgot-password
const forgotPasswordIpLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || 'unknown-ip',
    handler: (req, res) => {
        const origin = req.headers.origin;
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(429).json({
            message: 'Too many requests from this IP. Please try again after an hour.'
        });
    }
});
const forgotPasswordEmailLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.body.email || '').toString().trim().toLowerCase(),
    handler: (req, res) => {
        const origin = req.headers.origin;
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(429).json({
            message: 'Too many password reset requests for this email. Please try again after an hour.'
        });
    }
});
const router = express_1.default.Router();
// ── Explicit OPTIONS preflight handler for all auth routes ───────────────────
// Belt-and-suspenders: handles any preflight that reaches the router layer.
router.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;
        if (origin === 'https://pillora-admin.vercel.app' || origin === 'https://www.pillora-admin.vercel.app') {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        else if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        else {
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
const loginCors = (req, res, next) => {
    const origin = req.headers.origin;
    if (origin === 'https://pillora-admin.vercel.app' || origin === 'https://www.pillora-admin.vercel.app') {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    else if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    else {
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
router.post('/register', authController_1.registerUser);
router.post('/login', loginCors, loginLimiter, authController_1.loginUser);
router.post('/send-otp', authController_1.sendOtp);
router.post('/verify-otp', authController_1.verifyOtp);
router.post('/phone/send-otp', authController_1.sendPhoneOtp);
router.post('/phone/verify-otp', authController_1.verifyPhoneOtp);
router.post('/forgot-password', forgotPasswordIpLimiter, forgotPasswordEmailLimiter, authController_1.forgotPassword);
router.get('/verify-reset-token', authController_1.verifyResetToken);
router.post('/reset-password', authController_1.resetPassword);
// ── MFA routes (semi-public — user ID required but no full auth) ─────────────
router.post('/setup-mfa', authController_1.setupMfa);
router.post('/verify-mfa', authController_1.verifyMfa);
// ── Session management ───────────────────────────────────────────────────────
router.post('/refresh', authController_1.refreshToken);
router.get('/validate', authController_1.validateSession);
router.post('/logout', authController_1.logoutAdmin);
// ── Protected admin-only routes ──────────────────────────────────────────────
router.post('/emergency-lockdown', requireAdminAuth_1.requireAdminAuth, authController_1.emergencyLockdown);
// ── Setup (remove in production) ─────────────────────────────────────────────
router.get('/setup-admin', authController_1.setupAdmin);
router.post('/change-password', authMiddleware_1.protect, authController_1.changePassword);
// ─────────────────────────────────────────────
// Google OAuth – User Panel
// ─────────────────────────────────────────────
router.get('/google', passport_1.default.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
}));
router.get('/google/callback', passport_1.default.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`
}), (req, res) => {
    var _a;
    try {
        const user = req.user;
        if (!user) {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_user`);
        }
        // Record login history
        const ip = ((_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0].trim())
            || req.ip || req.socket.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || 'unknown';
        LoginHistory_1.default.create({
            user: user._id,
            email: user.email,
            ipAddress: ip,
            userAgent: ua
        }).catch(err => console.error('Error logging Google user login:', err));
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024', { expiresIn: '30d' });
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
    }
    catch (error) {
        console.error('Error in user callback:', error);
        res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
    }
});
// ─────────────────────────────────────────────
// Google OAuth – Seller Panel
// ─────────────────────────────────────────────
router.get('/google/seller', passport_1.default.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: 'seller'
}));
router.get('/google/seller/callback', passport_1.default.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=auth_failed`
}), ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user = req.user;
        if (!user) {
            return res.redirect(`${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=no_user`);
        }
        // Record login history
        const ip = ((_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0].trim())
            || req.ip || req.socket.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || 'unknown';
        LoginHistory_1.default.create({
            user: user._id,
            email: user.email,
            ipAddress: ip,
            userAgent: ua
        }).catch(err => console.error('Error logging Google seller login:', err));
        if (user.role !== 'seller' && user.role !== 'admin') {
            user.role = 'seller';
            yield user.save();
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024', { expiresIn: '30d' });
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
    }
    catch (error) {
        console.error('Error in seller callback:', error);
        res.redirect(`${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=server_error`);
    }
})));
// ─────────────────────────────────────────────
// Google OAuth – Delivery Panel
// ─────────────────────────────────────────────
router.get('/google/delivery', passport_1.default.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: 'delivery'
}));
router.get('/google/delivery/callback', passport_1.default.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=auth_failed`
}), ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user = req.user;
        if (!user) {
            return res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=no_user`);
        }
        // Record login history
        const ip = ((_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0].trim())
            || req.ip || req.socket.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || 'unknown';
        LoginHistory_1.default.create({
            user: user._id,
            email: user.email,
            ipAddress: ip,
            userAgent: ua
        }).catch(err => console.error('Error logging Google delivery login:', err));
        if (user.role !== 'delivery' && user.role !== 'admin') {
            user.role = 'delivery';
            yield user.save();
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024', { expiresIn: '30d' });
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
    }
    catch (error) {
        console.error('Error in delivery callback:', error);
        res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=server_error`);
    }
})));
exports.default = router;
