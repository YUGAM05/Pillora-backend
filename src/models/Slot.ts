import mongoose, { Schema, Document } from 'mongoose';

export interface ISlot extends Document {
    doctor: mongoose.Types.ObjectId;
    hospital: mongoose.Types.ObjectId;
    startTime: Date;
    endTime: Date;
    status: 'available' | 'locked' | 'booked' | 'blocked' | 'cancelled';
    appointment?: mongoose.Types.ObjectId;
    cancelledAt?: Date;
    cancellationReason?: string;
    cancelledBy?: mongoose.Types.ObjectId;
    booked_count: number;
    max_appointments: number;
    hold_count: number;
    // Temporary checkout holds, stored in the database so they work across serverless instances.
    // A hold counts against capacity only while expiresAt is in the future (see utils/slotBooking.ts).
    holds?: { user: mongoose.Types.ObjectId; expiresAt: Date }[];
}

const SlotSchema: Schema = new Schema({
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['available', 'locked', 'booked', 'blocked', 'cancelled'], default: 'available' },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    booked_count: { type: Number, default: 0 },
    max_appointments: { type: Number, default: 1 },
    hold_count: { type: Number, default: 0 },
    holds: {
        type: [{
            _id: false,
            user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            expiresAt: { type: Date, required: true }
        }],
        default: undefined
    },
}, { timestamps: true });

// Index for quick availability lookups
SlotSchema.index({ doctor: 1, startTime: 1 });
SlotSchema.index({ hospital: 1, status: 1 });

export default mongoose.model<ISlot>('Slot', SlotSchema);

