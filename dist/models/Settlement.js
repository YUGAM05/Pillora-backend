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
const SettlementTimelineSchema = new mongoose_1.Schema({
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String }
}, { _id: false });
const SettlementAuditSchema = new mongoose_1.Schema({
    performedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    previousStatus: { type: String, required: true },
    newStatus: { type: String, required: true },
    notes: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });
const SettlementSchema = new mongoose_1.Schema({
    settlementId: { type: String, required: true, unique: true },
    hospitalId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    status: {
        type: String,
        enum: ['Waiting for Razorpay Settlement', 'Ready for Settlement', 'Payment Initiated', 'Awaiting Hospital Confirmation', 'Settlement Completed', 'Failed', 'On Hold', 'Under Review'],
        default: 'Waiting for Razorpay Settlement',
        required: true
    },
    grossCollection: { type: Number, required: true, default: 0 },
    razorpayCharges: { type: Number, required: true, default: 0 },
    gstCharges: { type: Number, required: true, default: 0 },
    netAmount: { type: Number, required: true, default: 0 },
    transferDate: { type: Date },
    transferMethod: { type: String, enum: ['NEFT', 'RTGS', 'IMPS', 'UPI'] },
    utrNumber: { type: String },
    notes: { type: String },
    confirmationDate: { type: Date },
    eligibleDate: { type: Date, required: true },
    paymentIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment' }],
    appointmentIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Appointment' }],
    timeline: [SettlementTimelineSchema],
    auditLogs: [SettlementAuditSchema]
}, { timestamps: true });
exports.default = mongoose_1.default.model('Settlement', SettlementSchema);
