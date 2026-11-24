import mongoose, { Schema, Document } from 'mongoose';

export interface IDoctor {
    name: string;
    specialization?: string;
    daysAvailable: string[];
    timing?: string;
}

export interface IHospital extends Document {
    name: string;
    slug: string;
    address: string;
    city: string;
    email?: string;
    image?: string;
    images?: string[];
    isOpen24Hours: boolean;
    consultationFee: number;
    governmentSchemes: string[];
    isOnlinePaymentAvailable: boolean;
    ambulanceContact: string;
    contactNumber?: string;
    phoneNumbers?: string[];
    description: string;
    rating: number;
    registrationNumber?: string;
    state?: string;
    pincode?: string;
    website?: string;
    operatingHours?: string;
    location?: {
        lat: number;
        lng: number;
    };
    doctors?: IDoctor[];
    management_type: 'SELF' | 'PILLORA';
    is_verified: boolean;
    plan: 'Standard' | 'Premium' | 'Enterprise';
    is_featured: boolean;
    has_govt_schemes: boolean;
    has_custom_page: boolean;
    is_spotlight: boolean;
    priority_support: boolean;
    user?: mongoose.Types.ObjectId;
    tempPassword?: string;
    /** Internal/test hospital (e.g. the voice demo): hidden from public listings and pages. */
    isTest?: boolean;
    hospitalType?: 'Government' | 'Private' | 'Trust' | 'Charitable';
    bedCapacity?: number;
    specialities?: string[];
    trialEndDate?: Date;
    // 30-Day Subscription & Payment Cycle Fields
    joiningDate?: Date;
    subscriptionDurationDays?: number;
    paymentStatus?: 'Pending' | 'Paid';
    subscriptionStatus?: 'Pending' | 'Active' | 'Expiring Soon' | 'Expired';
    lastPaymentDate?: Date;
    subscriptionStartDate?: Date;
    subscriptionExpiryDate?: Date;
    lastPaymentAmount?: number;
    lastPaymentMethod?: string;
    lastPaymentReference?: string;
    adminNotes?: string;
    createdAt?: Date;
    updatedAt?: Date;
    /** AI phone receptionist settings (hospital dashboard Settings, or Pillora admin). */
    aiReceptionist?: {
        /** Hospital name as the AI should say it, in Gujarati script (or Latin). */
        spokenNameGu?: string;
        /** Hospital name as the AI should say it, in Hindi/Devanagari script (or Latin). */
        spokenNameHi?: string;
        /** Language the AI greets callers in; it still follows the caller's language. */
        firstLanguage?: 'gu' | 'hi';
        /** Facts for the AI: address, timings, fees, services... (max AI_INFO_MAX chars). */
        info?: string;
        updatedAt?: Date;
        updatedBy?: mongoose.Types.ObjectId;
    };
    bankDetails?: {
        accountHolderName?: string;
        bankName?: string;
        branchName?: string;
        accountNumber?: string;
        ifscCode?: string;
        upiId?: string;
    };
}

const DoctorSchema: Schema = new Schema({
    name: { type: String, required: true },
    specialization: { type: String, required: false },
    daysAvailable: [{ type: String }],
    timing: { type: String, required: false },
}, { _id: false });

const HospitalSchema: Schema = new Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, trim: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    email: { type: String, required: false },
    image: { type: String, required: false },
    images: [{ type: String }],
    isOpen24Hours: { type: Boolean, default: false },
    consultationFee: { type: Number, required: true },
    governmentSchemes: [{ type: String }],
    isOnlinePaymentAvailable: { type: Boolean, default: true },
    ambulanceContact: { type: String, required: false },
    contactNumber: { type: String, required: false },
    phoneNumbers: [{ type: String }],
    description: { type: String },
    rating: { type: Number, default: 0 },
    registrationNumber: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    website: { type: String, default: '' },
    operatingHours: { type: String, default: '09:00 AM - 08:00 PM' },
    location: {
        lat: { type: Number, default: 23.0225 },
        lng: { type: Number, default: 72.5714 }
    },
    doctors: [DoctorSchema],
    management_type: { type: String, enum: ['SELF', 'PILLORA'], default: 'SELF' },
    is_verified: { type: Boolean, default: false },
    plan: { 
        type: String, 
        enum: ['Standard', 'Premium', 'Enterprise'], 
        default: 'Standard' 
    },
    // Plan Benefits
    is_featured: { type: Boolean, default: false }, // For "Top of Search"
    has_govt_schemes: { type: Boolean, default: false }, // For "Government Schemes Tag"
    has_custom_page: { type: Boolean, default: false }, // For "Custom landing page"
    is_spotlight: { type: Boolean, default: false }, // For "Homepage banner & spotlight"
    priority_support: { type: Boolean, default: false },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    // Never returned unless a query asks for it with .select('+tempPassword') (audit B-08/ADM-11)
    tempPassword: { type: String, select: false },
    isTest: { type: Boolean, default: false },
    hospitalType: { type: String, enum: ['Government', 'Private', 'Trust', 'Charitable'], default: 'Private' },
    bedCapacity: { type: Number, default: 50 },
    specialities: [{ type: String }],
    trialEndDate: { type: Date },
    // 30-Day Subscription & Payment Cycle Schema Fields
    joiningDate: { type: Date, default: Date.now },
    subscriptionDurationDays: { type: Number, default: 30 },
    paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    subscriptionStatus: { 
        type: String, 
        enum: ['Pending', 'Active', 'Expiring Soon', 'Expired'], 
        default: 'Pending' 
    },
    lastPaymentDate: { type: Date },
    subscriptionStartDate: { type: Date },
    subscriptionExpiryDate: { type: Date },
    lastPaymentAmount: { type: Number },
    lastPaymentMethod: { type: String },
    lastPaymentReference: { type: String },
    adminNotes: { type: String },
    // AI phone receptionist settings (see utils/aiReceptionist.ts for limits)
    aiReceptionist: {
        spokenNameGu: { type: String, default: '' },
        spokenNameHi: { type: String, default: '' },
        firstLanguage: { type: String, enum: ['gu', 'hi'], default: 'gu' },
        info: { type: String, default: '' },
        updatedAt: { type: Date },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    bankDetails: {
        accountHolderName: { type: String, default: '' },
        bankName: { type: String, default: '' },
        branchName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        ifscCode: { type: String, default: '' },
        upiId: { type: String, default: '' }
    }
}, { timestamps: true });

export default mongoose.model<IHospital>('Hospital', HospitalSchema);
