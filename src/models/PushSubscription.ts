import mongoose, { Schema, Document } from 'mongoose';

export interface IPushSubscription extends Document {
    hospitalId: mongoose.Types.ObjectId;
    subscription: {
        endpoint: string;
        keys: {
            p256dh: string;
            auth: string;
        };
    };
    createdAt: Date;
    updatedAt: Date;
}

const PushSubscriptionSchema = new Schema({
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    subscription: {
        endpoint: { type: String, required: true },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    }
}, { timestamps: true });

// Ensure endpoint is unique to avoid duplicate subscription configurations
PushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });

export default mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
