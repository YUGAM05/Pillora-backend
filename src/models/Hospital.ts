import mongoose, { Schema, Document } from 'mongoose';

export interface IDoctor {
    name: string;
    specialization?: string;
    daysAvailable: string[];
    timing?: string;
}

export interface IHospital extends Document {
    name: string;
    address: string;
    city: string;
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
}

const DoctorSchema: Schema = new Schema({
    name: { type: String, required: true },
    specialization: { type: String, required: false },
    daysAvailable: [{ type: String }],
    timing: { type: String, required: false },
}, { _id: false });

const HospitalSchema: Schema = new Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
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
}, { timestamps: true });

export default mongoose.model<IHospital>('Hospital', HospitalSchema);
