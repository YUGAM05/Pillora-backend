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
exports.requireAdminAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Session_1 = __importDefault(require("../models/Session"));
/**
 * Express middleware: Verify JWT + check session in database.
 * Applied to all admin-only API routes.
 */
const requireAdminAuth = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // 1. Extract token from Authorization header
        const authHeader = req.headers.authorization;
        const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) ? authHeader.slice(7) : null;
        if (!token) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }
        // 2. Verify JWT signature and decode
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024');
        }
        catch (err) {
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
            const session = yield Session_1.default.findOne({ sessionId: decoded.sessionId });
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
        req.adminUser = decoded;
        next();
    }
    catch (error) {
        console.error('[requireAdminAuth] Error:', error.message);
        res.status(500).json({ message: 'Authentication error' });
    }
});
exports.requireAdminAuth = requireAdminAuth;
