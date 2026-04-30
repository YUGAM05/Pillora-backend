import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    name: string;
    email: string;
    passwordHash?: string; // Optional for Google OAuth users
    googleId?: string;
    profilePicture?: string;
    role: 'customer' | 'seller' | 'delivery' | 'admin';
    status: 'pending' | 'approved' | 'rejected';
    phone?: string;
    pharmacy_name?: string;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
    };
    otp?: string;
    otpExpiresAt?: Date;
    bankDetails?: {
        accountNumber: string;
        ifsc: string;
    };
    pharmacyCertificate?: string;
    location?: {
        lat: number;
        lng: number;
    };
    aadhaarNumber?: string;
    aadhaarCardUrl?: string;
    ownerPhotoUrl?: string;
    ownerPan?: string;
    panCardUrl?: string;
    businessPan?: string;
    
    businessType?: string;
    yearsInOperation?: number;
    
    retailDrugLicense?: string;
    drugLicenseNumber?: string;
    licenseExpiryDate?: Date;
    pharmacistCertificate?: string;
    
    gstNumber?: string;
    
    cancelledChequeUrl?: string;
    shopEstablishmentUrl?: string;
    rentAgreementUrl?: string;
    shopPhotoFrontUrl?: string;
    shopPhotoInsideUrl?: string;
    
    whatsappNumber?: string;
    alternateContact?: string;
    operatingHours?: string;
    
    agreedToTerms?: boolean;
    agreedToCompliance?: boolean;
    agreedToNoBannedDrugs?: boolean;
    selfDeclarationValidLicenses?: boolean;
    
    kyc_status?: 'Pending' | 'Verified' | 'Rejected';
    
    // Delivery Partner specific fields
    dob?: Date;
    gender?: string;
    aadhaarBackUrl?: string;
    vehicleType?: string;
    vehicleRegNumber?: string;
    dlNumber?: string;
    dlExpiryDate?: Date;
    dlFrontUrl?: string;
    dlBackUrl?: string;
    rcUrl?: string;
    insuranceUrl?: string;
    emergencyContactName?: string;
    emergencyContactNumber?: string;
    upiId?: string;
    preferredZones?: string[];
    availableHours?: string;
    daysAvailable?: string;
    employmentType?: string;
    noCriminalRecord?: boolean;
    policeVerificationUrl?: string;
    referenceContact?: string;
    agreedToGpsTracking?: boolean;
    agreedToHandleMeds?: boolean;
    acknowledgeSla?: boolean;
    consentBackgroundCheck?: boolean;

    // Admin MFA
    mfaSecret?: string;
    isMfaEnabled?: boolean;

    createdAt: Date;
}

const UserSchema: Schema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String }, // Not required for Google OAuth users
    googleId: { type: String, unique: true, sparse: true }, // Google OAuth ID
    profilePicture: { type: String }, // Profile picture URL from Google
    role: { type: String, enum: ['customer', 'seller', 'delivery', 'admin'], default: 'customer' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
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
        lng: { type: Number, default: 72.5714 }  // Default to Ahmedabad lng
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

export default mongoose.model<IUser>('User', UserSchema);
