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
// ─── Rate Limiter for login endpoint ────────────────────────────────────────
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { message: 'Too many login attempts from this IP, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});
const router = express_1.default.Router();
// ── Public routes ────────────────────────────────────────────────────────────
router.post('/register', authController_1.registerUser);
router.post('/login', loginLimiter, authController_1.loginUser);
router.post('/send-otp', authController_1.sendOtp);
router.post('/verify-otp', authController_1.verifyOtp);
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
    try {
        const user = req.user;
        if (!user) {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_user`);
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'defaultSecret', { expiresIn: '30d' });
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
    try {
        const user = req.user;
        if (!user) {
            return res.redirect(`${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=no_user`);
        }
        if (user.role !== 'seller' && user.role !== 'admin') {
            user.role = 'seller';
            yield user.save();
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'defaultSecret', { expiresIn: '30d' });
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
    try {
        const user = req.user;
        if (!user) {
            return res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=no_user`);
        }
        if (user.role !== 'delivery' && user.role !== 'admin') {
            user.role = 'delivery';
            yield user.save();
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'defaultSecret', { expiresIn: '30d' });
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
