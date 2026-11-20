import mongoose, { Schema, Document } from 'mongoose';

/**
 * One row per WhatsApp message Pillora sends for a hospital (confirmations,
 * reminders, follow-ups). Meta's delivery reports (webhook) update `status`
 * by `wamid`. Rows are deleted automatically after 180 days.
 */
export interface IWhatsAppMessage extends Document {
    hospital?: mongoose.Types.ObjectId;
    appointment?: mongoose.Types.ObjectId;
    kind: 'confirmation' | 'reminder' | 'followup' | 'other';
    template: string;
    /** Recipient, digits only */
    to: string;
    /** Meta's message id, e.g. "wamid.HBg..." */
    wamid?: string;
    status: 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped_quota' | 'send_error';
    error?: string;
    chargedTo: 'plan' | 'pack' | 'grace' | 'none';
    statusAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

const WhatsAppMessageSchema = new Schema(
    {
        hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', index: true },
        appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
        kind: { type: String, enum: ['confirmation', 'reminder', 'followup', 'other'], required: true },
        template: { type: String, required: true },
        to: { type: String, required: true },
        wamid: { type: String },
        status: { type: String, enum: ['accepted', 'sent', 'delivered', 'read', 'failed', 'skipped_quota', 'send_error'], required: true },
        error: { type: String },
        chargedTo: { type: String, enum: ['plan', 'pack', 'grace', 'none'], default: 'none' },
        statusAt: { type: Date },
    },
    { timestamps: true }
);

WhatsAppMessageSchema.index({ wamid: 1 }, { unique: true, sparse: true });
WhatsAppMessageSchema.index({ hospital: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export default mongoose.model<IWhatsAppMessage>('WhatsAppMessage', WhatsAppMessageSchema);
