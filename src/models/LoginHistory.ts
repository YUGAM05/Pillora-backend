import mongoose, { Schema, Document } from 'mongoose';

export interface ILoginHistory extends Document {
    user: mongoose.Types.ObjectId;
    email: string;
    ipAddress: string;
    userAgent: string;
    timestamp: Date;
    createdAt: Date;
    updatedAt: Date;
}

const LoginHistorySchema: Schema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for query performance (latest logins first, and by user)
LoginHistorySchema.index({ timestamp: -1 });
LoginHistorySchema.index({ user: 1, timestamp: -1 });

export default mongoose.model<ILoginHistory>('LoginHistory', LoginHistorySchema);
