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
const DoctorSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    specialization: { type: String, required: false },
    daysAvailable: [{ type: String }],
    timing: { type: String, required: false },
}, { _id: false });
const HospitalSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, trim: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    image: { type: String, required: false },
    images: [{ type: String }],
    isOpen24Hours: { type: Boolean, default: false },
    consultationFee: { type: Number, required: true },
    governmentSchemes: [{ type: String }],
    isOnlinePaymentAvailable: { type: Boolean, default: true },
    ambulanceContact: { type: String, required: false },
    contactNumber: { type: String, required: false },
    phoneNumbers: [{ type: String }],
    description: { type: String },
    rating: { type: Number, default: 0 },
    doctors: [DoctorSchema],
    management_type: { type: String, enum: ['SELF', 'PILLORA'], default: 'SELF' },
    is_verified: { type: Boolean, default: false },
    plan: {
        type: String,
        enum: ['Standard', 'Premium', 'Enterprise'],
        default: 'Standard'
    },
    // Plan Benefits
    is_featured: { type: Boolean, default: false }, // For "Top of Search"
    has_govt_schemes: { type: Boolean, default: false }, // For "Government Schemes Tag"
    has_custom_page: { type: Boolean, default: false }, // For "Custom landing page"
    is_spotlight: { type: Boolean, default: false }, // For "Homepage banner & spotlight"
    priority_support: { type: Boolean, default: false },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
exports.default = mongoose_1.default.model('Hospital', HospitalSchema);
