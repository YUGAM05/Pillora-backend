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
exports.deliveryOnly = exports.sellerOnly = exports.adminOnly = exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const protect = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        const parts = req.headers.authorization.split(/\s+/);
        token = parts[1];
    }
    if (!token || token === 'null' || token === 'undefined') {
        console.error('[AuthMiddleware] No valid token provided');
        res.status(401).json({ message: 'Not authorized, no token' });
        return;
    }
    // Try every known JWT secret in order — covers all deployment states
    // (.env local key, Vercel dashboard key, and all historical fallbacks)
    const secretsToTry = [
        process.env.JWT_SECRET, // 1. Vercel dashboard / .env (primary)
        'supersecretkey_dev_only', // 2. The actual local .env value
        'pillora_jwt_secret_fallback_2024', // 3. Our consistent fallback
        'defaultSecret', // 4. Original hardcoded fallback
        'p!ll0r4_Jw7$3cr3t_K3y_X9mQ2vR8nL5tY1wZ6bF4hC0dA7eG3jN_2026_Pr0d_S3cur3', // 5. If user set it in Vercel
    ].filter((s) => typeof s === 'string' && s.length > 0);
    let decoded = null;
    let verifyError = null;
    for (const secret of secretsToTry) {
        try {
            decoded = jsonwebtoken_1.default.verify(token, secret);
            console.log(`[AuthMiddleware] Token verified with secret index ${secretsToTry.indexOf(secret)}`);
            break;
        }
        catch (err) {
            verifyError = err;
            // Try next secret
        }
    }
    if (!decoded) {
        console.error('[AuthMiddleware] Token verification failed with ALL secrets:', verifyError === null || verifyError === void 0 ? void 0 : verifyError.message);
        console.error('[AuthMiddleware] Token start:', token.substring(0, 20) + '...');
        res.status(401).json({
            message: 'Not authorized, token failed',
            details: (verifyError === null || verifyError === void 0 ? void 0 : verifyError.name) === 'TokenExpiredError' ? 'session_expired' : 'invalid_token',
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
        req.user = yield User_1.default.findById(userId).select('-passwordHash');
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
    }
    catch (error) {
        console.error('[AuthMiddleware] DB lookup error:', error.message);
        res.status(500).json({ message: 'Authentication error' });
    }
});
exports.protect = protect;
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    }
    else {
        res.status(403).json({ message: 'Not authorized as admin' });
        return;
    }
};
exports.adminOnly = adminOnly;
const sellerOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'seller' || req.user.role === 'admin')) {
        next();
    }
    else {
        res.status(403).json({ message: 'Not authorized as seller' });
        return;
    }
};
exports.sellerOnly = sellerOnly;
const deliveryOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'delivery' || req.user.role === 'admin')) {
        next();
    }
    else {
        res.status(403).json({ message: 'Not authorized as delivery partner' });
        return;
    }
};
exports.deliveryOnly = deliveryOnly;
