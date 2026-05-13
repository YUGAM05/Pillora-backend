import mongoose, { Schema, Document } from 'mongoose';

export interface IDoctor extends Document {
    hospital: mongoose.Types.ObjectId;
    name: string;
    specialty: string;
    fee: number;
    availability: {
        day: string; // e.g., 'Monday'
        startTime: string; // e.g., '09:00'
        endTime: string; // e.g., '17:00'
    }[];
    is_active: boolean;
}

const DoctorSchema: Schema = new Schema({
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    fee: { type: Number, required: true },
    availability: [{
        day: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
    }],
    is_active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model<IDoctor>('Doctor', DoctorSchema);
