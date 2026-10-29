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
const HospitalSubscriptionPaymentSchema = new mongoose_1.Schema({
    hospital: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    paymentDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['UPI', 'Bank Transfer', 'Cash', 'Card', 'Cheque', 'Other'],
        default: 'UPI'
    },
    transactionReference: { type: String, trim: true, default: '' },
    adminNotes: { type: String, trim: true, default: '' },
    subscriptionStartDate: { type: Date, required: true },
    subscriptionExpiryDate: { type: Date, required: true },
    recordedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    paymentType: { type: String, enum: ['initial', 'renewal'], default: 'initial' }
}, { timestamps: true });
HospitalSubscriptionPaymentSchema.index({ hospital: 1, paymentDate: -1 });
exports.default = mongoose_1.default.model('HospitalSubscriptionPayment', HospitalSubscriptionPaymentSchema);
