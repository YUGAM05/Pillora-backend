import mongoose, { Schema, Document } from 'mongoose';

export interface IPrescription {
    rx_id: string;
    user_id: mongoose.Types.ObjectId;
    image_url: string;
    ocr_text: string;
    ai_result: any;
    medicines_extracted: Array<{
        name: string;
        dosage: string;
        quantity: string;
        duration: string;
    }>;
    admin_status: 'pending' | 'approved' | 'rejected';
    admin_id?: mongoose.Types.ObjectId;
    admin_notes?: string;
    valid_until?: Date;
    is_used: boolean;
}

export interface IPrescriptionDocument extends IPrescription, Document { }

const PrescriptionSchema: Schema = new Schema({
    rx_id: { type: String, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    image_url: { type: String, required: true },
    ocr_text: { type: String },
    ai_result: { type: Schema.Types.Mixed },
    medicines_extracted: [{
        name: String,
        dosage: String,
        quantity: String,
        duration: String
    }],
    admin_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_id: { type: Schema.Types.ObjectId, ref: 'User' },
    admin_notes: { type: String },
    valid_until: { type: Date },
    is_used: { type: Boolean, default: false }
}, { timestamps: true });

PrescriptionSchema.pre<IPrescriptionDocument>('save', async function () {
    if (!this.rx_id) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Prescription').countDocuments();
        this.rx_id = `RX-${year}-${(count + 1).toString().padStart(5, '0')}`;
    }
});

export default mongoose.model<IPrescriptionDocument>('Prescription', PrescriptionSchema);
