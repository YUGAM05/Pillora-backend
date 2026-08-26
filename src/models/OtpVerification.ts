import mongoose, { Schema, Document } from 'mongoose';

export interface IOtpVerification extends Document {
    phoneNumber: string;
    otp: string;
    expiresAt: Date;
    attempts: number;
    resendHistory: Date[];
    createdAt: Date;
    updatedAt: Date;
}

const OtpVerificationSchema: Schema = new Schema(
    {
        phoneNumber: { type: String, required: true, index: true },
        otp: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        attempts: { type: Number, default: 0 },
        resendHistory: { type: [Date], default: [] }
    },
    {
        collection: 'otp_verifications',
        timestamps: true
    }
);

// Expire document automatically after 1 hour to clean up old database records
OtpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default mongoose.model<IOtpVerification>('OtpVerification', OtpVerificationSchema);
