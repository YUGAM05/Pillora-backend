import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import Session from '../models/Session';
import axios from 'axios';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import AuditLog from '../models/AuditLog';
import { logActivity } from '../utils/activityLogger';
import LoginHistory from '../models/LoginHistory';
import { sendTelegramMessage } from '../utils/telegram';
import crypto from 'crypto';
import PasswordResetToken from '../models/PasswordResetToken';
import { sendPasswordResetEmail } from '../services/emailService';
import { sendWhatsAppTemplate, formatPhoneNumber, getPhoneVariants } from '../services/whatsappService';
import OtpVerification from '../models/OtpVerification';
import { getJwtSecret } from '../config/security';
import { verifyFirebaseIdToken } from '../utils/firebaseTokenVerifier';


// ─── Generate a short-lived JWT with sessionId ──────────────────────────────
import { isDeactivatedHospitalStaff } from '../utils/hospitalAccess';

const STAFF_DEACTIVATED_LOGIN = 'Your staff account is deactivated. Please contact your hospital owner.';

const generateToken = (id: string, role: string, sessionId?: string) => {
    const payload: any = { id: id.toString(), role };
    if (sessionId) payload.sessionId = sessionId;
    return jwt.sign(payload, getJwtSecret(), {

        expiresIn: '30d', // Increased to 30 days for better UX
    });
};

// ─── Short-lived token proving the password step passed (admin MFA) ─────────
// verify-mfa / setup-mfa require this instead of a bare userId, so nobody can
// run the MFA step for an account without first knowing its password.
const MFA_TOKEN_PURPOSE = 'mfa_pending';
const generateMfaToken = (id: unknown) =>
    jwt.sign({ id: String(id), purpose: MFA_TOKEN_PURPOSE }, getJwtSecret(), { expiresIn: '10m' });

const readMfaToken = (mfaToken: unknown): string | null => {
    if (typeof mfaToken !== 'string' || !mfaToken) return null;
    try {
        const decoded: any = jwt.verify(mfaToken, getJwtSecret(), { algorithms: ['HS256'] });
        return decoded?.purpose === MFA_TOKEN_PURPOSE && decoded.id ? String(decoded.id) : null;
    } catch {
        return null;
    }
};

// Roles anyone may self-register as. admin/hospital accounts are created by an admin.
const SELF_REGISTER_ROLES = ['customer', 'seller', 'delivery'];

// Origins a password-reset link may point to (exact match only).
const RESET_LINK_ORIGINS = new Set([
    'https://pillora.in',
    'https://www.pillora.in',
    'https://pillorahospital.in',
    'https://www.pillorahospital.in',
    'https://pillora-admin.vercel.app',
]);
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

// ─── Helper: get IP and User-Agent ──────────────────────────────────────────
function getClientInfo(req: Request) {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim()
        || req.ip || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    return { ip, ua };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
export const registerUser = async (req: Request, res: Response): Promise<void> => {
    const { name, email, password, phone, address } = req.body;
    const requestedRole = req.body.role || 'customer';

    if (typeof requestedRole !== 'string' || !SELF_REGISTER_ROLES.includes(requestedRole)) {
        res.status(403).json({ message: 'This account type cannot be self-registered.' });
        return;
    }
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || password.length < 6) {
        res.status(400).json({ message: 'A valid email and a password of at least 6 characters are required.' });
        return;
    }
    const role: string = requestedRole;

    try {
        console.log(`Registering user: ${email}, Role: ${role}`);
        const userExists = await User.findOne({ email: email.toLowerCase().trim() });
        if (userExists) {
            console.log('Registration failed: User already exists');
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const initialStatus = (role === 'seller' || role === 'delivery') ? 'pending' : 'approved';

        const userData: any = {
            name,
            email: email.toLowerCase().trim(),
            passwordHash,
            role,
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
        } else if (role === 'delivery') {
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

        const user = await User.create(userData) as any;

        if (user) {
            console.log('User created successfully:', user._id);
            
            // Log Platform Activity
            const io = req.app.get('io');
            logActivity(io, {
                title: 'New User Registered',
                description: `${user.name} joined the platform as a ${user.role}.`,
                type: 'user'
            });

            // Send Telegram notification
            sendTelegramMessage(
                `🆕 <b>New User Registered</b>\n👤 Name: ${user.name}\n📧 Email: ${user.email}\n📱 Phone: ${user.phone || 'N/A'}\n🕐 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
            ).catch(err => console.error('Telegram notification failed:', err));

            if (user.status === 'pending') {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    message: "Registration successful. Please wait for admin approval."
                });
            } else {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    phone: user.phone,
                    address: user.address,
                    location: user.location,
                    token: generateToken(user._id as string, user.role),
                });
            }
        } else {
            console.log('Registration failed: User creation returned null');
            res.status(400).json({ message: 'Invalid user data provided' });
        }
    } catch (error: any) {
        console.error('Registration Server Error:', error);
        res.status(500).json({ message: 'Internal server error during registration' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGIN — with session creation + MFA enforcement
// ═══════════════════════════════════════════════════════════════════════════════
export const loginUser = async (req: Request, res: Response): Promise<void> => {
    const { email, password, googleToken, name, profilePicture } = req.body;
    const { ip, ua } = getClientInfo(req);
    console.log(`[LoginRequest] Attempt for: ${email} (Google: ${!!googleToken}) | DB: ${mongoose.connection.name} (state: ${mongoose.connection.readyState})`);

    // Reject non-string inputs (blocks NoSQL operator injection like {"$ne": null})
    if ((email !== undefined && typeof email !== 'string') || (password !== undefined && typeof password !== 'string')) {
        res.status(400).json({ message: 'Invalid email or password' });
        return;
    }

    try {
        let userEmail = email?.toLowerCase()?.trim();
        let user = userEmail && !googleToken
            ? await User.findOne({ email: userEmail }).select('+passwordHash +mfaSecret')
            : null;

        // ── Google Login Flow ───────────────────────────────────────────────
        if (googleToken) {
            // Never trust the email in the request body: take it from the
            // Firebase ID token after verifying its signature, audience and issuer.
            let verified;
            try {
                verified = await verifyFirebaseIdToken(googleToken);
            } catch (verifyErr: any) {
                console.warn('[GoogleLogin] Token verification failed:', verifyErr.message);
                res.status(401).json({ message: 'Google sign-in could not be verified. Please try again.' });
                return;
            }
            if (!verified.emailVerified) {
                res.status(401).json({ message: 'Your Google email address is not verified.' });
                return;
            }
            userEmail = verified.email;
            user = await User.findOne({ email: userEmail });

            // Admins must use password + authenticator code
            if (user && user.role === 'admin') {
                res.status(403).json({ message: 'Admin accounts must sign in with password and authenticator code.' });
                return;
            }
            if (user && user.status === 'rejected') {
                res.status(403).json({ message: 'Your account has been rejected. Please contact support.', status: user.status });
                return;
            }

            if (await isDeactivatedHospitalStaff(user)) {
                res.status(403).json({ message: STAFF_DEACTIVATED_LOGIN, code: 'STAFF_DEACTIVATED' });
                return;
            }

            if (!user) {
                // Create new user if they don't exist
                user = await User.create({
                    name: verified.name || name || userEmail.split('@')[0],
                    email: userEmail,
                    profilePicture: verified.picture || profilePicture,
                    role: 'customer',
                    status: 'approved',
                }) as any;
                console.log(`[GoogleLogin] Created new user: ${userEmail}`);
            } else {
                // Update existing user if they don't have profile info
                let updated = false;
                const picture = verified.picture || profilePicture;
                if (!user.profilePicture && picture) {
                    user.profilePicture = picture;
                    updated = true;
                }
                if (updated) await user.save();
                console.log(`[GoogleLogin] Existing user logged in: ${userEmail}`);
            }

            // Record login history
            await LoginHistory.create({
                user: user._id,
                email: user.email,
                ipAddress: ip,
                userAgent: ua
            });

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
                token: generateToken(user._id as unknown as string, user.role),
            });
            return;
        }

        // ── Regular Password Login Flow ──────────────────────────────────────
        if (user && user.passwordHash && password && (await bcrypt.compare(password, user.passwordHash))) {
            console.log(`Login for ${email}: Role=${user.role}, Status=${user.status}`);

            // Block rejected non-admin users
            if (user.role !== 'admin' && user.status === 'rejected') {
                res.status(403).json({
                    message: 'Your account has been rejected. Please contact support.',
                    status: user.status
                });
                return;
            }

            if (await isDeactivatedHospitalStaff(user)) {
                res.status(403).json({ message: STAFF_DEACTIVATED_LOGIN, code: 'STAFF_DEACTIVATED' });
                return;
            }

            // ── Admin login flow ─────────────────────────────────────────────
            if (user.role === 'admin') {
                await AuditLog.create({
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
                        mfaToken: generateMfaToken(user._id),
                        message: 'Please enter your 6-digit authenticator code'
                    });
                    return;
                }

                // If MFA is NOT fully enabled (isMfaEnabled is false) → force/allow MFA setup
                let secret = user.mfaSecret;
                if (!secret) {
                    secret = new OTPAuth.Secret().base32;
                    user.mfaSecret = secret;
                    await user.save();
                }

                const totp = new OTPAuth.TOTP({
                    issuer: 'Pillora Admin',
                    label: user.email,
                    secret: OTPAuth.Secret.fromBase32(secret)
                });
                const otpauthUrl = totp.toString();
                const qrCode = await QRCode.toDataURL(otpauthUrl);

                res.json({
                    mfaSetupRequired: true,
                    userId: user._id,
                    mfaToken: generateMfaToken(user._id),
                    qrCode,
                    secret,
                    message: 'MFA setup is required before accessing the admin panel'
                });
                return;
            }

            // ── Non-admin login (customers, sellers, delivery, hospital) ──────
            // Record login history
            await LoginHistory.create({
                user: user._id,
                email: user.email,
                ipAddress: ip,
                userAgent: ua
            });

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
                token: generateToken(user._id as unknown as string, user.role),
            });

        } else {
            // Failed login
            if (user && user.role === 'admin') {
                await AuditLog.create({
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
    } catch (error: any) {
        console.error('LOGIN ROUTE CRASH:', error.message, error.stack);
        res.status(500).json({ message: 'Internal server error. Please try again.' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY MFA — creates session + issues token ONLY after MFA passes
// ═══════════════════════════════════════════════════════════════════════════════
export const verifyMfa = async (req: Request, res: Response): Promise<void> => {
    const { token: mfaCode, mfaToken } = req.body;
    const { ip, ua } = getClientInfo(req);

    // userId comes ONLY from the signed mfaToken issued after a correct password
    const userId = readMfaToken(mfaToken);
    if (!userId) {
        res.status(401).json({ message: 'Your sign-in step has expired. Please log in again.' });
        return;
    }
    if (typeof mfaCode !== 'string' || !/^\d{6}$/.test(mfaCode)) {
        res.status(400).json({ message: 'Enter the 6-digit authenticator code.' });
        return;
    }

    try {
        const user = await User.findById(userId).select('+mfaSecret');
        if (!user || user.role !== 'admin' || !user.mfaSecret) {
            res.status(400).json({ message: 'MFA not configured for this user' });
            return;
        }

        const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.mfaSecret) });
        const isValid = totp.validate({ token: mfaCode, window: 1 }) !== null;

        if (!isValid) {
            await AuditLog.create({
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
            await user.save();
        }

        // Revoke any previous sessions for this admin (single-session enforcement)
        await (Session as any).revokeAllForAdmin(user._id.toString());

        // Create new session tied to IP + User-Agent
        const { sessionId, refreshToken } = await (Session as any).createSession(
            user._id.toString(), ip, ua
        );

        await AuditLog.create({
            action: 'mfa_verified',
            adminId: user._id,
            email: user.email,
            ipAddress: ip,
            status: 'success',
            details: { sessionId, userAgent: ua }
        });

        // Record login history
        await LoginHistory.create({
            user: user._id,
            email: user.email,
            ipAddress: ip,
            userAgent: ua
        });

        // Generate JWT with sessionId embedded
        const jwtToken = generateToken(user._id as unknown as string, user.role, sessionId);

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            token: jwtToken,
            refreshToken,
        });

    } catch (error: any) {
        console.error('MFA Verify Error:', error);
        res.status(500).json({ message: 'Error verifying MFA' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SETUP MFA — generates QR code for first-time setup
// ═══════════════════════════════════════════════════════════════════════════════
export const setupMfa = async (req: Request, res: Response): Promise<void> => {
    const userId = readMfaToken(req.body.mfaToken);
    if (!userId) {
        res.status(401).json({ message: 'Your sign-in step has expired. Please log in again.' });
        return;
    }
    try {
        const user = await User.findById(userId).select('+mfaSecret');
        if (!user || user.role !== 'admin') {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        // Once MFA is active its secret can't be re-generated here (that would
        // let a password-only attacker replace the real admin's authenticator).
        if (user.isMfaEnabled) {
            res.status(403).json({ message: 'MFA is already set up for this account.' });
            return;
        }

        const secret = new OTPAuth.Secret().base32;
        user.mfaSecret = secret;
        await user.save();

        const totp = new OTPAuth.TOTP({
            issuer: 'Pillora Admin',
            label: user.email,
            secret: OTPAuth.Secret.fromBase32(secret)
        });
        const otpauthUrl = totp.toString();
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        res.json({ secret, qrCode: qrCodeDataUrl });
    } catch (error: any) {
        res.status(500).json({ message: 'Error setting up MFA' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  REFRESH TOKEN — issue new JWT using refresh token
// ═══════════════════════════════════════════════════════════════════════════════
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken: incomingRefresh } = req.body;
    const { ip, ua } = getClientInfo(req);

    if (!incomingRefresh) {
        res.status(401).json({ message: 'No refresh token provided' });
        return;
    }

    try {
        const session = await Session.findOne({ refreshToken: incomingRefresh });

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
        const user = await User.findById(session.adminId);
        if (!user || user.role !== 'admin') {
            res.status(401).json({ message: 'User not found or not admin' });
            return;
        }

        // Issue new JWT with the same sessionId
        const newToken = generateToken(user._id as unknown as string, user.role, session.sessionId);

        res.json({ token: newToken });
    } catch (error: any) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ message: 'Error refreshing token' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VALIDATE SESSION — called by admin panel's /api/auth/me
// ═══════════════════════════════════════════════════════════════════════════════
export const validateSession = async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        res.status(401).json({ authenticated: false });
        return;
    }

    try {
        const decoded: any = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });


        if (decoded.role !== 'admin') {
            res.status(403).json({ authenticated: false, reason: 'not_admin' });
            return;
        }

        // If session-based, verify session in DB
        if (decoded.sessionId) {
            const session = await Session.findOne({ sessionId: decoded.sessionId });
            if (!session || session.isRevoked || new Date() > session.expiresAt) {
                res.status(401).json({ authenticated: false, reason: 'session_invalid' });
                return;
            }
        }

        res.json({ authenticated: true, user: { id: decoded.id, role: decoded.role } });
    } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
            res.status(401).json({ authenticated: false, reason: 'expired' });
            return;
        }
        res.status(401).json({ authenticated: false, reason: 'invalid' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGOUT — revoke session
// ═══════════════════════════════════════════════════════════════════════════════
export const logoutAdmin = async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    try {
        if (token) {
            const decoded: any = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });

            if (decoded.sessionId) {
                await Session.findOneAndUpdate(
                    { sessionId: decoded.sessionId },
                    { isRevoked: true }
                );
                await AuditLog.create({
                    action: 'logout',
                    adminId: decoded.id,
                    ipAddress: req.ip || 'unknown',
                    status: 'success',
                    details: { sessionId: decoded.sessionId }
                });
            }
        }
    } catch {
        // Token might be expired, that's OK — session is being revoked anyway
    }

    res.json({ success: true });
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EMERGENCY LOCKDOWN — revoke ALL sessions
// ═══════════════════════════════════════════════════════════════════════════════
export const emergencyLockdown = async (req: Request, res: Response): Promise<void> => {
    const { ip, ua } = getClientInfo(req);
    try {
        await (Session as any).lockdownAll();
        await AuditLog.create({
            action: 'emergency_lockdown',
            ipAddress: ip,
            status: 'success',
            details: { message: 'All sessions revoked', userAgent: ua }
        });
        res.json({ success: true, message: 'All sessions have been revoked' });
    } catch (error: any) {
        res.status(500).json({ message: 'Lockdown failed', error: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SEND OTP
// ═══════════════════════════════════════════════════════════════════════════════
export const sendOtp = async (req: Request, res: Response): Promise<void> => {
    const { phone } = req.body;
    if (typeof phone !== 'string' || !/^\+?\d{10,13}$/.test(phone.trim())) {
        res.status(400).json({ message: 'Enter a valid mobile number.' });
        return;
    }
    try {
        const user = await User.findOne({ phone });
        if (!user) {
            res.status(404).json({ message: 'User not found with this mobile number.' });
            return;
        }

        const otpValue = crypto.randomInt(100000, 1000000).toString();

        user.otp = otpValue;
        user.otpExpiresAt = new Date(Date.now() + 10 * 60000);
        await user.save();

        console.log(`[OTP GENERATED] For phone ending ${phone.slice(-4)}`);
        
        // Trigger WhatsApp OTP template dispatch alongside SMS
        try {
            await sendWhatsAppTemplate(phone, 'login_otp', 'en', [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: otpValue }
                    ]
                }
            ]);
            console.log(`[OTP SENT] via WhatsApp template to ${phone}`);
        } catch (waErr: any) {
            console.error('WhatsApp OTP Template Error:', waErr.message || waErr);
        }

        const apiKey = process.env.FAST2SMS_API_KEY;
        if (apiKey) {
            try {
                const url = `https://www.fast2sms.com/dev/bulkV2`;
                await axios.get(url, {
                    params: {
                        authorization: apiKey,
                        message: `Your OTP is ${otpValue}. Valid for 5 minutes.`,
                        language: "english",
                        route: "q",
                        numbers: phone,
                    }
                });
                console.log(`[OTP SENT] via Fast2SMS to ${phone}`);
            } catch (smsError: any) {
                console.error('Fast2SMS Error Data:', smsError.response?.data || smsError.message);
            }
        } else {
            console.log('[OTP] Fast2SMS API key not configured. Mocking SMS sending.');
        }
        
        // The OTP is the login secret: it must never be returned to the client.
        res.json({ message: 'OTP sent to your mobile number successfully!' });
    } catch (error: any) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY OTP
// ═══════════════════════════════════════════════════════════════════════════════
export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const { phone, otp } = req.body;
    if (typeof phone !== 'string' || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
        res.status(400).json({ message: 'Invalid OTP.' });
        return;
    }
    try {
        const user = await User.findOne({ phone }).select('+otp +otpExpiresAt');
        if (!user) {
            res.status(404).json({ message: 'User not found.' });
            return;
        }
        // Admins must go through password + MFA
        if (user.role === 'admin') {
            res.status(403).json({ message: 'Admin accounts must sign in with password and authenticator code.' });
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
            // One wrong guess burns the code, so it cannot be brute-forced
            user.otp = undefined;
            user.otpExpiresAt = undefined;
            await user.save();
            res.status(400).json({ message: 'Invalid OTP. Please request a new code.' });
            return;
        }

        user.otp = undefined;
        user.otpExpiresAt = undefined;
        await user.save();

        // (admins were already turned away above)
        if (user.status === 'rejected') {
            res.status(403).json({
                message: 'Your account has been rejected. Please contact support.',
                status: user.status
            });
            return;
        }

        if (await isDeactivatedHospitalStaff(user)) {
            res.status(403).json({ message: STAFF_DEACTIVATED_LOGIN, code: 'STAFF_DEACTIVATED' });
            return;
        }

        console.log(`[OTP VERIFIED] Login successful for phone: ${phone}`);

        // Record login history
        const { ip, ua } = getClientInfo(req);
        await LoginHistory.create({
            user: user._id,
            email: user.email,
            ipAddress: ip,
            userAgent: ua
        });

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
            token: generateToken(user._id as unknown as string, user.role),
        });

    } catch (error: any) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// setupAdmin was removed: it was a public GET endpoint that reset the admin
// password to a known value. Create admins offline with scripts/seedAdmin.ts.

// ═══════════════════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
export const changePassword = async (req: any, res: Response): Promise<void> => {
    const { newPassword, currentPassword } = req.body;
    const userId = req.user?.id;

    try {
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
            res.status(400).json({ message: 'Password must be at least 6 characters long' });
            return;
        }

        const user = await User.findById(userId).select('+passwordHash');
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        // The current password is required, except for the forced first-login
        // change (isPasswordResetRequired: the user just signed in with the
        // temporary password) and for accounts that never had a password
        // (Google / phone sign-up) setting one for the first time.
        if (user.passwordHash && !user.isPasswordResetRequired) {
            if (typeof currentPassword !== 'string' || !currentPassword
                || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
                res.status(400).json({ message: 'Current password is incorrect' });
                return;
            }
        }

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        user.isPasswordResetRequired = false;
        // End every existing login (including this one) so a stolen token stops working
        user.tokensRevokedAt = new Date();
        await user.save();
        await (Session as any).revokeAllForAdmin(user._id.toString());

        res.json({ message: 'Password updated successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating password' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD FLOW
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, portal } = req.body;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email.toString().trim())) {
            res.status(400).json({ message: 'A valid email address is required.' });
            return;
        }

        const effectivePortal = (portal && ['patient', 'hospital'].includes(portal)) ? portal : 'hospital';
        const successMessage = "If an account exists with this email address, you will receive a password reset link shortly.";
        const normalizedEmail = email.toString().trim().toLowerCase();

        // Check if user exists
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            // Always return identical success message to prevent account enumeration
            res.status(200).json({ message: successMessage });
            return;
        }

        // Restrict based on role compatibility for security
        let isRoleAllowed = false;
        if (effectivePortal === 'hospital') {
            isRoleAllowed = ['hospital', 'admin'].includes(user.role);
        } else if (effectivePortal === 'patient') {
            isRoleAllowed = ['customer', 'seller', 'delivery'].includes(user.role);
        }

        if (!isRoleAllowed) {
            res.status(200).json({ message: successMessage });
            return;
        }

        // Generate secure random token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Invalidate active reset tokens for the same user & portal
        await PasswordResetToken.updateMany({ userId: user._id, portal: effectivePortal }, { used: true });

        // Save hashed token
        await PasswordResetToken.create({
            userId: user._id,
            email: normalizedEmail,
            portal: effectivePortal,
            tokenHash,
            expiresAt,
            used: false
        });

        // Determine portal URL prefix
        let baseUrl = '';
        const origin = req.headers.origin as string;
        if (origin && (RESET_LINK_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin))) {
            baseUrl = origin;
        } else if (effectivePortal === 'patient') {
            baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://pillora.in';
        } else {
            baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : 'https://www.pillorahospital.in';
        }

        const resetLink = `${baseUrl}/reset-password?token=${token}`;

        // Send email (never expose token in logs)
        await sendPasswordResetEmail({
            toEmail: normalizedEmail,
            name: user.name,
            resetLink,
            portal: effectivePortal
        });

        res.status(200).json({ message: successMessage });
    } catch (error: any) {
        console.error('Forgot Password Error:', error.message || error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// GET /api/auth/verify-reset-token
export const verifyResetToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.query;

        if (!token || typeof token !== 'string') {
            res.status(400).json({ valid: false, message: 'Reset token is required.' });
            return;
        }

        const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

        const resetToken = await PasswordResetToken.findOne({
            tokenHash,
            used: false,
            expiresAt: { $gt: new Date() }
        });

        if (!resetToken) {
            res.status(200).json({ valid: false, message: 'Reset link is invalid or has expired.' });
            return;
        }

        res.status(200).json({ valid: true, message: 'Token is valid.' });
    } catch (error: any) {
        console.error('Verify Reset Token Error:', error.message || error);
        res.status(500).json({ valid: false, message: 'Server Error' });
    }
};

// POST /api/auth/reset-password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            res.status(400).json({ message: 'Token and new password are required.' });
            return;
        }

        // Real password regex verification on backend (min 8 chars, uppercase, lowercase, number, special char)
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/~`\-]).{8,}$/;
        if (!passwordRegex.test(password)) {
            res.status(400).json({
                message: 'Password must be at least 8 characters long, containing at least one uppercase letter, one lowercase letter, one number, and one special character.'
            });
            return;
        }

        const tokenHash = crypto.createHash('sha256').update(token.toString().trim()).digest('hex');

        const resetToken = await PasswordResetToken.findOne({
            tokenHash,
            used: false,
            expiresAt: { $gt: new Date() }
        });

        if (!resetToken) {
            res.status(400).json({ message: 'Reset link is invalid or has expired.' });
            return;
        }

        const user = await User.findById(resetToken.userId);
        if (!user) {
            res.status(404).json({ message: 'User not found.' });
            return;
        }

        // Hash new password using bcrypt
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(password, salt);
        user.isPasswordResetRequired = false;
        user.tokensRevokedAt = new Date(); // old logins stop working
        await user.save();

        // Mark current token as used
        resetToken.used = true;
        await resetToken.save();

        // Invalidate all other active reset tokens for this user
        await PasswordResetToken.updateMany(
            { userId: user._id, used: false },
            { used: true }
        );

        // Invalidate existing sessions for the administrator
        await (Session as any).revokeAllForAdmin(user._id.toString());

        res.status(200).json({
            message: 'Your password has been reset successfully. Please log in using your new password.'
        });
    } catch (error: any) {
        console.error('Reset Password Error:', error.message || error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  WHATSAPP PHONE OTP AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Send Phone OTP via WhatsApp Cloud API
 * @route   POST /api/auth/phone/send-otp
 * @access  Public
 */
export const sendPhoneOtp = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            res.status(400).json({ success: false, message: 'Phone number is required.' });
            return;
        }

        const cleanPhone = formatPhoneNumber(phoneNumber);
        if (!cleanPhone || cleanPhone.length < 10) {
            res.status(400).json({ success: false, message: 'Invalid phone number format.' });
            return;
        }

        const phoneVariants = getPhoneVariants(phoneNumber);

        // Rate Limit Check: max 3 requests per 15 minutes per phone number
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        let record = await OtpVerification.findOne({ phoneNumber: { $in: phoneVariants } });

        if (record) {
            const recentResends = (record.resendHistory || []).filter(date => new Date(date) >= fifteenMinsAgo);
            if (recentResends.length >= 3) {
                res.status(429).json({
                    success: false,
                    message: 'Too many OTP requests for this number. Please wait 15 minutes before trying again.'
                });
                return;
            }
        }

        // Generate 6-digit random numeric OTP
        const otpValue = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute expiry

        if (record) {
            record.phoneNumber = cleanPhone;
            record.otp = otpValue;
            record.expiresAt = expiresAt;
            record.attempts = 0;
            record.resendHistory = [...(record.resendHistory || []).filter(d => new Date(d) >= fifteenMinsAgo), new Date()];
            await record.save();
        } else {
            record = await OtpVerification.create({
                phoneNumber: cleanPhone,
                otp: otpValue,
                expiresAt,
                attempts: 0,
                resendHistory: [new Date()]
            });
        }

        // Call WhatsApp Template Service with both body and button parameters required by Meta login_otp template
        const waResult = await sendWhatsAppTemplate(cleanPhone, 'login_otp', 'en', [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: otpValue }
                ]
            },
            {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                    { type: 'text', text: otpValue }
                ]
            }
        ]);

        if (!waResult.success) {
            console.error('[PhoneAuth] Failed to send WhatsApp OTP:', waResult.error);
            const errorMsg = waResult.error?.error?.message || waResult.error?.message || 'Failed to deliver WhatsApp message.';
            res.status(502).json({
                success: false,
                message: `Failed to send OTP via WhatsApp: ${errorMsg}`
            });
            return;
        }

        console.log(`[PhoneAuth] WhatsApp OTP sent successfully to ${cleanPhone}`);
        res.status(200).json({ success: true, message: 'OTP sent via WhatsApp successfully.' });
    } catch (error: any) {
        console.error('[PhoneAuth] sendPhoneOtp error:', error.message || error);
        res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }
};

/**
 * @desc    Verify Phone OTP and Login / Register User
 * @route   POST /api/auth/phone/verify-otp
 * @access  Public
 */
export const verifyPhoneOtp = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phoneNumber, otp } = req.body;
        if (!phoneNumber || !otp) {
            res.status(400).json({ success: false, message: 'Phone number and OTP are required.' });
            return;
        }

        const cleanPhone = formatPhoneNumber(phoneNumber);
        const phoneVariants = getPhoneVariants(phoneNumber);
        const record = await OtpVerification.findOne({ phoneNumber: { $in: phoneVariants } });

        if (!record || new Date() > record.expiresAt) {
            res.status(400).json({ success: false, message: 'Invalid or expired verification code. Please request a new OTP.' });
            return;
        }

        // Max 5 verification attempts
        if (record.attempts >= 5) {
            await OtpVerification.deleteOne({ _id: record._id });
            res.status(400).json({ success: false, message: 'Maximum verification attempts exceeded. Please request a new OTP.' });
            return;
        }

        record.attempts += 1;
        await record.save();

        if (record.otp.toString().trim() !== otp.toString().trim()) {
            res.status(400).json({ success: false, message: 'Invalid verification code. Please check and try again.' });
            return;
        }

        // OTP verified successfully -> remove OTP record
        await OtpVerification.deleteOne({ _id: record._id });

        // Find user by phoneNumber or phone using all phone variants
        let user = await User.findOne({
            $or: [
                { phoneNumber: { $in: phoneVariants } },
                { phone: { $in: phoneVariants } }
            ]
        });

        if (!user) {
            // Register new User
            const shortDigits = cleanPhone.slice(-4);
            const fallbackEmail = `user_${cleanPhone}@phone.pillora.in`;
            try {
                user = await User.create({
                    name: `Pillora User ${shortDigits}`,
                    phoneNumber: cleanPhone,
                    phone: cleanPhone,
                    phoneVerified: true,
                    role: 'customer',
                    status: 'approved'
                });
                console.log(`[PhoneAuth] Registered new user for phone ${cleanPhone}`);
            } catch (createErr: any) {
                console.warn('[PhoneAuth] User.create initial attempt failed:', createErr?.message);
                
                user = await User.findOne({
                    $or: [
                        { phoneNumber: { $in: phoneVariants } },
                        { phone: { $in: phoneVariants } },
                        { email: fallbackEmail }
                    ]
                });

                if (!user) {
                    try {
                        user = await User.create({
                            name: `Pillora User ${shortDigits}`,
                            phoneNumber: cleanPhone,
                            phone: cleanPhone,
                            email: fallbackEmail,
                            phoneVerified: true,
                            role: 'customer',
                            status: 'approved'
                        });
                        console.log(`[PhoneAuth] Registered new user with fallback email for phone ${cleanPhone}`);
                    } catch (fallbackErr: any) {
                        console.error('[PhoneAuth] User.create fallback failed:', fallbackErr?.message);
                        throw fallbackErr;
                    }
                }
            }
        } else {
            if (!user.phoneVerified || !user.phoneNumber) {
                user.phoneVerified = true;
                if (!user.phoneNumber) user.phoneNumber = cleanPhone;
                try {
                    await user.save();
                } catch (saveErr) {
                    console.warn('[PhoneAuth] Failed to update user phoneVerified flag:', saveErr);
                }
            }
        }

        // Admins must go through password + MFA, never phone OTP
        if (user.role === 'admin') {
            res.status(403).json({ success: false, message: 'Admin accounts must sign in with password and authenticator code.' });
            return;
        }

        if (await isDeactivatedHospitalStaff(user)) {
            res.status(403).json({ success: false, message: STAFF_DEACTIVATED_LOGIN, code: 'STAFF_DEACTIVATED' });
            return;
        }

        // Log login history
        try {
            await LoginHistory.create({
                user: user._id,
                email: user.email || user.phoneNumber || cleanPhone,
                ipAddress: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown'
            });
        } catch (lhErr) {
            console.warn('[PhoneAuth] Failed to save login history:', lhErr);
        }

        const token = generateToken(user._id as unknown as string, user.role);

        res.status(200).json({
            success: true,
            token,
            _id: user._id,
            name: user.name,
            email: user.email || '',
            phoneNumber: user.phoneNumber || user.phone,
            role: user.role,
            status: user.status
        });
    } catch (error: any) {
        console.error('[PhoneAuth] verifyPhoneOtp error:', error.stack || error.message || error);
        res.status(500).json({ success: false, message: error.message || 'Verification failed. Please try again.' });
    }
};


