import mongoose, { Schema, Document } from 'mongoose';

export interface IRefund extends Document {
    refundId: string; // REF-YYYYMMDD-XXXX
    appointmentId: mongoose.Types.ObjectId;
    paymentId: mongoose.Types.ObjectId;
    hospitalId: mongoose.Types.ObjectId;
    patientId?: mongoose.Types.ObjectId;
    amount: number; // in INR
    amountInPaise: number;
    reason: string;
    gatewayRefundId?: string;
    status: 'pending' | 'processed' | 'failed';
    initiatedBy: mongoose.Types.ObjectId;
    processedAt?: Date;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const RefundSchema: Schema = new Schema({
    refundId: { type: String, required: true, unique: true, index: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true, min: 0 },
    amountInPaise: { type: Number, required: true },
    reason: { type: String, required: true },
    gatewayRefundId: { type: String, index: true },
    status: { 
        type: String, 
        enum: ['pending', 'processed', 'failed'], 
        default: 'pending',
        index: true
    },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    processedAt: { type: Date },
    notes: { type: String }
}, { timestamps: true });

export default mongoose.model<IRefund>('Refund', RefundSchema);

