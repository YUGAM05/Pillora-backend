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
    tempPassword: { type: String },
}, { timestamps: true });

export default mongoose.model<IHospital>('Hospital', HospitalSchema);
