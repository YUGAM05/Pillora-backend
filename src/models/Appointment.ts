import mongoose, { Schema, Document } from 'mongoose';

export interface IAppointment extends Document {
    patient: mongoose.Types.ObjectId;
    doctor: mongoose.Types.ObjectId;
    hospital: mongoose.Types.ObjectId;
    slot: mongoose.Types.ObjectId;
    slotTime: Date;
    status: 'pending' | 'confirmed' | 'checked-in' | 'in-consultation' | 'completed' | 'cancelled';
    // Payment status enum — forward-compatible with gateway integration.
    // 'pending' kept as legacy alias for 'unpaid' (existing documents remain valid).
    // 'failed' kept for legacy compatibility.
    // paymentSource distinguishes manual staff entry from future gateway webhooks.
    paymentStatus: 'unpaid' | 'paid' | 'waived' | 'pending' | 'failed';
    paymentSource: 'manual' | 'gateway';
    paymentUpdatedAt?: Date;
    paymentUpdatedBy?: mongoose.Types.ObjectId;
    bookingDate: Date;
    notes?: string;
    prescriptionUrl?: string;
    prescriptionUploadedAt?: Date;
    invoiceUrl?: string;
    tokenNumber?: number;
    patientName?: string;
    patientPhone?: string;
    patientEmail?: string;
    patientAge?: number;
    doctorName?: string;
    hospitalName?: string;
    consultationFee?: number;
    appointmentDate?: string;
    appointmentTime?: string;
}

const AppointmentSchema: Schema = new Schema({
    patient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    slot: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
    slotTime: { type: Date, required: true },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'checked-in', 'in-consultation', 'completed', 'cancelled'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        // 'unpaid'/'paid'/'waived' — new canonical values.
        // 'pending'/'failed' — legacy values kept for backward compat with existing documents.
        enum: ['unpaid', 'paid', 'waived', 'pending', 'failed'],
        default: 'unpaid'
    },
    // Source field: allows future gateway webhook to override without schema rewrite.
    paymentSource: {
        type: String,
        enum: ['manual', 'gateway'],
        default: 'manual'
    },
    paymentUpdatedAt: { type: Date },
    paymentUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    bookingDate: { type: Date, default: Date.now },
    notes: { type: String },
    prescriptionUrl: { type: String },
    prescriptionUploadedAt: { type: Date },
    invoiceUrl: { type: String },
    tokenNumber: { type: Number },
    patientName: { type: String },
    patientPhone: { type: String },
    patientEmail: { type: String },
    patientAge: { type: Number },
    doctorName: { type: String },
    hospitalName: { type: String },
    consultationFee: { type: Number },
    appointmentDate: { type: String },
    appointmentTime: { type: String },
}, { timestamps: true });

export default mongoose.model<IAppointment>('Appointment', AppointmentSchema);
