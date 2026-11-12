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
exports.requestAccountDeactivation = exports.createHospitalSupportTicket = exports.getHospitalSupportTickets = exports.exportHospitalReport = exports.toggleTwoFactorAuth = exports.logoutAllDevices = exports.changeHospitalPassword = exports.getSecurityOverview = exports.updateNotificationPreferences = exports.updateHospitalBankSettings = exports.updateAppointmentSettings = exports.deleteStaffAccount = exports.updateStaffAccount = exports.addStaffAccount = exports.getHospitalStaffAndDoctors = exports.uploadHospitalLogo = exports.updateHospitalProfile = exports.getHospitalSettings = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const cloudinary_1 = require("cloudinary");
const HospitalSettings_1 = __importDefault(require("../models/HospitalSettings"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const User_1 = __importDefault(require("../models/User"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Payment_1 = __importDefault(require("../models/Payment"));
const Settlement_1 = __importDefault(require("../models/Settlement"));
const SupportTicket_1 = __importDefault(require("../models/SupportTicket"));
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
const LoginHistory_1 = __importDefault(require("../models/LoginHistory"));
const Session_1 = __importDefault(require("../models/Session"));
const Notification_1 = __importDefault(require("../models/Notification"));
const cryptoHelper_1 = require("../utils/cryptoHelper");
const subscriptionService_1 = require("../services/subscriptionService");
// Cloudinary config
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djlttfqje',
    api_key: process.env.CLOUDINARY_API_KEY || '372769319742221',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'JZ88aoet4iKXegIT19PKqDoL2nU',
});
// Helper: mask account number (e.g. •••• •••• 5678)
const maskAccountNumber = (acc) => {
    if (!acc)
        return '';
    const clean = acc.trim();
    if (clean.length <= 4)
        return clean;
    const last4 = clean.slice(-4);
    return `•••• •••• ${last4}`;
};
// Helper: safe decrypt bank details
const getSafeBankDetails = (bank) => {
    if (!bank)
        return null;
    const rawAcc = (0, cryptoHelper_1.decrypt)(bank.accountNumber || '');
    return {
        accountHolderName: (0, cryptoHelper_1.decrypt)(bank.accountHolderName || ''),
        bankName: (0, cryptoHelper_1.decrypt)(bank.bankName || ''),
        branchName: (0, cryptoHelper_1.decrypt)(bank.branchName || ''),
        accountNumberMasked: maskAccountNumber(rawAcc),
        rawAccountNumber: rawAcc,
        ifscCode: (0, cryptoHelper_1.decrypt)(bank.ifscCode || ''),
        upiId: (0, cryptoHelper_1.decrypt)(bank.upiId || '')
    };
};
/**
 * Helper to ensure a settings record exists for the hospital
 */
const getOrCreateHospitalSettings = (hospitalId) => __awaiter(void 0, void 0, void 0, function* () {
    let settings = yield HospitalSettings_1.default.findOne({ hospitalId });
    if (!settings) {
        settings = yield HospitalSettings_1.default.create({
            hospitalId,
            appointmentSettings: {
                isOnlineBookingEnabled: true,
                isOfflineBookingEnabled: true,
                defaultSlotDuration: 15,
                bufferTimeBetweenSlots: 5,
                maxAppointmentsPerSlot: 1,
                advanceBookingWindowDays: 30,
                minBookingNoticeHours: 1,
                allowSameDayBooking: true,
                cancellationPolicyHours: 2,
                reschedulePolicyHours: 2,
                weeklyHolidays: ['Sunday'],
                specialClosingDays: [],
                doctorOverrides: []
            },
            notificationPreferences: {
                newAppointment: { email: true, sms: true, whatsapp: true, inApp: true },
                appointmentCancellation: { email: true, sms: true, whatsapp: true, inApp: true },
                appointmentRescheduled: { email: true, sms: true, whatsapp: true, inApp: true },
                paymentReceived: { email: true, sms: false, whatsapp: true, inApp: true },
                patientArrival: { email: false, sms: false, whatsapp: true, inApp: true },
                doctorAvailability: { email: true, sms: false, whatsapp: true, inApp: true },
                dailySummary: { email: true, sms: false, whatsapp: true, inApp: true },
                settlementUpdates: { email: true, sms: true, whatsapp: true, inApp: true }
            },
            twoFactorAuthEnabled: false,
            exportHistory: []
        });
    }
    return settings;
});
// =========================================================================
// SECTION 1: GET ALL SETTINGS
// =========================================================================
const getHospitalSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        const sub = (0, subscriptionService_1.computeSubscriptionStatus)(hospital);
        const bank = getSafeBankDetails(hospital.bankDetails);
        // Security session count
        const activeSessionsCount = yield Session_1.default.countDocuments({
            adminId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            isRevoked: false,
            expiresAt: { $gt: new Date() }
        });
        // Recent Audit Logs
        const recentAuditLogs = yield AuditLog_1.default.find({ hospitalId: hospital._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        res.json({
            success: true,
            hospital: {
                _id: hospital._id,
                name: hospital.name,
                slug: hospital.slug,
                image: hospital.image || '',
                images: hospital.images || [],
                registrationNumber: hospital.registrationNumber || '',
                address: hospital.address || '',
                city: hospital.city || '',
                state: hospital.state || '',
                pincode: hospital.pincode || '',
                email: hospital.email || '',
                contactNumber: hospital.contactNumber || '',
                phoneNumbers: hospital.phoneNumbers || [],
                website: hospital.website || '',
                description: hospital.description || '',
                isOpen24Hours: Boolean(hospital.isOpen24Hours),
                operatingHours: hospital.operatingHours || '09:00 AM - 08:00 PM',
                ambulanceContact: hospital.ambulanceContact || '',
                consultationFee: hospital.consultationFee || 500,
                hospitalType: hospital.hospitalType || 'Private',
                bedCapacity: hospital.bedCapacity || 50,
                specialities: hospital.specialities || [],
                location: hospital.location || { lat: 23.0225, lng: 72.5714 },
                is_verified: Boolean(hospital.is_verified),
                plan: hospital.plan || 'Standard',
                management_type: hospital.management_type || 'SELF',
                trialEndDate: hospital.trialEndDate,
                bankDetails: bank ? {
                    accountHolderName: bank.accountHolderName,
                    bankName: bank.bankName,
                    branchName: bank.branchName,
                    accountNumberMasked: bank.accountNumberMasked,
                    ifscCode: bank.ifscCode,
                    upiId: bank.upiId,
                    verificationStatus: hospital.is_verified && bank.accountNumberMasked ? 'Verified' : 'Pending Verification'
                } : null
            },
            appointmentSettings: settings.appointmentSettings,
            notificationPreferences: settings.notificationPreferences,
            bankDetailsPendingApproval: settings.bankDetailsPendingApproval,
            security: {
                twoFactorAuthEnabled: Boolean(settings.twoFactorAuthEnabled),
                activeSessionsCount: Math.max(1, activeSessionsCount),
                lastLogin: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.lastLogin) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.updatedAt) || new Date()
            },
            subscription: {
                status: sub.status,
                plan: hospital.plan || 'Standard',
                isValid: sub.isValid,
                daysRemaining: sub.daysRemaining,
                expiryDate: hospital.subscriptionExpiryDate || sub.subscriptionExpiryDate,
                canGenerateSlots: sub.canGenerateSlots
            },
            deactivationRequest: settings.deactivationRequest || { requested: false },
            recentAuditLogs
        });
    }
    catch (error) {
        console.error('[GetHospitalSettingsError]', error);
        res.status(500).json({ message: 'Failed to retrieve hospital settings', error: error.message });
    }
});
exports.getHospitalSettings = getHospitalSettings;
// =========================================================================
// SECTION A: UPDATE HOSPITAL PROFILE
// =========================================================================
const updateHospitalProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const { name, registrationNumber, address, city, state, pincode, email, contactNumber, website, description, operatingHours, isOpen24Hours, ambulanceContact, consultationFee, bedCapacity, specialities, location } = req.body;
        if (!(name === null || name === void 0 ? void 0 : name.trim())) {
            res.status(400).json({ message: 'Hospital name is required' });
            return;
        }
        if (!(address === null || address === void 0 ? void 0 : address.trim()) || !(city === null || city === void 0 ? void 0 : city.trim())) {
            res.status(400).json({ message: 'Address and City are required' });
            return;
        }
        const changes = {};
        // If verified, verify whether legal name or registration number changed
        if (hospital.is_verified) {
            if (name && name.trim() !== hospital.name) {
                changes.nameChangeRequested = { from: hospital.name, to: name.trim() };
            }
            if (registrationNumber && registrationNumber.trim() !== (hospital.registrationNumber || '')) {
                changes.regNumChangeRequested = { from: hospital.registrationNumber, to: registrationNumber.trim() };
            }
        }
        // Apply updates
        hospital.name = name.trim();
        if (registrationNumber !== undefined)
            hospital.registrationNumber = registrationNumber.trim();
        hospital.address = address.trim();
        hospital.city = city.trim();
        if (state !== undefined)
            hospital.state = state.trim();
        if (pincode !== undefined)
            hospital.pincode = pincode.trim();
        if (email !== undefined)
            hospital.email = email.trim();
        if (contactNumber !== undefined)
            hospital.contactNumber = contactNumber.trim();
        if (website !== undefined)
            hospital.website = website.trim();
        if (description !== undefined)
            hospital.description = description.trim();
        if (operatingHours !== undefined)
            hospital.operatingHours = operatingHours.trim();
        if (isOpen24Hours !== undefined)
            hospital.isOpen24Hours = Boolean(isOpen24Hours);
        if (ambulanceContact !== undefined)
            hospital.ambulanceContact = ambulanceContact.trim();
        if (consultationFee !== undefined && !isNaN(Number(consultationFee))) {
            hospital.consultationFee = Number(consultationFee);
        }
        if (bedCapacity !== undefined && !isNaN(Number(bedCapacity))) {
            hospital.bedCapacity = Number(bedCapacity);
        }
        if (Array.isArray(specialities)) {
            hospital.specialities = specialities.map((s) => s.trim()).filter(Boolean);
        }
        if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
            hospital.location = { lat: location.lat, lng: location.lng };
        }
        yield hospital.save();
        // Audit Log
        yield AuditLog_1.default.create({
            action: 'HOSPITAL_PROFILE_UPDATED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { updatedFields: Object.keys(req.body) }
        });
        // Notify Admins if sensitive legal changes occurred on verified hospital
        if (Object.keys(changes).length > 0) {
            const admins = yield User_1.default.find({ role: 'admin' });
            for (const admin of admins) {
                yield Notification_1.default.create({
                    user: admin._id,
                    message: `Verified Hospital "${hospital.name}" updated legal details: ${Object.keys(changes).join(', ')}. Please review.`,
                    type: 'warning',
                    relatedId: hospital._id
                });
            }
        }
        res.json({
            success: true,
            message: 'Hospital profile updated successfully',
            hospital
        });
    }
    catch (error) {
        console.error('[UpdateHospitalProfileError]', error);
        res.status(500).json({ message: 'Failed to update hospital profile', error: error.message });
    }
});
exports.updateHospitalProfile = updateHospitalProfile;
// =========================================================================
// SECTION A: UPLOAD HOSPITAL LOGO
// =========================================================================
const uploadHospitalLogo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const file = req.file;
        if (!file) {
            res.status(400).json({ message: 'No image file uploaded' });
            return;
        }
        // Validate MIME type
        const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        if (!allowedMime.includes(file.mimetype)) {
            res.status(400).json({ message: 'Only JPG, PNG, WEBP, or SVG images are allowed' });
            return;
        }
        // Validate size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            res.status(400).json({ message: 'File size must be under 5MB' });
            return;
        }
        // Upload to Cloudinary
        const imageUrl = yield new Promise((resolve, reject) => {
            const stream = cloudinary_1.v2.uploader.upload_stream({ folder: 'hospitals/logos' }, (error, result) => {
                if (error)
                    reject(error);
                else
                    resolve(result.secure_url);
            });
            stream.end(file.buffer);
        });
        hospital.image = imageUrl;
        yield hospital.save();
        yield AuditLog_1.default.create({
            action: 'HOSPITAL_LOGO_UPDATED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { logoUrl: imageUrl }
        });
        res.json({
            success: true,
            message: 'Hospital logo uploaded successfully',
            imageUrl
        });
    }
    catch (error) {
        console.error('[UploadHospitalLogoError]', error);
        res.status(500).json({ message: 'Failed to upload hospital logo', error: error.message });
    }
});
exports.uploadHospitalLogo = uploadHospitalLogo;
// =========================================================================
// SECTION B: DOCTORS & STAFF MANAGEMENT
// =========================================================================
const getHospitalStaffAndDoctors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        // Doctors
        const doctors = yield Doctor_1.default.find({ hospital: hospital._id }).sort({ createdAt: -1 }).lean();
        // Staff Accounts (linked to this hospital or primary owner)
        const staffUsers = yield User_1.default.find({
            $or: [
                { hospitalId: hospital._id },
                { _id: hospital.user }
            ]
        }).select('name email phone phoneNumber role hospitalStaffRole isActiveStaff lastLogin createdAt').lean();
        const formattedStaff = staffUsers.map(u => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            phone: u.phoneNumber || u.phone,
            role: String(u._id) === String(hospital.user) ? 'owner' : (u.hospitalStaffRole || 'administrator'),
            isActive: u.isActiveStaff !== false,
            isOwner: String(u._id) === String(hospital.user),
            lastLogin: u.lastLogin || u.createdAt
        }));
        res.json({
            success: true,
            doctors,
            staff: formattedStaff
        });
    }
    catch (error) {
        console.error('[GetHospitalStaffError]', error);
        res.status(500).json({ message: 'Failed to retrieve staff and doctors', error: error.message });
    }
});
exports.getHospitalStaffAndDoctors = getHospitalStaffAndDoctors;
const addStaffAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const { name, email, phone, role, password } = req.body;
        if (!(name === null || name === void 0 ? void 0 : name.trim()) || !(email === null || email === void 0 ? void 0 : email.trim()) || !(password === null || password === void 0 ? void 0 : password.trim())) {
            res.status(400).json({ message: 'Name, Email, and Password are required' });
            return;
        }
        const validRoles = ['owner', 'administrator', 'receptionist', 'doctor', 'accounts'];
        const chosenRole = validRoles.includes(role) ? role : 'receptionist';
        // Check if user already exists
        const existing = yield User_1.default.findOne({ email: email.trim().toLowerCase() });
        if (existing) {
            res.status(400).json({ message: 'An account with this email already exists' });
            return;
        }
        const passwordHash = yield bcryptjs_1.default.hash(password.trim(), 10);
        const newStaff = yield User_1.default.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phoneNumber: phone === null || phone === void 0 ? void 0 : phone.trim(),
            phone: phone === null || phone === void 0 ? void 0 : phone.trim(),
            passwordHash,
            role: 'hospital',
            hospitalId: hospital._id,
            hospitalStaffRole: chosenRole,
            isActiveStaff: true,
            status: 'approved'
        });
        yield AuditLog_1.default.create({
            action: 'STAFF_ACCOUNT_CREATED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { staffId: newStaff._id, role: chosenRole, staffEmail: email }
        });
        res.status(201).json({
            success: true,
            message: `Staff member added as ${chosenRole}`,
            staff: {
                _id: newStaff._id,
                name: newStaff.name,
                email: newStaff.email,
                phone: newStaff.phoneNumber,
                role: chosenRole,
                isActive: true
            }
        });
    }
    catch (error) {
        console.error('[AddStaffAccountError]', error);
        res.status(500).json({ message: 'Failed to add staff account', error: error.message });
    }
});
exports.addStaffAccount = addStaffAccount;
const updateStaffAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        const { role, isActive, newPassword } = req.body;
        const staff = yield User_1.default.findOne({ _id: id, hospitalId: hospital._id });
        if (!staff) {
            res.status(404).json({ message: 'Staff account not found' });
            return;
        }
        if (role && ['owner', 'administrator', 'receptionist', 'doctor', 'accounts'].includes(role)) {
            staff.hospitalStaffRole = role;
        }
        if (isActive !== undefined) {
            staff.isActiveStaff = Boolean(isActive);
        }
        if (newPassword && newPassword.trim().length >= 6) {
            staff.passwordHash = yield bcryptjs_1.default.hash(newPassword.trim(), 10);
        }
        yield staff.save();
        yield AuditLog_1.default.create({
            action: 'STAFF_ACCOUNT_UPDATED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { staffId: staff._id, updatedFields: Object.keys(req.body) }
        });
        res.json({
            success: true,
            message: 'Staff account updated successfully',
            staff: {
                _id: staff._id,
                name: staff.name,
                email: staff.email,
                role: staff.hospitalStaffRole,
                isActive: staff.isActiveStaff
            }
        });
    }
    catch (error) {
        console.error('[UpdateStaffAccountError]', error);
        res.status(500).json({ message: 'Failed to update staff account', error: error.message });
    }
});
exports.updateStaffAccount = updateStaffAccount;
const deleteStaffAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        const { id } = req.params;
        if (String(id) === String(hospital.user)) {
            res.status(400).json({ message: 'Cannot remove the primary hospital owner account' });
            return;
        }
        const staff = yield User_1.default.findOneAndDelete({ _id: id, hospitalId: hospital._id });
        if (!staff) {
            res.status(404).json({ message: 'Staff account not found' });
            return;
        }
        yield AuditLog_1.default.create({
            action: 'STAFF_ACCOUNT_DELETED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { staffId: id, staffEmail: staff.email }
        });
        res.json({ success: true, message: 'Staff account removed successfully' });
    }
    catch (error) {
        console.error('[DeleteStaffAccountError]', error);
        res.status(500).json({ message: 'Failed to remove staff account', error: error.message });
    }
});
exports.deleteStaffAccount = deleteStaffAccount;
// =========================================================================
// SECTION C: APPOINTMENT SETTINGS
// =========================================================================
const updateAppointmentSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        const { isOnlineBookingEnabled, isOfflineBookingEnabled, defaultSlotDuration, bufferTimeBetweenSlots, maxAppointmentsPerSlot, advanceBookingWindowDays, minBookingNoticeHours, allowSameDayBooking, cancellationPolicyHours, reschedulePolicyHours, weeklyHolidays, specialClosingDays, doctorOverrides } = req.body;
        if (isOnlineBookingEnabled !== undefined) {
            settings.appointmentSettings.isOnlineBookingEnabled = Boolean(isOnlineBookingEnabled);
            hospital.isOnlinePaymentAvailable = Boolean(isOnlineBookingEnabled);
            yield hospital.save();
        }
        if (isOfflineBookingEnabled !== undefined) {
            settings.appointmentSettings.isOfflineBookingEnabled = Boolean(isOfflineBookingEnabled);
        }
        if ([10, 15, 20, 30].includes(Number(defaultSlotDuration))) {
            settings.appointmentSettings.defaultSlotDuration = Number(defaultSlotDuration);
        }
        if ([0, 5, 10, 15].includes(Number(bufferTimeBetweenSlots))) {
            settings.appointmentSettings.bufferTimeBetweenSlots = Number(bufferTimeBetweenSlots);
        }
        if (maxAppointmentsPerSlot !== undefined && Number(maxAppointmentsPerSlot) >= 1) {
            settings.appointmentSettings.maxAppointmentsPerSlot = Number(maxAppointmentsPerSlot);
        }
        if (advanceBookingWindowDays !== undefined && Number(advanceBookingWindowDays) >= 1) {
            settings.appointmentSettings.advanceBookingWindowDays = Number(advanceBookingWindowDays);
        }
        if (minBookingNoticeHours !== undefined && Number(minBookingNoticeHours) >= 0) {
            settings.appointmentSettings.minBookingNoticeHours = Number(minBookingNoticeHours);
        }
        if (allowSameDayBooking !== undefined) {
            settings.appointmentSettings.allowSameDayBooking = Boolean(allowSameDayBooking);
        }
        if (cancellationPolicyHours !== undefined) {
            settings.appointmentSettings.cancellationPolicyHours = Number(cancellationPolicyHours);
        }
        if (reschedulePolicyHours !== undefined) {
            settings.appointmentSettings.reschedulePolicyHours = Number(reschedulePolicyHours);
        }
        if (Array.isArray(weeklyHolidays)) {
            settings.appointmentSettings.weeklyHolidays = weeklyHolidays;
        }
        if (Array.isArray(specialClosingDays)) {
            settings.appointmentSettings.specialClosingDays = specialClosingDays.filter(d => d.date);
        }
        if (Array.isArray(doctorOverrides)) {
            settings.appointmentSettings.doctorOverrides = doctorOverrides;
        }
        yield settings.save();
        yield AuditLog_1.default.create({
            action: 'APPOINTMENT_SETTINGS_UPDATED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { settings: settings.appointmentSettings }
        });
        res.json({
            success: true,
            message: 'Appointment preferences saved successfully',
            appointmentSettings: settings.appointmentSettings
        });
    }
    catch (error) {
        console.error('[UpdateAppointmentSettingsError]', error);
        res.status(500).json({ message: 'Failed to update appointment settings', error: error.message });
    }
});
exports.updateAppointmentSettings = updateAppointmentSettings;
// =========================================================================
// SECTION D: PAYMENT & BANK SETTINGS
// =========================================================================
const updateHospitalBankSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const { accountHolderName, bankName, branchName, accountNumber, ifscCode, upiId } = req.body;
        if (!(accountHolderName === null || accountHolderName === void 0 ? void 0 : accountHolderName.trim()) || !(bankName === null || bankName === void 0 ? void 0 : bankName.trim()) || !(accountNumber === null || accountNumber === void 0 ? void 0 : accountNumber.trim()) || !(ifscCode === null || ifscCode === void 0 ? void 0 : ifscCode.trim())) {
            res.status(400).json({ message: 'Account Holder, Bank Name, Account Number, and IFSC are required' });
            return;
        }
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        // If hospital is verified, changes require Pillora Admin review
        if (hospital.is_verified) {
            settings.bankDetailsPendingApproval = {
                accountHolderName: accountHolderName.trim(),
                bankName: bankName.trim(),
                branchName: (branchName === null || branchName === void 0 ? void 0 : branchName.trim()) || '',
                accountNumber: accountNumber.trim(),
                ifscCode: ifscCode.trim().toUpperCase(),
                upiId: (upiId === null || upiId === void 0 ? void 0 : upiId.trim()) || '',
                requestedAt: new Date(),
                status: 'pending'
            };
            yield settings.save();
            // Notify Pillora Admins
            const admins = yield User_1.default.find({ role: 'admin' });
            for (const admin of admins) {
                yield Notification_1.default.create({
                    user: admin._id,
                    message: `Hospital "${hospital.name}" submitted a bank details update request (A/C ending in ${accountNumber.trim().slice(-4)}). Please review in Settlement Management.`,
                    type: 'info',
                    relatedId: hospital._id
                });
            }
            yield AuditLog_1.default.create({
                action: 'BANK_DETAILS_UPDATE_REQUESTED',
                hospitalId: hospital._id,
                userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
                email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
                ipAddress: req.ip || '127.0.0.1',
                status: 'success',
                details: { bankName, ifscCode: ifscCode.trim().toUpperCase(), maskedAccount: maskAccountNumber(accountNumber) }
            });
            res.json({
                success: true,
                message: 'Bank account update submitted for verification by Pillora Admin',
                pendingVerification: true
            });
            return;
        }
        // Direct update if new/unverified hospital
        hospital.bankDetails = {
            accountHolderName: (0, cryptoHelper_1.encrypt)(accountHolderName.trim()),
            bankName: (0, cryptoHelper_1.encrypt)(bankName.trim()),
            branchName: (0, cryptoHelper_1.encrypt)((branchName === null || branchName === void 0 ? void 0 : branchName.trim()) || ''),
            accountNumber: (0, cryptoHelper_1.encrypt)(accountNumber.trim()),
            ifscCode: (0, cryptoHelper_1.encrypt)(ifscCode.trim().toUpperCase()),
            upiId: (0, cryptoHelper_1.encrypt)((upiId === null || upiId === void 0 ? void 0 : upiId.trim()) || '')
        };
        yield hospital.save();
        yield AuditLog_1.default.create({
            action: 'BANK_DETAILS_UPDATED',
            hospitalId: hospital._id,
            userId: (_c = req.user) === null || _c === void 0 ? void 0 : _c._id,
            email: (_d = req.user) === null || _d === void 0 ? void 0 : _d.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { bankName, ifscCode: ifscCode.trim().toUpperCase(), maskedAccount: maskAccountNumber(accountNumber) }
        });
        res.json({
            success: true,
            message: 'Bank account configured successfully',
            bankDetails: {
                accountHolderName: accountHolderName.trim(),
                bankName: bankName.trim(),
                branchName: (branchName === null || branchName === void 0 ? void 0 : branchName.trim()) || '',
                accountNumberMasked: maskAccountNumber(accountNumber),
                ifscCode: ifscCode.trim().toUpperCase(),
                upiId: (upiId === null || upiId === void 0 ? void 0 : upiId.trim()) || ''
            }
        });
    }
    catch (error) {
        console.error('[UpdateHospitalBankSettingsError]', error);
        res.status(500).json({ message: 'Failed to update bank details', error: error.message });
    }
});
exports.updateHospitalBankSettings = updateHospitalBankSettings;
// =========================================================================
// SECTION E: NOTIFICATION PREFERENCES
// =========================================================================
const updateNotificationPreferences = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        const { preferences } = req.body;
        if (!preferences || typeof preferences !== 'object') {
            res.status(400).json({ message: 'Preferences payload is required' });
            return;
        }
        const eventKeys = [
            'newAppointment',
            'appointmentCancellation',
            'appointmentRescheduled',
            'paymentReceived',
            'patientArrival',
            'doctorAvailability',
            'dailySummary',
            'settlementUpdates'
        ];
        for (const k of eventKeys) {
            if (preferences[k]) {
                settings.notificationPreferences[k] = {
                    email: Boolean(preferences[k].email),
                    sms: Boolean(preferences[k].sms),
                    whatsapp: Boolean(preferences[k].whatsapp),
                    inApp: Boolean(preferences[k].inApp)
                };
            }
        }
        // Financial & settlement alerts are mandatory for compliance
        settings.notificationPreferences.settlementUpdates = {
            email: true,
            sms: true,
            whatsapp: true,
            inApp: true
        };
        yield settings.save();
        yield AuditLog_1.default.create({
            action: 'NOTIFICATION_PREFERENCES_UPDATED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { preferences: settings.notificationPreferences }
        });
        res.json({
            success: true,
            message: 'Notification preferences saved successfully',
            notificationPreferences: settings.notificationPreferences
        });
    }
    catch (error) {
        console.error('[UpdateNotificationPreferencesError]', error);
        res.status(500).json({ message: 'Failed to update notification preferences', error: error.message });
    }
});
exports.updateNotificationPreferences = updateNotificationPreferences;
// =========================================================================
// SECTION F: SECURITY & LOGIN SETTINGS
// =========================================================================
const getSecurityOverview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        const user = req.user;
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        const loginHistory = yield LoginHistory_1.default.find({ user: user === null || user === void 0 ? void 0 : user._id })
            .sort({ timestamp: -1 })
            .limit(10)
            .lean();
        const activeSessions = yield Session_1.default.find({
            adminId: user === null || user === void 0 ? void 0 : user._id,
            isRevoked: false,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 }).limit(5).lean();
        res.json({
            success: true,
            twoFactorAuthEnabled: Boolean(settings.twoFactorAuthEnabled),
            lastLogin: (user === null || user === void 0 ? void 0 : user.lastLogin) || (loginHistory[0] ? loginHistory[0].timestamp : new Date()),
            activeSessions: activeSessions.map(s => ({
                sessionId: s.sessionId,
                ipAddress: s.ipAddress,
                userAgent: s.userAgent,
                createdAt: s.createdAt,
                isCurrent: s.ipAddress === (req.ip || '127.0.0.1')
            })),
            loginHistory: loginHistory.map(l => ({
                _id: l._id,
                ipAddress: l.ipAddress,
                userAgent: l.userAgent,
                timestamp: l.timestamp
            }))
        });
    }
    catch (error) {
        console.error('[GetSecurityOverviewError]', error);
        res.status(500).json({ message: 'Failed to retrieve security settings', error: error.message });
    }
});
exports.getSecurityOverview = getSecurityOverview;
const changeHospitalPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { currentPassword, newPassword } = req.body;
        const user = yield User_1.default.findById((_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
        if (!user || !user.passwordHash) {
            res.status(404).json({ message: 'User account not found' });
            return;
        }
        if (!currentPassword || !newPassword) {
            res.status(400).json({ message: 'Current password and new password are required' });
            return;
        }
        const isMatch = yield bcryptjs_1.default.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            res.status(400).json({ message: 'Incorrect current password' });
            return;
        }
        if (newPassword.length < 8) {
            res.status(400).json({ message: 'New password must be at least 8 characters long' });
            return;
        }
        user.passwordHash = yield bcryptjs_1.default.hash(newPassword, 10);
        user.isPasswordResetRequired = false;
        yield user.save();
        // Revoke active sessions
        yield Session_1.default.updateMany({ adminId: user._id }, { isRevoked: true });
        yield AuditLog_1.default.create({
            action: 'PASSWORD_CHANGED',
            hospitalId: (_b = req.hospital) === null || _b === void 0 ? void 0 : _b._id,
            userId: user._id,
            email: user.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success'
        });
        res.json({
            success: true,
            message: 'Password changed successfully. Please keep your new password safe.'
        });
    }
    catch (error) {
        console.error('[ChangeHospitalPasswordError]', error);
        res.status(500).json({ message: 'Failed to change password', error: error.message });
    }
});
exports.changeHospitalPassword = changeHospitalPassword;
const logoutAllDevices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        yield Session_1.default.updateMany({ adminId: userId, isRevoked: false }, { isRevoked: true });
        yield AuditLog_1.default.create({
            action: 'ALL_SESSIONS_REVOKED',
            hospitalId: (_b = req.hospital) === null || _b === void 0 ? void 0 : _b._id,
            userId,
            email: (_c = req.user) === null || _c === void 0 ? void 0 : _c.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success'
        });
        res.json({ success: true, message: 'Successfully logged out from all other active devices' });
    }
    catch (error) {
        console.error('[LogoutAllDevicesError]', error);
        res.status(500).json({ message: 'Failed to revoke sessions', error: error.message });
    }
});
exports.logoutAllDevices = logoutAllDevices;
const toggleTwoFactorAuth = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        settings.twoFactorAuthEnabled = !settings.twoFactorAuthEnabled;
        yield settings.save();
        yield AuditLog_1.default.create({
            action: '2FA_TOGGLED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { enabled: settings.twoFactorAuthEnabled }
        });
        res.json({
            success: true,
            twoFactorAuthEnabled: settings.twoFactorAuthEnabled,
            message: settings.twoFactorAuthEnabled ? 'Two-Factor Authentication enabled' : 'Two-Factor Authentication disabled'
        });
    }
    catch (error) {
        console.error('[Toggle2FAError]', error);
        res.status(500).json({ message: 'Failed to update 2FA status', error: error.message });
    }
});
exports.toggleTwoFactorAuth = toggleTwoFactorAuth;
// =========================================================================
// SECTION G: REPORTS & DATA MANAGEMENT (CSV EXPORTS)
// =========================================================================
const exportHospitalReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const hospital = req.hospital;
        const { type = 'appointments', startDate, endDate } = req.query;
        const dateQuery = {};
        if (startDate && endDate) {
            dateQuery.createdAt = {
                $gte: new Date(String(startDate)),
                $lte: new Date(new Date(String(endDate)).setHours(23, 59, 59, 999))
            };
        }
        let csvContent = '';
        let filename = `pillora-${type}-${Date.now()}.csv`;
        let recordCount = 0;
        if (type === 'appointments') {
            const appts = yield Appointment_1.default.find(Object.assign({ hospital: hospital._id }, dateQuery))
                .populate('doctor', 'name specialty')
                .sort({ createdAt: -1 })
                .lean();
            recordCount = appts.length;
            const headers = ['Token Number', 'Patient Name', 'Phone', 'Doctor', 'Specialty', 'Slot Time', 'Consultation Fee', 'Status', 'Payment Status', 'Booked On'];
            const rows = appts.map(a => {
                var _a, _b;
                return [
                    `"${a.tokenNumber || 'N/A'}"`,
                    `"${a.patientName || 'Patient'}"`,
                    `"${a.patientPhone || 'N/A'}"`,
                    `"${((_a = a.doctor) === null || _a === void 0 ? void 0 : _a.name) || 'Doctor'}"`,
                    `"${((_b = a.doctor) === null || _b === void 0 ? void 0 : _b.specialty) || 'General'}"`,
                    `"${a.slotTime ? new Date(a.slotTime).toLocaleString('en-IN') : 'N/A'}"`,
                    `"${a.consultationFee || 500}"`,
                    `"${a.status || 'confirmed'}"`,
                    `"${a.paymentStatus || 'unpaid'}"`,
                    `"${new Date(a.createdAt).toLocaleDateString('en-IN')}"`
                ];
            });
            csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        }
        else if (type === 'payments') {
            const payments = yield Payment_1.default.find(Object.assign({ hospitalId: hospital._id }, dateQuery))
                .sort({ createdAt: -1 })
                .lean();
            recordCount = payments.length;
            const headers = ['Transaction ID', 'Razorpay Payment ID', 'Amount (INR)', 'Payment Source', 'Payment Mode', 'Settlement Status', 'Patient Name', 'Date'];
            const rows = payments.map(p => [
                `"${p.transactionId || p._id}"`,
                `"${p.razorpayPaymentId || 'N/A'}"`,
                `"${p.amount || 0}"`,
                `"${p.paymentSource || 'clinic_cash'}"`,
                `"${p.mode || 'offline'}"`,
                `"${p.settlementStatus || 'N/A'}"`,
                `"${p.patientName || 'N/A'}"`,
                `"${new Date(p.createdAt).toLocaleString('en-IN')}"`
            ]);
            csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        }
        else if (type === 'doctors') {
            const doctors = yield Doctor_1.default.find({ hospital: hospital._id }).lean();
            recordCount = doctors.length;
            const headers = ['Doctor Name', 'Specialty', 'Department', 'Consultation Fee', 'Days Available', 'Status'];
            const rows = doctors.map(d => [
                `"${d.name}"`,
                `"${d.specialty || 'General'}"`,
                `"${d.department || 'General'}"`,
                `"${d.fee || 500}"`,
                `"${(d.availability || []).map(a => a.day).join('; ') || 'All Days'}"`,
                `"${d.is_active ? 'Active' : 'Inactive'}"`
            ]);
            csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        }
        else if (type === 'settlements') {
            const settlements = yield Settlement_1.default.find({ hospitalId: hospital._id }).sort({ createdAt: -1 }).lean();
            recordCount = settlements.length;
            const headers = ['Settlement ID', 'Period Range', 'Online Advances Count', 'Gross Collection', 'Gateway Charges', 'Net Transferred', 'Transfer Method', 'UTR Number', 'Status', 'Date'];
            const rows = settlements.map(s => [
                `"${s.settlementId}"`,
                `"${s.startDate && s.endDate ? `${new Date(s.startDate).toLocaleDateString('en-IN')} - ${new Date(s.endDate).toLocaleDateString('en-IN')}` : 'N/A'}"`,
                `"${s.advanceCount || 0}"`,
                `"${s.grossCollection || 0}"`,
                `"${((s.razorpayCharges || 0) + (s.gstCharges || 0)).toFixed(2)}"`,
                `"${s.netAmount || 0}"`,
                `"${s.transferMethod || 'NEFT'}"`,
                `"${s.utrNumber || 'N/A'}"`,
                `"${s.status || 'Pending'}"`,
                `"${new Date(s.transferDate || s.createdAt).toLocaleDateString('en-IN')}"`
            ]);
            csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        }
        else {
            res.status(400).json({ message: 'Invalid export type requested' });
            return;
        }
        // Log export history
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        settings.exportHistory.unshift({
            exportType: String(type),
            format: 'csv',
            recordCount,
            requestedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || 'Hospital Admin',
            createdAt: new Date()
        });
        if (settings.exportHistory.length > 20) {
            settings.exportHistory = settings.exportHistory.slice(0, 20);
        }
        yield settings.save();
        yield AuditLog_1.default.create({
            action: 'DATA_EXPORT_GENERATED',
            hospitalId: hospital._id,
            userId: (_c = req.user) === null || _c === void 0 ? void 0 : _c._id,
            email: (_d = req.user) === null || _d === void 0 ? void 0 : _d.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { exportType: type, recordCount }
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(csvContent);
    }
    catch (error) {
        console.error('[ExportHospitalReportError]', error);
        res.status(500).json({ message: 'Failed to generate export report', error: error.message });
    }
});
exports.exportHospitalReport = exportHospitalReport;
// =========================================================================
// SECTION H: SUPPORT TICKETS & ACCOUNT MANAGEMENT
// =========================================================================
const getHospitalSupportTickets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const hospital = req.hospital;
        const tickets = yield SupportTicket_1.default.find({
            $or: [
                { hospitalId: hospital._id },
                { userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id }
            ]
        }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, tickets });
    }
    catch (error) {
        console.error('[GetHospitalSupportTicketsError]', error);
        res.status(500).json({ message: 'Failed to retrieve support tickets', error: error.message });
    }
});
exports.getHospitalSupportTickets = getHospitalSupportTickets;
const createHospitalSupportTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const hospital = req.hospital;
        const { subject, message, category, priority = 'Medium', attachmentUrl } = req.body;
        if (!(subject === null || subject === void 0 ? void 0 : subject.trim()) || !(message === null || message === void 0 ? void 0 : message.trim())) {
            res.status(400).json({ message: 'Subject and message description are required' });
            return;
        }
        const ticket = yield SupportTicket_1.default.create({
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            hospitalId: hospital._id,
            guestName: hospital.name,
            guestEmail: hospital.email || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email),
            guestPhone: hospital.contactNumber || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.phoneNumber),
            subject: subject.trim(),
            message: message.trim(),
            category: category || 'General Support',
            type: category || 'General Support',
            priority: ['Low', 'Medium', 'High', 'Urgent'].includes(priority) ? priority : 'Medium',
            attachmentUrl: attachmentUrl || '',
            status: 'Open'
        });
        // Notify Pillora Admins
        const admins = yield User_1.default.find({ role: 'admin' });
        for (const admin of admins) {
            yield Notification_1.default.create({
                user: admin._id,
                message: `New support ticket from "${hospital.name}": ${subject.trim()} (${priority} priority)`,
                type: 'info',
                relatedId: ticket._id
            });
        }
        yield AuditLog_1.default.create({
            action: 'SUPPORT_TICKET_CREATED',
            hospitalId: hospital._id,
            userId: (_d = req.user) === null || _d === void 0 ? void 0 : _d._id,
            email: (_e = req.user) === null || _e === void 0 ? void 0 : _e.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { ticketId: ticket._id, subject }
        });
        res.status(201).json({
            success: true,
            message: 'Support ticket submitted successfully. Our team will get back to you shortly.',
            ticket
        });
    }
    catch (error) {
        console.error('[CreateHospitalSupportTicketError]', error);
        res.status(500).json({ message: 'Failed to create support ticket', error: error.message });
    }
});
exports.createHospitalSupportTicket = createHospitalSupportTicket;
const requestAccountDeactivation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const hospital = req.hospital;
        const { reason } = req.body;
        if (!(reason === null || reason === void 0 ? void 0 : reason.trim())) {
            res.status(400).json({ message: 'Please provide a reason for account closure request' });
            return;
        }
        const settings = yield getOrCreateHospitalSettings(hospital._id);
        settings.deactivationRequest = {
            requested: true,
            reason: reason.trim(),
            requestedAt: new Date(),
            status: 'pending'
        };
        yield settings.save();
        // Notify Pillora Admins
        const admins = yield User_1.default.find({ role: 'admin' });
        for (const admin of admins) {
            yield Notification_1.default.create({
                user: admin._id,
                message: `Account Deactivation Request submitted by "${hospital.name}". Reason: ${reason.trim()}`,
                type: 'warning',
                relatedId: hospital._id
            });
        }
        yield AuditLog_1.default.create({
            action: 'ACCOUNT_DEACTIVATION_REQUESTED',
            hospitalId: hospital._id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            email: (_b = req.user) === null || _b === void 0 ? void 0 : _b.email,
            ipAddress: req.ip || '127.0.0.1',
            status: 'success',
            details: { reason }
        });
        res.json({
            success: true,
            message: 'Your account deactivation request has been received by Pillora Admin. Our team will review your account and settlement clearance before final deactivation.',
            deactivationRequest: settings.deactivationRequest
        });
    }
    catch (error) {
        console.error('[RequestAccountDeactivationError]', error);
        res.status(500).json({ message: 'Failed to submit deactivation request', error: error.message });
    }
});
exports.requestAccountDeactivation = requestAccountDeactivation;
