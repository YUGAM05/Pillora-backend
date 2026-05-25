"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.changePassword = exports.setupAdmin = exports.verifyOtp = exports.sendOtp = exports.emergencyLockdown = exports.logoutAdmin = exports.validateSession = exports.refreshToken = exports.setupMfa = exports.verifyMfa = exports.loginUser = exports.registerUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const Session_1 = __importDefault(require("../models/Session"));
const axios_1 = __importDefault(require("axios"));
const OTPAuth = __importStar(require("otpauth"));
const qrcode_1 = __importDefault(require("qrcode"));
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
const activityLogger_1 = require("../utils/activityLogger");
// ─── Generate a short-lived JWT with sessionId ──────────────────────────────
const generateToken = (id, role, sessionId) => {
    const payload = { id: id.toString(), role };
    if (sessionId)
        payload.sessionId = sessionId;
    return jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024', {
        expiresIn: '30d', // Increased to 30 days for better UX
    });
};
// ─── Helper: get IP and User-Agent ──────────────────────────────────────────
function getClientInfo(req) {
    var _a;
    const ip = ((_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0].trim())
        || req.ip || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    return { ip, ua };
}
// ═══════════════════════════════════════════════════════════════════════════════
//  REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
const registerUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password, role, bankDetails, pharmacyCertificate, aadhaarCardUrl, phone, address } = req.body;
    try {
        console.log(`Registering user: ${email}, Role: ${role}`);
        const userExists = yield User_1.default.findOne({ email: email.toLowerCase().trim() });
        if (userExists) {
            console.log('Registration failed: User already exists');
            res.status(400).json({ message: 'User already exists' });
            return;
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        const passwordHash = yield bcryptjs_1.default.hash(password, salt);
        const initialStatus = (role === 'seller' || role === 'delivery') ? 'pending' : 'approved';
        const userData = {
            name,
            email: email.toLowerCase().trim(),
            passwordHash,
            role: role || 'customer',
            status: initialStatus,
            phone,
            address
        };
        if (role === 'seller') {
            const sellerFields = [
                'bankDetails', 'pharmacyCertificate', 'aadhaarCardUrl', 'aadhaarNumber',
                'ownerPhotoUrl', 'ownerPan', 'panCardUrl', 'businessPan',
                'businessType', 'yearsInOperation', 'retailDrugLicense',
                'drugLicenseNumber', 'licenseExpiryDate', 'pharmacistCertificate',
                'gstNumber', 'cancelledChequeUrl', 'shopEstablishmentUrl',
                'rentAgreementUrl', 'shopPhotoFrontUrl', 'shopPhotoInsideUrl',
                'whatsappNumber', 'alternateContact', 'operatingHours',
                'agreedToTerms', 'agreedToCompliance', 'agreedToNoBannedDrugs',
                'selfDeclarationValidLicenses', 'pharmacy_name'
            ];
            sellerFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    userData[field] = req.body[field];
                }
            });
        }
        else if (role === 'delivery') {
            const deliveryFields = [
                'dob', 'gender', 'aadhaarNumber', 'aadhaarCardUrl', 'aadhaarBackUrl',
                'ownerPan', 'panCardUrl', 'ownerPhotoUrl', 'vehicleType', 'vehicleRegNumber',
                'dlNumber', 'dlExpiryDate', 'dlFrontUrl', 'dlBackUrl', 'rcUrl',
                'insuranceUrl', 'whatsappNumber', 'emergencyContactName',
                'emergencyContactNumber', 'bankDetails', 'cancelledChequeUrl',
                'upiId', 'preferredZones', 'availableHours', 'daysAvailable',
                'employmentType', 'noCriminalRecord', 'policeVerificationUrl',
                'referenceContact', 'agreedToTerms', 'agreedToGpsTracking',
                'agreedToHandleMeds', 'acknowledgeSla', 'consentBackgroundCheck'
            ];
            deliveryFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    userData[field] = req.body[field];
                }
            });
        }
        const user = yield User_1.default.create(userData);
        if (user) {
            console.log('User created successfully:', user._id);
            // Log Platform Activity
            const io = req.app.get('io');
            (0, activityLogger_1.logActivity)(io, {
                title: 'New User Registered',
                description: `${user.name} joined the platform as a ${user.role}.`,
                type: 'user'
            });
            if (user.status === 'pending') {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    message: "Registration successful. Please wait for admin approval."
                });
            }
            else {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    phone: user.phone,
                    address: user.address,
                    location: user.location,
                    token: generateToken(user._id, user.role),
                });
            }
        }
        else {
            console.log('Registration failed: User creation returned null');
            res.status(400).json({ message: 'Invalid user data provided' });
        }
    }
    catch (error) {
        console.error('Registration Server Error:', error);
        res.status(500).json({
            message: 'Internal server error during registration',
            details: error.message
        });
    }
});
exports.registerUser = registerUser;
// ═══════════════════════════════════════════════════════════════════════════════
//  LOGIN — with session creation + MFA enforcement
// ═══════════════════════════════════════════════════════════════════════════════
const loginUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { email, password, googleToken, name, profilePicture } = req.body;
    const { ip, ua } = getClientInfo(req);
    console.log(`[LoginRequest] Attempt for: ${email} (Google: ${!!googleToken}) | DB: ${mongoose_1.default.connection.name} (state: ${mongoose_1.default.connection.readyState})`);
    try {
        const userEmail = (_a = email === null || email === void 0 ? void 0 : email.toLowerCase()) === null || _a === void 0 ? void 0 : _a.trim();
        let user = userEmail ? yield User_1.default.findOne({ email: userEmail }) : null;
        // ── Google Login Flow ───────────────────────────────────────────────
        if (googleToken) {
            if (!userEmail) {
                res.status(400).json({ message: 'Email is required for Google login' });
                return;
            }
            if (!user) {
                // Create new user if they don't exist
                user = (yield User_1.default.create({
                    name: name || userEmail.split('@')[0],
                    email: userEmail,
                    profilePicture: profilePicture,
                    role: 'customer',
                    status: 'approved',
                }));
                console.log(`[GoogleLogin] Created new user: ${userEmail}`);
            }
            else {
                // Update existing user if they don't have profile info
                let updated = false;
                if (!user.profilePicture && profilePicture) {
                    user.profilePicture = profilePicture;
                    updated = true;
                }
                if (updated)
                    yield user.save();
                console.log(`[GoogleLogin] Existing user logged in: ${userEmail}`);
            }
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                phone: user.phone,
                address: user.address,
                location: user.location,
                isPasswordResetRequired: user.isPasswordResetRequired,
                token: generateToken(user._id, user.role),
            });
            return;
        }
        // ── Regular Password Login Flow ──────────────────────────────────────
        if (user && user.passwordHash && password && (yield bcryptjs_1.default.compare(password, user.passwordHash))) {
            console.log(`Login for ${email}: Role=${user.role}, Status=${user.status}`);
            // Block rejected non-admin users
            if (user.role !== 'admin' && user.status === 'rejected') {
                res.status(403).json({
                    message: 'Your account has been rejected. Please contact support.',
                    status: user.status
                });
                return;
            }
            // ── Admin login flow ─────────────────────────────────────────────
            if (user.role === 'admin') {
                yield AuditLog_1.default.create({
                    action: 'login',
                    adminId: user._id,
                    email: user.email,
                    ipAddress: ip,
                    status: 'success',
                    details: { message: 'Password verified', userAgent: ua }
                });
                // If MFA is enabled → require OTP before issuing token
                if (user.isMfaEnabled) {
                    res.json({
                        mfaRequired: true,
                        userId: user._id,
                        message: 'Please enter your 6-digit authenticator code'
                    });
                    return;
                }
                // If MFA is NOT set up → force MFA setup
                if (!user.mfaSecret) {
                    const secret = new OTPAuth.Secret().base32;
                    user.mfaSecret = secret;
                    yield user.save();
                    const totp = new OTPAuth.TOTP({
                        issuer: 'Pillora Admin',
                        label: user.email,
                        secret: OTPAuth.Secret.fromBase32(secret)
                    });
                    const otpauthUrl = totp.toString();
                    const qrCode = yield qrcode_1.default.toDataURL(otpauthUrl);
                    res.json({
                        mfaSetupRequired: true,
                        userId: user._id,
                        qrCode,
                        secret,
                        message: 'MFA setup is required before accessing the admin panel'
                    });
                    return;
                }
                // MFA secret exists but not enabled → require verification
                res.json({
                    mfaRequired: true,
                    userId: user._id,
                    message: 'Please verify your authenticator code'
                });
                return;
            }
            // ── Non-admin login (customers, sellers, delivery, hospital) ──────
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                phone: user.phone,
                address: user.address,
                location: user.location,
                isPasswordResetRequired: user.isPasswordResetRequired,
                token: generateToken(user._id, user.role),
            });
        }
        else {
            // Failed login
            if (user && user.role === 'admin') {
                yield AuditLog_1.default.create({
                    action: 'login_failed',
                    adminId: user._id,
                    email: user.email,
                    ipAddress: ip,
                    status: 'failed',
                    details: { message: 'Invalid password', userAgent: ua }
                });
            }
            res.status(401).json({ message: 'Invalid email or password' });
        }
    }
    catch (error) {
        console.error('LOGIN ROUTE CRASH:', error.message, error.stack);
        res.status(500).json({
            message: `Internal server error: ${error.message || 'Unknown error'}`,
            error: error.message,
            stack: error.stack
        });
    }
});
exports.loginUser = loginUser;
// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY MFA — creates session + issues token ONLY after MFA passes
// ═══════════════════════════════════════════════════════════════════════════════
const verifyMfa = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, token: mfaCode } = req.body;
    const { ip, ua } = getClientInfo(req);
    try {
        const user = yield User_1.default.findById(userId);
        if (!user || !user.mfaSecret) {
            res.status(400).json({ message: 'MFA not configured for this user' });
            return;
        }
        const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.mfaSecret) });
        const isValid = totp.validate({ token: mfaCode, window: 1 }) !== null;
        if (!isValid) {
            yield AuditLog_1.default.create({
                action: 'mfa_failed',
                adminId: user._id,
                email: user.email,
                ipAddress: ip,
                status: 'failed'
            });
            res.status(401).json({ message: 'Invalid authenticator code' });
            return;
        }
        // Mark MFA as enabled
        if (!user.isMfaEnabled) {
            user.isMfaEnabled = true;
            yield user.save();
        }
        // Revoke any previous sessions for this admin (single-session enforcement)
        yield Session_1.default.revokeAllForAdmin(user._id.toString());
        // Create new session tied to IP + User-Agent
        const { sessionId, refreshToken } = yield Session_1.default.createSession(user._id.toString(), ip, ua);
        yield AuditLog_1.default.create({
            action: 'mfa_verified',
            adminId: user._id,
            email: user.email,
            ipAddress: ip,
            status: 'success',
            details: { sessionId, userAgent: ua }
        });
        // Generate JWT with sessionId embedded
        const jwtToken = generateToken(user._id, user.role, sessionId);
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            token: jwtToken,
            refreshToken,
        });
    }
    catch (error) {
        console.error('MFA Verify Error:', error);
        res.status(500).json({ message: 'Error verifying MFA', error: error.message });
    }
});
exports.verifyMfa = verifyMfa;
// ═══════════════════════════════════════════════════════════════════════════════
//  SETUP MFA — generates QR code for first-time setup
// ═══════════════════════════════════════════════════════════════════════════════
const setupMfa = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    try {
        const user = yield User_1.default.findById(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        const secret = new OTPAuth.Secret().base32;
        user.mfaSecret = secret;
        yield user.save();
        const totp = new OTPAuth.TOTP({
            issuer: 'Pillora Admin',
            label: user.email,
            secret: OTPAuth.Secret.fromBase32(secret)
        });
        const otpauthUrl = totp.toString();
        const qrCodeDataUrl = yield qrcode_1.default.toDataURL(otpauthUrl);
        res.json({ secret, qrCode: qrCodeDataUrl });
    }
    catch (error) {
        res.status(500).json({ message: 'Error setting up MFA', error: error.message });
    }
});
exports.setupMfa = setupMfa;
// ═══════════════════════════════════════════════════════════════════════════════
//  REFRESH TOKEN — issue new JWT using refresh token
// ═══════════════════════════════════════════════════════════════════════════════
const refreshToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { refreshToken: incomingRefresh } = req.body;
    const { ip, ua } = getClientInfo(req);
    if (!incomingRefresh) {
        res.status(401).json({ message: 'No refresh token provided' });
        return;
    }
    try {
        const session = yield Session_1.default.findOne({ refreshToken: incomingRefresh });
        if (!session) {
            res.status(401).json({ message: 'Invalid refresh token' });
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
        // Get the admin user
        const user = yield User_1.default.findById(session.adminId);
        if (!user || user.role !== 'admin') {
            res.status(401).json({ message: 'User not found or not admin' });
            return;
        }
        // Issue new JWT with the same sessionId
        const newToken = generateToken(user._id, user.role, session.sessionId);
        res.json({ token: newToken });
    }
    catch (error) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ message: 'Error refreshing token' });
    }
});
exports.refreshToken = refreshToken;
// ═══════════════════════════════════════════════════════════════════════════════
//  VALIDATE SESSION — called by admin panel's /api/auth/me
// ═══════════════════════════════════════════════════════════════════════════════
const validateSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) ? authHeader.slice(7) : null;
    if (!token) {
        res.status(401).json({ authenticated: false });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024');
        if (decoded.role !== 'admin') {
            res.status(403).json({ authenticated: false, reason: 'not_admin' });
            return;
        }
        // If session-based, verify session in DB
        if (decoded.sessionId) {
            const session = yield Session_1.default.findOne({ sessionId: decoded.sessionId });
            if (!session || session.isRevoked || new Date() > session.expiresAt) {
                res.status(401).json({ authenticated: false, reason: 'session_invalid' });
                return;
            }
        }
        res.json({ authenticated: true, user: { id: decoded.id, role: decoded.role } });
    }
    catch (err) {
        if (err.name === 'TokenExpiredError') {
            res.status(401).json({ authenticated: false, reason: 'expired' });
            return;
        }
        res.status(401).json({ authenticated: false, reason: 'invalid' });
    }
});
exports.validateSession = validateSession;
// ═══════════════════════════════════════════════════════════════════════════════
//  LOGOUT — revoke session
// ═══════════════════════════════════════════════════════════════════════════════
const logoutAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers.authorization;
    const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) ? authHeader.slice(7) : null;
    try {
        if (token) {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024');
            if (decoded.sessionId) {
                yield Session_1.default.findOneAndUpdate({ sessionId: decoded.sessionId }, { isRevoked: true });
                yield AuditLog_1.default.create({
                    action: 'logout',
                    adminId: decoded.id,
                    ipAddress: req.ip || 'unknown',
                    status: 'success',
                    details: { sessionId: decoded.sessionId }
                });
            }
        }
    }
    catch (_a) {
        // Token might be expired, that's OK — session is being revoked anyway
    }
    res.json({ success: true });
});
exports.logoutAdmin = logoutAdmin;
// ═══════════════════════════════════════════════════════════════════════════════
//  EMERGENCY LOCKDOWN — revoke ALL sessions
// ═══════════════════════════════════════════════════════════════════════════════
const emergencyLockdown = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ip, ua } = getClientInfo(req);
    try {
        yield Session_1.default.lockdownAll();
        yield AuditLog_1.default.create({
            action: 'emergency_lockdown',
            ipAddress: ip,
            status: 'success',
            details: { message: 'All sessions revoked', userAgent: ua }
        });
        res.json({ success: true, message: 'All sessions have been revoked' });
    }
    catch (error) {
        res.status(500).json({ message: 'Lockdown failed', error: error.message });
    }
});
exports.emergencyLockdown = emergencyLockdown;
// ═══════════════════════════════════════════════════════════════════════════════
//  SEND OTP
// ═══════════════════════════════════════════════════════════════════════════════
const sendOtp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { phone } = req.body;
    try {
        const user = yield User_1.default.findOne({ phone });
        if (!user) {
            res.status(404).json({ message: 'User not found with this mobile number.' });
            return;
        }
        const otpValue = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otpValue;
        user.otpExpiresAt = new Date(Date.now() + 10 * 60000);
        yield user.save();
        console.log(`[OTP GENERATED] For phone ${phone}: ${otpValue}`);
        const apiKey = process.env.FAST2SMS_API_KEY;
        if (apiKey) {
            try {
                const url = `https://www.fast2sms.com/dev/bulkV2`;
                yield axios_1.default.get(url, {
                    params: {
                        authorization: apiKey,
                        message: `Your OTP is ${otpValue}. Valid for 5 minutes.`,
                        language: "english",
                        route: "q",
                        numbers: phone,
                    }
                });
                console.log(`[OTP SENT] via Fast2SMS to ${phone}`);
            }
            catch (smsError) {
                console.error('Fast2SMS Error Data:', ((_a = smsError.response) === null || _a === void 0 ? void 0 : _a.data) || smsError.message);
            }
        }
        else {
            console.log('[OTP] Fast2SMS API key not configured. Mocking SMS sending.');
        }
        res.json({ message: 'OTP sent to your mobile number successfully!', otp: otpValue });
    }
    catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message || error });
    }
});
exports.sendOtp = sendOtp;
// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY OTP
// ═══════════════════════════════════════════════════════════════════════════════
const verifyOtp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone, otp } = req.body;
    try {
        const user = yield User_1.default.findOne({ phone });
        if (!user) {
            res.status(404).json({ message: 'User not found.' });
            return;
        }
        if (!user.otp || !user.otpExpiresAt) {
            res.status(400).json({ message: 'No OTP requested for this user.' });
            return;
        }
        if (new Date() > user.otpExpiresAt) {
            res.status(400).json({ message: 'OTP has expired.' });
            return;
        }
        if (user.otp !== otp) {
            res.status(400).json({ message: 'Invalid OTP.' });
            return;
        }
        user.otp = undefined;
        user.otpExpiresAt = undefined;
        yield user.save();
        if (user.role !== 'admin' && user.status === 'rejected') {
            res.status(403).json({
                message: 'Your account has been rejected. Please contact support.',
                status: user.status
            });
            return;
        }
        console.log(`[OTP VERIFIED] Login successful for phone: ${phone}`);
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            phone: user.phone,
            address: user.address,
            location: user.location,
            isPasswordResetRequired: user.isPasswordResetRequired,
            token: generateToken(user._id, user.role),
        });
    }
    catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message || error });
    }
});
exports.verifyOtp = verifyOtp;
// ═══════════════════════════════════════════════════════════════════════════════
//  SETUP ADMIN (temporary)
// ═══════════════════════════════════════════════════════════════════════════════
const setupAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const email = 'admin@pillora.in';
        const password = 'admin';
        const salt = yield bcryptjs_1.default.genSalt(10);
        const passwordHash = yield bcryptjs_1.default.hash(password, salt);
        yield User_1.default.findOneAndUpdate({ email }, { name: 'Super Admin', email, passwordHash, role: 'admin', status: 'approved' }, { upsert: true, new: true });
        console.log("Admin setup complete via API.");
        res.json({ message: "Admin Account Created Successfully! Login with admin@pillora.in / admin" });
    }
    catch (error) {
        console.error('Setup Admin Error:', error);
        res.status(500).json({ message: 'Setup Failed', error: error.message || error });
    }
});
exports.setupAdmin = setupAdmin;
// ═══════════════════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
const changePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { newPassword } = req.body;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    try {
        if (!newPassword || newPassword.length < 6) {
            res.status(400).json({ message: 'Password must be at least 6 characters long' });
            return;
        }
        const user = yield User_1.default.findById(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        user.passwordHash = yield bcryptjs_1.default.hash(newPassword, salt);
        user.isPasswordResetRequired = false;
        yield user.save();
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating password', error: error.message });
    }
});
exports.changePassword = changePassword;
