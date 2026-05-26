import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
    appointmentId: mongoose.Types.ObjectId;
    hospitalId: mongoose.Types.ObjectId;
    patientName: string;
    amount: number;
    mode: 'online' | 'offline';
    status: 'pending' | 'paid';
    recordedBy: mongoose.Types.ObjectId; // ID of the hospital admin who recorded the payment
    createdAt: Date;
    updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true }, // one payment per appointment
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    mode: { type: String, enum: ['online', 'offline'], required: true },
    status: { type: String, enum: ['pending', 'paid'], default: 'paid' },
    recordedBy: { type: Schema.Types.ObjectId, required: true }
}, { timestamps: true });

export default mongoose.model<IPayment>('Payment', PaymentSchema);
