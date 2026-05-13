import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
    action: string;
    adminId?: mongoose.Types.ObjectId;
    email?: string;
    ipAddress: string;
    details?: any;
    status: 'success' | 'failed';
    createdAt: Date;
}

const AuditLogSchema: Schema = new Schema({
    action: { type: String, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String },
    ipAddress: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['success', 'failed'], required: true },
}, { timestamps: true });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
