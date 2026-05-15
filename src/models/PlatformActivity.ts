import mongoose, { Schema, Document } from 'mongoose';

export interface IPlatformActivity extends Document {
    title: string;
    description: string;
    type: 'user' | 'hospital' | 'blood_donor' | 'blood_request' | 'partner' | 'system';
    timestamp: Date;
}

const PlatformActivitySchema: Schema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['user', 'hospital', 'blood_donor', 'blood_request', 'partner', 'system'],
        required: true 
    },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

PlatformActivitySchema.index({ timestamp: -1 });

export default mongoose.model<IPlatformActivity>('PlatformActivity', PlatformActivitySchema);
