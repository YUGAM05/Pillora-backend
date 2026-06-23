import mongoose, { Schema, Document } from 'mongoose';

export interface ISettlement extends Document {
    hospitalId: mongoose.Types.ObjectId;
    appointmentId: mongoose.Types.ObjectId;
    amount: number;
    type: 'advance_fee';
    status: 'pending_settlement' | 'settled' | 'refunded' | 'retained_by_pillora';
    trialActive: boolean;
    settledDate: Date;
    settledAmount: number;
    createdAt: Date;
    updatedAt: Date;
}

const SettlementSchema: Schema = new Schema({
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['advance_fee'], default: 'advance_fee', required: true },
    status: { 
        type: String, 
        enum: ['pending_settlement', 'settled', 'refunded', 'retained_by_pillora'], 
        default: 'pending_settlement',
        required: true 
    },
    trialActive: { type: Boolean, default: false, required: true },
    settledDate: { type: Date, required: true },
    settledAmount: { type: Number, required: true, min: 0 },
}, { timestamps: true });

export default mongoose.model<ISettlement>('Settlement', SettlementSchema);
