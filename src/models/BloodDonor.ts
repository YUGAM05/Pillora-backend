import mongoose, { Schema, Document } from 'mongoose';

export interface IBloodDonor extends Document {
    user?: mongoose.Types.ObjectId;
    name: string;
    email?: string;
    bloodGroup: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
    age: number;
    phone: string;
    gender: 'Male' | 'Female' | 'Other';
    address: string;
    area: string;
    city: string;
    lastDonationDate?: Date;
    isAvailable: boolean;
    source?: 'user_panel' | 'google_form';
    location: {
        type: string;
        coordinates: number[]; // [longitude, latitude]
    };
    createdAt: Date;
    updatedAt: Date;
}

const BloodDonorSchema: Schema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    name: { type: String, required: true },
    email: { type: String, required: false },
    bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        required: true
    },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    age: { type: Number, required: true },
    phone: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    area: { type: String, required: true },
    city: { type: String, required: true },
    lastDonationDate: { type: Date },
    isAvailable: { type: Boolean, default: true },
    source: { type: String, enum: ['user_panel', 'google_form'], default: 'user_panel' },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], index: '2dsphere' }
    }
}, { timestamps: true });

export default mongoose.model<IBloodDonor>('BloodDonor', BloodDonorSchema);
