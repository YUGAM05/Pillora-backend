import mongoose, { Schema, Document } from 'mongoose';

/**
 * One row per hospital per calendar month (India time): how much of the
 * plan's monthly allowance has been used. Add-on packs are tracked separately
 * (UsagePack) and only used once the plan allowance is gone.
 */
export interface IUsageMonth extends Document {
    hospital: mongoose.Types.ObjectId;
    /** "YYYY-MM" in Asia/Kolkata */
    month: string;
    /** WhatsApp messages charged to the plan allowance (incl. grace) */
    whatsappPlanUsed: number;
    /** WhatsApp messages charged to packs this month (for reporting) */
    whatsappPackUsed: number;
    whatsappByKind: { confirmation: number; reminder: number; followup: number; other: number };
    /** Messages not sent because the allowance and packs were used up */
    whatsappSkipped: number;
    /** AI call seconds charged to the plan allowance */
    aiPlanSeconds: number;
    /** AI call seconds charged to packs this month */
    aiPackSeconds: number;
    /** AI seconds used beyond plan + packs (calls are never cut off mid-way) */
    aiOverageSeconds: number;
    aiCalls: number;
    createdAt?: Date;
    updatedAt?: Date;
}

const UsageMonthSchema = new Schema(
    {
        hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
        month: { type: String, required: true },
        whatsappPlanUsed: { type: Number, default: 0 },
        whatsappPackUsed: { type: Number, default: 0 },
        whatsappByKind: {
            confirmation: { type: Number, default: 0 },
            reminder: { type: Number, default: 0 },
            followup: { type: Number, default: 0 },
            other: { type: Number, default: 0 },
        },
        whatsappSkipped: { type: Number, default: 0 },
        aiPlanSeconds: { type: Number, default: 0 },
        aiPackSeconds: { type: Number, default: 0 },
        aiOverageSeconds: { type: Number, default: 0 },
        aiCalls: { type: Number, default: 0 },
    },
    { timestamps: true }
);

UsageMonthSchema.index({ hospital: 1, month: 1 }, { unique: true });

export default mongoose.model<IUsageMonth>('UsageMonth', UsageMonthSchema);
