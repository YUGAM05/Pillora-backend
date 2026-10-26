import mongoose, { Schema, Document } from 'mongoose';

export interface IHospitalSubscriptionPayment extends Document {
    hospital: mongoose.Types.ObjectId;
    paymentDate: Date;
    amount: number;
    paymentMethod: 'UPI' | 'Bank Transfer' | 'Cash' | 'Card' | 'Cheque' | 'Other';
    transactionReference?: string;
    adminNotes?: string;
    subscriptionStartDate: Date;
    subscriptionExpiryDate: Date;
    recordedBy?: mongoose.Types.ObjectId;
    paymentType: 'initial' | 'renewal';
    createdAt: Date;
    updatedAt: Date;
}

const HospitalSubscriptionPaymentSchema = new Schema({
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    paymentDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { 
        type: String, 
        required: true,
        enum: ['UPI', 'Bank Transfer', 'Cash', 'Card', 'Cheque', 'Other'],
        default: 'UPI' 
    },
    transactionReference: { type: String, trim: true, default: '' },
    adminNotes: { type: String, trim: true, default: '' },
    subscriptionStartDate: { type: Date, required: true },
    subscriptionExpiryDate: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paymentType: { type: String, enum: ['initial', 'renewal'], default: 'initial' }
}, { timestamps: true });

HospitalSubscriptionPaymentSchema.index({ hospital: 1, paymentDate: -1 });

export default mongoose.model<IHospitalSubscriptionPayment>('HospitalSubscriptionPayment', HospitalSubscriptionPaymentSchema);
