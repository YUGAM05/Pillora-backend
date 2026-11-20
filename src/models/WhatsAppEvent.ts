import mongoose, { Schema, Document } from 'mongoose';

export interface IWhatsAppEvent extends Document {
    eventType: string;
    status?: string;
    senderPhoneNumber?: string;
    messageType?: string;
    textBody?: string;
    rawPayload: any;
    timestamp: Date;
}

const WhatsAppEventSchema: Schema = new Schema(
    {
        eventType: { type: String, required: true, default: 'unknown' },
        status: { type: String },
        senderPhoneNumber: { type: String },
        messageType: { type: String },
        textBody: { type: String },
        rawPayload: { type: Schema.Types.Mixed, required: true },
        timestamp: { type: Date, default: Date.now }
    },
    {
        collection: 'whatsapp_events',
        timestamps: true
    }
);

// Kept 90 days (failures and patient replies), then deleted automatically.
WhatsAppEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default mongoose.model<IWhatsAppEvent>('WhatsAppEvent', WhatsAppEventSchema);
