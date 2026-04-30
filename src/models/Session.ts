import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface ISession extends Document {
    sessionId: string;
    adminId: mongoose.Types.ObjectId;
    refreshToken: string;
    ipAddress: string;
    userAgent: string;
    isRevoked: boolean;
    createdAt: Date;
    expiresAt: Date;
}

const SessionSchema = new Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshToken: { type: String, required: true, index: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    isRevoked: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
}, { timestamps: true });

// Auto-delete expired sessions after 24h
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

// Static: create a new admin session
SessionSchema.statics.createSession = async function (adminId: string, ip: string, ua: string) {
    const sessionId = crypto.randomUUID();
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    const session = await this.create({
        sessionId,
        adminId,
        refreshToken,
        ipAddress: ip,
        userAgent: ua,
        expiresAt,
    });

    return { sessionId, refreshToken, expiresAt, session };
};

// Static: revoke all sessions for an admin (force logout everywhere)
SessionSchema.statics.revokeAllForAdmin = async function (adminId: string) {
    return this.updateMany({ adminId, isRevoked: false }, { isRevoked: true });
};

// Static: emergency lockdown — revoke every active session
SessionSchema.statics.lockdownAll = async function () {
    return this.updateMany({ isRevoked: false }, { isRevoked: true });
};

export default mongoose.model<ISession>('Session', SessionSchema);
