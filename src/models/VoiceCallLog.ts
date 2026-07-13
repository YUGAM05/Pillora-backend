import mongoose, { Schema, Document } from 'mongoose';

export interface IVoiceCallLog extends Document {
    endpoint: string;
    hospitalId?: mongoose.Types.ObjectId;
    requestBody: any;
    responseStatus: number;
    responseBody: any;
    timestamp: Date;
}

const VoiceCallLogSchema: Schema = new Schema({
    endpoint: { type: String, required: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital' },
    requestBody: { type: Schema.Types.Mixed },
    responseStatus: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model<IVoiceCallLog>('VoiceCallLog', VoiceCallLogSchema);
