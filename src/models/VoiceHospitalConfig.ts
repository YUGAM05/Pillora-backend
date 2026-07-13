import mongoose, { Schema, Document } from 'mongoose';

export interface IVoiceHospitalConfig extends Document {
    hospitalId: mongoose.Types.ObjectId;
    exotelNumber: string;
    isEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const VoiceHospitalConfigSchema: Schema = new Schema({
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    exotelNumber: { type: String, required: true, unique: true, index: true },
    isEnabled: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model<IVoiceHospitalConfig>('VoiceHospitalConfig', VoiceHospitalConfigSchema);
