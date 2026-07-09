import mongoose, { Schema, Document } from 'mongoose';

export interface ISettlementTimeline {
    status: string;
    timestamp: Date;
    note?: string;
}

export interface ISettlementAudit {
    performedBy?: mongoose.Types.ObjectId;
    action: string;
    previousStatus: string;
    newStatus: string;
    notes?: string;
    timestamp: Date;
}

export interface ISettlement extends Document {
    settlementId: string; // SET-YYYYMMDD-XXXX
    hospitalId: mongoose.Types.ObjectId;
    status: 'Waiting for Razorpay Settlement' | 'Ready for Settlement' | 'Payment Initiated' | 'Awaiting Hospital Confirmation' | 'Settlement Completed' | 'Failed' | 'On Hold' | 'Under Review';
    grossCollection: number;
    razorpayCharges: number;
    gstCharges: number;
    netAmount: number;
    transferDate?: Date;
    transferMethod?: 'NEFT' | 'RTGS' | 'IMPS' | 'UPI';
    utrNumber?: string;
    notes?: string;
    confirmationDate?: Date;
    eligibleDate: Date;
    paymentIds: mongoose.Types.ObjectId[];
    appointmentIds: mongoose.Types.ObjectId[];
    timeline: ISettlementTimeline[];
    auditLogs: ISettlementAudit[];
    createdAt: Date;
    updatedAt: Date;
}

const SettlementTimelineSchema = new Schema({
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String }
}, { _id: false });

const SettlementAuditSchema = new Schema({
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    previousStatus: { type: String, required: true },
    newStatus: { type: String, required: true },
    notes: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const SettlementSchema: Schema = new Schema({
    settlementId: { type: String, required: true, unique: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    status: { 
        type: String, 
        enum: ['Waiting for Razorpay Settlement', 'Ready for Settlement', 'Payment Initiated', 'Awaiting Hospital Confirmation', 'Settlement Completed', 'Failed', 'On Hold', 'Under Review'],
        default: 'Waiting for Razorpay Settlement',
        required: true 
    },
    grossCollection: { type: Number, required: true, default: 0 },
    razorpayCharges: { type: Number, required: true, default: 0 },
    gstCharges: { type: Number, required: true, default: 0 },
    netAmount: { type: Number, required: true, default: 0 },
    transferDate: { type: Date },
    transferMethod: { type: String, enum: ['NEFT', 'RTGS', 'IMPS', 'UPI'] },
    utrNumber: { type: String },
    notes: { type: String },
    confirmationDate: { type: Date },
    eligibleDate: { type: Date, required: true },
    paymentIds: [{ type: Schema.Types.ObjectId, ref: 'Payment' }],
    appointmentIds: [{ type: Schema.Types.ObjectId, ref: 'Appointment' }],
    timeline: [SettlementTimelineSchema],
    auditLogs: [SettlementAuditSchema]
}, { timestamps: true });

export default mongoose.model<ISettlement>('Settlement', SettlementSchema);
