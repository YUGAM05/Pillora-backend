"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const PartnerRequestSchema = new mongoose_1.Schema({
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
    // Pricing Plan
    interestedPlan: { type: String },
    status: {
        type: String,
        enum: ['pending', 'reviewed', 'contacted', 'rejected'],
        default: 'pending'
    }
}, { timestamps: true });
exports.default = mongoose_1.default.model('PartnerRequest', PartnerRequestSchema);
