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
import { sendWhatsAppTemplate, formatPhoneNumber } from '../services/whatsappService';
import OtpVerification from '../models/OtpVerification';


// ─── Generate a short-lived JWT with sessionId ──────────────────────────────
const generateToken = (id: string, role: string, sessionId?: string) => {
    const payload: any = { id: id.toString(), role };
    if (sessionId) payload.sessionId = sessionId;
    return jwt.sign(payload, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024', {

        expiresIn: '30d', // Increased to 30 days for better UX
    });
};

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
    const { name, email, password, role, bankDetails, pharmacyCertificate, aadhaarCardUrl, phone, address } = req.body;

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
        res.status(500).json({
            message: 'Internal server error during registration',
            details: error.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGIN — with session creation + MFA enforcement
// ═══════════════════════════════════════════════════════════════════════════════
export const loginUser = async (req: Request, res: Response): Promise<void> => {
    const { email, password, googleToken, name, profilePicture } = req.body;
    const { ip, ua } = getClientInfo(req);
    console.log(`[LoginRequest] Attempt for: ${email} (Google: ${!!googleToken}) | DB: ${mongoose.connection.name} (state: ${mongoose.connection.readyState})`);

    try {
        const userEmail = email?.toLowerCase()?.trim();
        let user = userEmail ? await User.findOne({ email: userEmail }) : null;

        // ── Google Login Flow ───────────────────────────────────────────────
        if (googleToken) {
            if (!userEmail) {
                res.status(400).json({ message: 'Email is required for Google login' });
                return;
            }

            if (!user) {
                // Create new user if they don't exist
                user = await User.create({
                    name: name || userEmail.split('@')[0],
                    email: userEmail,
                    profilePicture: profilePicture,
                    role: 'customer',
                    status: 'approved',
                }) as any;
                console.log(`[GoogleLogin] Created new user: ${userEmail}`);
            } else {
                // Update existing user if they don't have profile info
                let updated = false;
                if (!user.profilePicture && profilePicture) {
                    user.profilePicture = profilePicture;
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
        res.status(500).json({ 
            message: `Internal server error: ${error.message || 'Unknown error'}`, 
            error: error.message,
            stack: error.stack
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY MFA — creates session + issues token ONLY after MFA passes
// ═══════════════════════════════════════════════════════════════════════════════
export const verifyMfa = async (req: Request, res: Response): Promise<void> => {
    const { userId, token: mfaCode } = req.body;
    const { ip, ua } = getClientInfo(req);

    try {
        const user = await User.findById(userId);
        if (!user || !user.mfaSecret) {
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
        res.status(500).json({ message: 'Error verifying MFA', error: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SETUP MFA — generates QR code for first-time setup
// ═══════════════════════════════════════════════════════════════════════════════
export const setupMfa = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
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
        res.status(500).json({ message: 'Error setting up MFA', error: error.message });
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
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024');


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
            const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'pillora_jwt_secret_fallback_2024');

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
    try {
        const user = await User.findOne({ phone });
        if (!user) {
            res.status(404).json({ message: 'User not found with this mobile number.' });
            return;
        }

        const otpValue = Math.floor(100000 + Math.random() * 900000).toString();
        
        user.otp = otpValue;
        user.otpExpiresAt = new Date(Date.now() + 10 * 60000);
        await user.save();

        console.log(`[OTP GENERATED] For phone ${phone}: ${otpValue}`);
        
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
        
        res.json({ message: 'OTP sent to your mobile number successfully!', otp: otpValue });
    } catch (error: any) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message || error });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY OTP
// ═══════════════════════════════════════════════════════════════════════════════
export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const { phone, otp } = req.body;
    try {
        const user = await User.findOne({ phone });
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
        await user.save();

        if (user.role !== 'admin' && user.status === 'rejected') {
            res.status(403).json({
                message: 'Your account has been rejected. Please contact support.',
                status: user.status
            });
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
        res.status(500).json({ message: 'Server Error', error: error.message || error });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SETUP ADMIN (temporary)
// ═══════════════════════════════════════════════════════════════════════════════
export const setupAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const email = 'admin@pillora.in';
        const password = 'admin';
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        await User.findOneAndUpdate(
            { email },
            { name: 'Super Admin', email, passwordHash, role: 'admin', status: 'approved' },
            { upsert: true, new: true }
        );

        console.log("Admin setup complete via API.");
        res.json({ message: "Admin Account Created Successfully! Login with admin@pillora.in / admin" });
    } catch (error: any) {
        console.error('Setup Admin Error:', error);
        res.status(500).json({ message: 'Setup Failed', error: error.message || error });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
export const changePassword = async (req: any, res: Response): Promise<void> => {
    const { newPassword } = req.body;
    const userId = req.user?.id;

    try {
        if (!newPassword || newPassword.length < 6) {
            res.status(400).json({ message: 'Password must be at least 6 characters long' });
            return;
        }

        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        user.isPasswordResetRequired = false;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating password', error: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD FLOW
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, portal } = req.body;

        if (!email || !portal || !['patient', 'hospital'].includes(portal)) {
            res.status(400).json({ message: 'Email and valid portal are required.' });
            return;
        }

        const successMessage = "If an account exists with this email address, we've sent a password reset link.";
        const normalizedEmail = email.trim().toLowerCase();

        // Check if user exists
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            // Always return success to prevent account enumeration
            res.status(200).json({ message: successMessage });
            return;
        }

        // Restrict based on role compatibility for security
        let isRoleAllowed = false;
        if (portal === 'hospital') {
            isRoleAllowed = ['hospital', 'admin'].includes(user.role);
        } else if (portal === 'patient') {
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

        // Invalidate active reset tokens for the same user
        await PasswordResetToken.updateMany({ userId: user._id, portal }, { used: true });

        // Save hashed token
        await PasswordResetToken.create({
            userId: user._id,
            email: normalizedEmail,
            portal,
            tokenHash,
            expiresAt,
            used: false
        });

        // Determine portal URL prefix
        let baseUrl = '';
        if (portal === 'patient') {
            baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://pillora.in';
        } else {
            baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : 'https://pillorahospital.in';
        }

        const resetLink = `${baseUrl}/reset-password?token=${token}`;

        // Send email
        await sendPasswordResetEmail({
            toEmail: normalizedEmail,
            name: user.name,
            resetLink
        });

        res.status(200).json({ message: successMessage });
    } catch (error: any) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message || error });
    }
};

// GET /api/auth/verify-reset-token
export const verifyResetToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.query;

        if (!token) {
            res.status(400).json({ valid: false, message: 'Token is required.' });
            return;
        }

        const tokenHash = crypto.createHash('sha256').update(token.toString()).digest('hex');

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
        console.error('Verify Reset Token Error:', error);
        res.status(500).json({ valid: false, message: 'Server Error', error: error.message || error });
    }
};

// POST /api/auth/reset-password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            res.status(400).json({ message: 'Token and password are required.' });
            return;
        }

        // Real password regex verification on backend
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/~`\-]).{8,}$/;
        if (!passwordRegex.test(password)) {
            res.status(400).json({
                message: 'Password must be at least 8 characters long, containing at least one uppercase letter, one lowercase letter, one number, and one special character.'
            });
            return;
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

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

        // Hash new password using bcryptjs
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(password, salt);
        user.isPasswordResetRequired = false;
        await user.save();

        // Mark current token as used
        resetToken.used = true;
        await resetToken.save();

        // Invalidate all other active reset tokens for this user
        await PasswordResetToken.updateMany(
            { userId: user._id, _id: { $ne: resetToken._id } },
            { used: true }
        );

        res.status(200).json({ message: 'Password has been updated successfully.' });
    } catch (error: any) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message || error });
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

        // Rate Limit Check: max 3 requests per 15 minutes per phone number
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        let record = await OtpVerification.findOne({ phoneNumber: cleanPhone });

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
        const otpValue = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute expiry

        if (record) {
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

        // Call WhatsApp Template Service
        const waResult = await sendWhatsAppTemplate(cleanPhone, 'login_otp', 'en', [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: otpValue }
                ]
            }
        ]);

        if (!waResult.success) {
            console.error('[PhoneAuth] Failed to send WhatsApp OTP:', waResult.error);
        } else {
            console.log(`[PhoneAuth] WhatsApp OTP sent successfully to ${cleanPhone}`);
        }

        // Return success response without exposing OTP
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
        const record = await OtpVerification.findOne({ phoneNumber: cleanPhone });

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

        if (record.otp !== otp.toString().trim()) {
            res.status(400).json({ success: false, message: 'Invalid verification code. Please check and try again.' });
            return;
        }

        // OTP verified successfully -> remove OTP record
        await OtpVerification.deleteOne({ _id: record._id });

        // Find user by phoneNumber or phone
        let user = await User.findOne({
            $or: [{ phoneNumber: cleanPhone }, { phone: cleanPhone }]
        });

        if (!user) {
            // Register new User
            const shortDigits = cleanPhone.slice(-4);
            user = await User.create({
                name: `Pillora User ${shortDigits}`,
                phoneNumber: cleanPhone,
                phone: cleanPhone,
                phoneVerified: true,
                role: 'customer',
                status: 'approved'
            });
            console.log(`[PhoneAuth] Registered new user for phone ${cleanPhone}`);
        } else {
            if (!user.phoneVerified || !user.phoneNumber) {
                user.phoneVerified = true;
                if (!user.phoneNumber) user.phoneNumber = cleanPhone;
                await user.save();
            }
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
        console.error('[PhoneAuth] verifyPhoneOtp error:', error.message || error);
        res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
    }
};


