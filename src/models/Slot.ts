import mongoose, { Schema, Document } from 'mongoose';

export interface ISlot extends Document {
    doctor: mongoose.Types.ObjectId;
    hospital: mongoose.Types.ObjectId;
    startTime: Date;
    endTime: Date;
    status: 'available' | 'booked' | 'blocked' | 'cancelled';
    appointment?: mongoose.Types.ObjectId;
    cancelledAt?: Date;
    cancellationReason?: string;
    cancelledBy?: mongoose.Types.ObjectId;
}

const SlotSchema: Schema = new Schema({
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['available', 'booked', 'blocked', 'cancelled'], default: 'available' },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Index for quick availability lookups
SlotSchema.index({ doctor: 1, startTime: 1 });
SlotSchema.index({ hospital: 1, status: 1 });

export default mongoose.model<ISlot>('Slot', SlotSchema);
