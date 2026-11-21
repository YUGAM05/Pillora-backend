import mongoose, { Schema, Document } from 'mongoose';

/**
 * Money a hospital owes Pillora because the hospital cancelled a paid online booking.
 *
 *   gateway_charge  - advance refunded before it was paid out: Razorpay keeps its 2% + GST (2.36%),
 *                     which Pillora lost, so that charge is taken from the hospital's next settlement.
 *   settled_refund  - advance had already been paid out to the hospital: Pillora refunded the patient
 *                     in full from its own balance, so the full advance is taken back.
 *
 * Pending deductions are subtracted from the next settlement (oldest first) and then marked applied.
 */
export interface IHospitalDeduction extends Document {
    hospitalId: mongoose.Types.ObjectId;
    appointmentId?: mongoose.Types.ObjectId;
    paymentId: mongoose.Types.ObjectId;
    type: 'gateway_charge' | 'settled_refund';
    amount: number; // INR
    refundAmount: number; // what the patient got back (INR)
    reason: string;
    patientName?: string;
    bookingRef?: string;
    status: 'pending' | 'applied' | 'waived';
    settlementId?: mongoose.Types.ObjectId;
    appliedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const HospitalDeductionSchema = new Schema<IHospitalDeduction>({
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    type: { type: String, enum: ['gateway_charge', 'settled_refund'], required: true },
    amount: { type: Number, required: true, min: 0 },
    refundAmount: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '' },
    patientName: { type: String },
    bookingRef: { type: String },
    status: { type: String, enum: ['pending', 'applied', 'waived'], default: 'pending', index: true },
    settlementId: { type: Schema.Types.ObjectId, ref: 'Settlement' },
    appliedAt: { type: Date }
}, { timestamps: true });

// One deduction per refunded payment, even if a cancellation is retried.
HospitalDeductionSchema.index({ paymentId: 1 }, { unique: true });

export default mongoose.model<IHospitalDeduction>('HospitalDeduction', HospitalDeductionSchema);
