import mongoose, { Schema, Document } from 'mongoose';

export interface IDonor extends Document {
    donor_name?: string;
    blood_group?: string;
    name?: string;
    bloodGroup?: string;
    age?: number;
    gender?: string;
    phone?: string;
    donor_phone?: string;
    city: string;
    area: string;
    fullAddress?: string;
    isAvailable?: boolean;
    registeredAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

const DonorSchema: Schema = new Schema({
    donor_name: { type: String, required: false },
    blood_group: { type: String, required: false },
    name: { type: String },
    bloodGroup: { type: String },
    age: { type: Number },
    gender: { type: String },
    phone: { type: String },
    donor_phone: { type: String, required: false },
    city: { type: String, required: true },
    area: { type: String, required: true },
    fullAddress: { type: String },
    isAvailable: { type: Boolean, default: true },
    registeredAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model<IDonor>('Donor', DonorSchema);
