import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
    appointmentId: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
    hospitalId: mongoose.Types.ObjectId;
    patientName?: string;
    amount: number; // For backward compatibility / manual payments
    consultationFee?: number;
    advanceFee?: number;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    mode?: 'online' | 'offline';
    status: 'pending' | 'completed' | 'failed' | 'refund_initiated' | 'refunded' | 'paid';
    recordedBy?: mongoose.Types.ObjectId; // ID of the hospital admin who recorded the payment
    createdAt: Date;
    updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true }, // one payment per appointment
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientName: { type: String, required: false },
    amount: { type: Number, required: true, min: 0 },
    consultationFee: { type: Number, required: false },
    advanceFee: { type: Number, required: false },
    razorpayOrderId: { type: String, required: false },
    razorpayPaymentId: { type: String, required: false },
    mode: { type: String, enum: ['online', 'offline'], required: false, default: 'online' },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refund_initiated', 'refunded', 'paid'], 
        default: 'pending' 
    },
    recordedBy: { type: Schema.Types.ObjectId, required: false }
}, { timestamps: true });

export default mongoose.model<IPayment>('Payment', PaymentSchema);
