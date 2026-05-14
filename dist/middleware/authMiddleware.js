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
        try {
            token = req.headers.authorization.split(' ')[1];
            if (!process.env.JWT_SECRET) {
                console.warn('[AuthMiddleware] WARNING: JWT_SECRET is not defined in environment variables! Using defaultSecret fallback.');
            }
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'defaultSecret');
            // Fetch user from DB to check status
            // Support both 'id' (new standard) and 'userId' (legacy) token payloads
            const userId = decoded.id || decoded.userId;
            req.user = yield User_1.default.findById(userId).select('-passwordHash');
            if (!req.user) {
                res.status(401).json({ message: 'Not authorized, user not found' });
                return;
            }
            // Check if seller is approved
            if (req.user.role === 'seller' && req.user.status !== 'approved') {
                res.status(403).json({ message: 'Seller account pending approval' });
                return;
            }
            next();
        }
        catch (error) {
            console.error('[AuthMiddleware] Token Verification Failed:', error);
            res.status(401).json({ message: 'Not authorized, token failed' });
            return;
        }
    }
    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
        return;
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
