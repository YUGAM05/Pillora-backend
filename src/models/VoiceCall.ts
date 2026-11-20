import mongoose, { Schema, Document } from 'mongoose';

/**
 * One row per AI phone receptionist call, reported by the voice server when
 * the call ends. Used for AI-minute billing and the hospital's call history.
 */
export interface IVoiceCall extends Document {
    hospital: mongoose.Types.ObjectId;
    /** Plivo CallUUID (unique: a report is counted once) */
    callUuid: string;
    from?: string;
    to?: string;
    startedAt?: Date;
    durationSeconds: number;
    /** After free-call rule and 30-second blocks */
    billedSeconds: number;
    outcome: 'booked' | 'no_booking' | 'ended_early' | 'unavailable';
    appointment?: mongoose.Types.ObjectId;
    language?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

const VoiceCallSchema = new Schema(
    {
        hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
        callUuid: { type: String, required: true },
        from: { type: String },
        to: { type: String },
        startedAt: { type: Date },
        durationSeconds: { type: Number, required: true, min: 0 },
        billedSeconds: { type: Number, required: true, min: 0 },
        outcome: { type: String, enum: ['booked', 'no_booking', 'ended_early', 'unavailable'], default: 'no_booking' },
        appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
        language: { type: String },
    },
    { timestamps: true }
);

VoiceCallSchema.index({ callUuid: 1 }, { unique: true });
VoiceCallSchema.index({ hospital: 1, createdAt: -1 });

export default mongoose.model<IVoiceCall>('VoiceCall', VoiceCallSchema);
