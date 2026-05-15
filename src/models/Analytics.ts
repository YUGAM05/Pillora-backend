import mongoose, { Schema, Document } from 'mongoose';

export interface IAnalytics extends Document {
    type: 'pageview' | 'event';
    eventName?: string;
    path: string;
    referrer?: string;
    browser?: string;
    os?: string;
    device?: 'mobile' | 'desktop' | 'tablet';
    country?: string;
    city?: string;
    bandwidth: number; // in bytes
    visitorHash: string; // Hash of IP + UA + Date (to keep it anonymous but track unique daily visitors)
    metadata?: any;
    timestamp: Date;
}

const AnalyticsSchema: Schema = new Schema({
    type: { type: String, enum: ['pageview', 'event'], required: true },
    eventName: { type: String },
    path: { type: String, required: true },
    referrer: { type: String },
    browser: { type: String },
    os: { type: String },
    device: { type: String, enum: ['mobile', 'desktop', 'tablet', 'unknown'], default: 'unknown' },
    country: { type: String, default: 'Unknown' },
    city: { type: String, default: 'Unknown' },
    bandwidth: { type: Number, default: 0 },
    visitorHash: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries
AnalyticsSchema.index({ timestamp: -1 });
AnalyticsSchema.index({ visitorHash: 1, timestamp: -1 });
AnalyticsSchema.index({ type: 1, timestamp: -1 });

export default mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);
