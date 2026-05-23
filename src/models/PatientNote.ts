import mongoose, { Document, Schema } from 'mongoose';

export interface IPatientNote extends Document {
    patient: mongoose.Types.ObjectId;
    hospital: mongoose.Types.ObjectId;
    doctor?: mongoose.Types.ObjectId;
    note: string;
    createdAt: Date;
    updatedAt: Date;
}

const PatientNoteSchema: Schema = new Schema({
    patient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    note: { type: String, required: true }
}, {
    timestamps: true
});

export default mongoose.model<IPatientNote>('PatientNote', PatientNoteSchema);
