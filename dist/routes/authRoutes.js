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
const passport_1 = __importDefault(require("../config/passport"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = express_1.default.Router();
router.post('/register', authController_1.registerUser);
router.post('/login', authController_1.loginUser);
// Setup
const authController_2 = require("../controllers/authController");
router.get('/setup-admin', authController_2.setupAdmin);
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
        const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
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
    // FIX: was hardcoded localhost:3003 — now uses env variable
    failureRedirect: `${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=auth_failed`
}), ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user) {
            // FIX: was hardcoded localhost:3003
            return res.redirect(`${process.env.SELLER_PANEL_URL || 'http://localhost:3003'}/login?error=no_user`);
        }
        if (user.role !== 'seller' && user.role !== 'admin') {
            user.role = 'seller';
            yield user.save();
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
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
        // FIX: was hardcoded localhost:3003
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
    // FIX: was hardcoded localhost:3002 — now uses env variable
    failureRedirect: `${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=auth_failed`
}), ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user) {
            // FIX: was hardcoded localhost:3002
            return res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=no_user`);
        }
        if (user.role !== 'delivery' && user.role !== 'admin') {
            user.role = 'delivery';
            yield user.save();
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
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
        // FIX: was hardcoded localhost:3002
        res.redirect(`${process.env.DELIVERY_PANEL_URL || 'http://localhost:3002'}/login?error=server_error`);
    }
})));
exports.default = router;
