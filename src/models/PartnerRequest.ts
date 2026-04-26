import mongoose, { Schema, Document } from 'mongoose';

export interface IPartnerRequest extends Document {
    type: 'hospital' | 'ngo';
    // Common fields
    organizationName: string;
    city: string;
    area: string;
    address: string;
    contactPersonName: string;
    designation: string;
    phoneNumber: string;
    email: string;
    message?: string;
    
    // Hospital specific fields
    facilityType?: string;
    registrationNumber?: string;
    specializations?: string[];
    doctorCount?: number;
    facilities?: string[];
    governmentSchemes?: string[];
    
    // NGO specific fields
    ngoType?: string;
    donorCount?: number;
    isDigitized?: string;
    areasCovered?: string;
    bloodGroups?: string[];
    
    status: 'pending' | 'reviewed' | 'contacted' | 'rejected';
}

const PartnerRequestSchema: Schema = new Schema({
    type: { type: String, enum: ['hospital', 'ngo'], required: true },
    organizationName: { type: String, required: true },
    city: { type: String, required: true },
    area: { type: String, required: true },
    address: { type: String, required: true },
    contactPersonName: { type: String, required: true },
    designation: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String },
    
    // Hospital specific
    facilityType: { type: String },
    registrationNumber: { type: String },
    specializations: [{ type: String }],
    doctorCount: { type: Number },
    facilities: [{ type: String }],
    governmentSchemes: [{ type: String }],
    
    // NGO specific
    ngoType: { type: String },
    donorCount: { type: Number },
    isDigitized: { type: String },
    areasCovered: { type: String },
    bloodGroups: [{ type: String }],
    
    status: { 
        type: String, 
        enum: ['pending', 'reviewed', 'contacted', 'rejected'], 
        default: 'pending' 
    }
}, { timestamps: true });

export default mongoose.model<IPartnerRequest>('PartnerRequest', PartnerRequestSchema);
