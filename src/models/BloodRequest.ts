import mongoose, { Schema, Document } from 'mongoose';

export interface IBloodRequest extends Document {
    user: mongoose.Types.ObjectId;
    patientName: string;
    age: number;
    bloodGroup: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
    units: number;
    hospitalAddress: string;
    area: string;
    city: string;
    contactNumber: string;
    reason?: string;
    status: 'Open' | 'Fulfilled' | 'Urgent' | 'Closed' | 'Fake' | 'pending' | 'matched' | 'no_donor_found';
    isUrgent: boolean;
    kycDocumentType: 'Aadhar Card' | 'PAN Card' | 'Driving License';
    kycDocumentId?: string;
    kycDocumentImage?: string;
    aiVerificationStatus: 'Pending' | 'Verified' | 'Rejected' | 'Error';
    aiVerificationRemarks?: string;
    unitsNeeded?: number;
    coordinationNumber?: string;
    email?: string;
    kycStatus?: 'pending' | 'verified' | 'failed';
    kycVerifiedAt?: Date;
}

const BloodRequestSchema: Schema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, required: true },
    age: { type: Number, required: true },
    bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        required: true
    },
    units: { type: Number, required: true, default: 1 },
    hospitalAddress: { type: String, required: true },
    area: { type: String, required: true },
    city: { type: String, required: true },
    contactNumber: { type: String, required: true }, // Person to contact
    reason: { type: String },
    status: {
        type: String,
        enum: ['Open', 'Fulfilled', 'Urgent', 'Closed', 'Fake', 'pending', 'matched', 'no_donor_found'],
        default: 'Open'
    },
    isUrgent: { type: Boolean, default: false },
    kycDocumentType: {
        type: String,
        enum: ['Aadhar Card', 'PAN Card', 'Driving License'],
        required: true
    },
    kycDocumentId: { type: String, required: false },
    kycDocumentImage: { type: String, required: false },
    aiVerificationStatus: {
        type: String,
        enum: ['Pending', 'Verified', 'Rejected', 'Error'],
        default: 'Pending'
    },
    aiVerificationRemarks: { type: String },
    unitsNeeded: { type: Number },
    coordinationNumber: { type: String },
    email: { type: String },
    kycStatus: {
        type: String,
        enum: ['pending', 'verified', 'failed'],
        default: 'pending'
    },
    kycVerifiedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model<IBloodRequest>('BloodRequest', BloodRequestSchema);
