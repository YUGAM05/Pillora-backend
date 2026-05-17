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
    isSpecialtyGroup?: boolean;
    department?: string;
    maxAppointmentsPerSlot?: number;
    doctorsCount?: number;
    description?: string;
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
    isSpecialtyGroup: { type: Boolean, default: false },
    department: { type: String },
    maxAppointmentsPerSlot: { type: Number, default: 1 },
    doctorsCount: { type: Number, default: 1 },
    description: { type: String },
}, { timestamps: true });

export default mongoose.model<IDoctor>('Doctor', DoctorSchema);
