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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const UserSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String }, // Not required for Google OAuth users
    googleId: { type: String, unique: true, sparse: true }, // Google OAuth ID
    profilePicture: { type: String }, // Profile picture URL from Google
    role: { type: String, enum: ['customer', 'seller', 'delivery', 'admin', 'hospital'], default: 'customer' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
    isPasswordResetRequired: { type: Boolean, default: false },
    phone: { type: String },
    pharmacy_name: { type: String },
    address: {
        street: String,
        city: String,
        state: String,
        zip: String
    },
    otp: { type: String },
    otpExpiresAt: { type: Date },
    bankDetails: {
        accountNumber: String,
        ifsc: String
    },
    pharmacyCertificate: { type: String },
    location: {
        lat: { type: Number, default: 23.0225 }, // Default to Ahmedabad lat
        lng: { type: Number, default: 72.5714 } // Default to Ahmedabad lng
    },
    kyc_status: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' },
    aadhaarNumber: { type: String, sparse: true },
    aadhaarCardUrl: { type: String },
    ownerPhotoUrl: { type: String },
    ownerPan: { type: String },
    panCardUrl: { type: String },
    businessPan: { type: String },
    businessType: { type: String },
    yearsInOperation: { type: Number },
    retailDrugLicense: { type: String },
    drugLicenseNumber: { type: String },
    licenseExpiryDate: { type: Date },
    pharmacistCertificate: { type: String },
    gstNumber: { type: String },
    cancelledChequeUrl: { type: String },
    shopEstablishmentUrl: { type: String },
    rentAgreementUrl: { type: String },
    shopPhotoFrontUrl: { type: String },
    shopPhotoInsideUrl: { type: String },
    whatsappNumber: { type: String },
    alternateContact: { type: String },
    operatingHours: { type: String },
    agreedToTerms: { type: Boolean },
    agreedToCompliance: { type: Boolean },
    agreedToNoBannedDrugs: { type: Boolean },
    selfDeclarationValidLicenses: { type: Boolean },
    // Delivery Partner specific fields
    dob: { type: Date },
    gender: { type: String },
    aadhaarBackUrl: { type: String },
    vehicleType: { type: String },
    vehicleRegNumber: { type: String },
    dlNumber: { type: String },
    dlExpiryDate: { type: Date },
    dlFrontUrl: { type: String },
    dlBackUrl: { type: String },
    rcUrl: { type: String },
    insuranceUrl: { type: String },
    emergencyContactName: { type: String },
    emergencyContactNumber: { type: String },
    upiId: { type: String },
    preferredZones: [{ type: String }],
    availableHours: { type: String },
    daysAvailable: { type: String },
    employmentType: { type: String },
    noCriminalRecord: { type: Boolean },
    policeVerificationUrl: { type: String },
    referenceContact: { type: String },
    agreedToGpsTracking: { type: Boolean },
    agreedToHandleMeds: { type: Boolean },
    acknowledgeSla: { type: Boolean },
    consentBackgroundCheck: { type: Boolean },
    // Admin MFA
    mfaSecret: { type: String },
    isMfaEnabled: { type: Boolean, default: false }
}, { timestamps: true });
exports.default = mongoose_1.default.model('User', UserSchema);
