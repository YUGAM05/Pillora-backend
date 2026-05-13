import mongoose, { Schema, Document } from 'mongoose';

export interface IAppointment extends Document {
    patient: mongoose.Types.ObjectId;
    doctor: mongoose.Types.ObjectId;
    hospital: mongoose.Types.ObjectId;
    slot: mongoose.Types.ObjectId;
    slotTime: Date;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    paymentStatus: 'pending' | 'paid' | 'failed';
    bookingDate: Date;
    notes?: string;
}

const AppointmentSchema: Schema = new Schema({
    patient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    slot: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
    slotTime: { type: Date, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'cancelled', 'completed'], 
        default: 'pending' 
    },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'failed'], 
        default: 'pending' 
    },
    bookingDate: { type: Date, default: Date.now },
    notes: { type: String },
}, { timestamps: true });

export default mongoose.model<IAppointment>('Appointment', AppointmentSchema);
