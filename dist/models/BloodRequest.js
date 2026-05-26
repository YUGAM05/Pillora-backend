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
const BloodRequestSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, required: true },
    age: { type: Number, required: true },
    bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        required: true
    },
    units: { type: Number, required: true, default: 1 },
    hospitalAddress: { type: String, required: true },
    area: { type: String, required: true },
    city: { type: String, required: true },
    contactNumber: { type: String, required: true }, // Person to contact
    reason: { type: String },
    status: {
        type: String,
        enum: ['Open', 'Fulfilled', 'Urgent', 'Closed', 'Fake', 'pending', 'matched', 'no_donor_found'],
        default: 'Open'
    },
    isUrgent: { type: Boolean, default: false },
    kycDocumentType: {
        type: String,
        enum: ['Aadhar Card', 'PAN Card', 'Driving License'],
        required: true
    },
    kycDocumentId: { type: String, required: false },
    kycDocumentImage: { type: String, required: false },
    aiVerificationStatus: {
        type: String,
        enum: ['Pending', 'Verified', 'Rejected', 'Error'],
        default: 'Pending'
    },
    aiVerificationRemarks: { type: String },
    unitsNeeded: { type: Number },
    coordinationNumber: { type: String },
    email: { type: String },
    kycStatus: {
        type: String,
        enum: ['pending', 'verified', 'failed'],
        default: 'pending'
    },
    kycVerifiedAt: { type: Date }
}, { timestamps: true });
exports.default = mongoose_1.default.model('BloodRequest', BloodRequestSchema);
