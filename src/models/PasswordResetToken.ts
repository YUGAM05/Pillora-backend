import mongoose, { Schema, Document } from 'mongoose';

export interface IPasswordResetToken extends Document {
    userId: mongoose.Types.ObjectId;
    email: string;
    portal: 'patient' | 'hospital';
    tokenHash: string;
    expiresAt: Date;
    used: boolean;
    createdAt: Date;
}

const PasswordResetTokenSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true },
    portal: { type: String, enum: ['patient', 'hospital'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, expires: 0 }, // TTL index to auto-delete expired documents
    used: { type: Boolean, default: false },
}, { 
    collection: 'PasswordResetTokens',
    timestamps: { createdAt: 'createdAt', updatedAt: false } 
});

// Create index for looking up by token hash and email
PasswordResetTokenSchema.index({ tokenHash: 1 });
PasswordResetTokenSchema.index({ email: 1 });

export default mongoose.model<IPasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema);
