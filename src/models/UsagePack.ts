import mongoose, { Schema, Document } from 'mongoose';

/**
 * An add-on pack bought by (or granted to) a hospital: extra WhatsApp messages
 * or AI call minutes. Used after the plan's monthly allowance, oldest pack
 * first, and valid for PACK_VALIDITY_DAYS after purchase (carries over months).
 *
 * `remaining` is in base units: messages for WhatsApp, SECONDS for AI minutes.
 */
export interface IUsagePack extends Document {
    hospital: mongoose.Types.ObjectId;
    kind: 'whatsapp' | 'ai_minutes';
    packCode?: string;
    /** As sold: messages or minutes */
    quantity: number;
    /** Left, in base units (messages / seconds) */
    remaining: number;
    /** Rupees before GST (0 for free grants) */
    price: number;
    gstAmount: number;
    status: 'pending' | 'active' | 'used' | 'expired' | 'cancelled';
    source: 'razorpay' | 'admin';
    purchasedAt?: Date;
    expiresAt?: Date;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    grantedBy?: mongoose.Types.ObjectId;
    note?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

const UsagePackSchema = new Schema(
    {
        hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
        kind: { type: String, enum: ['whatsapp', 'ai_minutes'], required: true },
        packCode: { type: String },
        quantity: { type: Number, required: true, min: 1 },
        remaining: { type: Number, required: true, min: 0 },
        price: { type: Number, default: 0, min: 0 },
        gstAmount: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['pending', 'active', 'used', 'expired', 'cancelled'], default: 'pending' },
        source: { type: String, enum: ['razorpay', 'admin'], required: true },
        purchasedAt: { type: Date },
        expiresAt: { type: Date },
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, trim: true },
    },
    { timestamps: true }
);

// "Oldest active pack with something left" lookups.
UsagePackSchema.index({ hospital: 1, kind: 1, status: 1, purchasedAt: 1 });
UsagePackSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });

export default mongoose.model<IUsagePack>('UsagePack', UsagePackSchema);
