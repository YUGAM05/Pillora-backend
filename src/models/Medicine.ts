import mongoose, { Schema, Document } from 'mongoose';

export interface IMedicineProduct {
    seller_id: mongoose.Types.ObjectId;
    name: string;
    generic_name?: string;
    brand?: string;
    category?: string;
    price: number;
    stock: number;
    dosage?: string;
    expiry_date?: Date;
    image_url?: string;
    requires_prescription: boolean;
    admin_approved: 'pending' | 'approved' | 'rejected';
    rejection_reason?: string;
}

export interface IMedicineDocument extends IMedicineProduct, Document { }

const MedicineSchema: Schema = new Schema({
    seller_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    generic_name: { type: String },
    brand: { type: String },
    category: { type: String },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    dosage: { type: String },
    expiry_date: { type: Date },
    image_url: { type: String },
    requires_prescription: { type: Boolean, default: true },
    admin_approved: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejection_reason: { type: String }
}, { timestamps: true });

export default mongoose.model<IMedicineDocument>('Medicine', MedicineSchema);
