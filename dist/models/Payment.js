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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const PaymentSchema = new mongoose_1.Schema({
    transactionId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    appointmentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
        index: true
    },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientName: { type: String, required: false },
    amount: { type: Number, required: true, min: 0 },
    amountInPaise: { type: Number, required: false },
    consultationFee: { type: Number, required: false },
    advanceFee: { type: Number, required: false },
    paymentType: {
        type: String,
        enum: ['advance', 'balance', 'full', 'refund'],
        default: 'advance',
        index: true
    },
    paymentSource: {
        type: String,
        enum: ['pillora_online', 'clinic_collection'],
        default: 'pillora_online',
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ['razorpay', 'cash', 'upi', 'card', 'other_online'],
        default: 'razorpay',
        index: true
    },
    mode: { type: String, enum: ['online', 'offline'], required: false, default: 'online' },
    razorpayOrderId: { type: String, required: false, index: true },
    razorpayPaymentId: { type: String, required: false, index: true },
    razorpaySignature: { type: String, required: false },
    gatewayCharges: { type: Number, default: 0 },
    gatewayTaxes: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refund_initiated', 'refunded', 'paid'],
        default: 'pending',
        index: true
    },
    recordedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    settlementStatus: {
        type: String,
        enum: [
            'Pending',
            'Processing',
            'Settled',
            'Failed',
            'Reversed',
            'Waiting for Razorpay Settlement',
            'Ready for Settlement',
            'Payment Initiated',
            'Awaiting Hospital Confirmation',
            'Settlement Completed',
            'not_applicable',
            'refunded',
            'retained_by_pillora',
            'On Hold',
            'Under Review'
        ],
        default: 'Pending',
        index: true
    },
    settlementId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Settlement', required: false, index: true },
    settlementDate: { type: Date },
    notes: { type: String },
    refundDetails: {
        refundId: { type: String },
        reason: { type: String },
        amount: { type: Number },
        refundedAt: { type: Date }
    },
    idempotencyKey: { type: String, sparse: true, index: true }
}, { timestamps: true });
// Pre-save hook to generate transactionId and compute paise & gateway deductions
PaymentSchema.pre('save', function () {
    const payment = this;
    // Generate unique transactionId if not set
    if (!payment.transactionId) {
        const prefix = payment.paymentType === 'advance' ? 'TXN-ADV'
            : payment.paymentType === 'balance' ? 'TXN-BAL'
                : payment.paymentType === 'full' ? 'TXN-CLN'
                    : 'TXN-REF';
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
        payment.transactionId = `${prefix}-${dateStr}-${randomStr}`;
    }
    // Ensure amountInPaise
    if (payment.amount !== undefined && payment.amountInPaise === undefined) {
        payment.amountInPaise = Math.round(payment.amount * 100);
    }
    // Sync mode with paymentMethod for backward compatibility
    if (payment.paymentMethod === 'cash') {
        payment.mode = 'offline';
    }
    else if (['razorpay', 'upi', 'card', 'other_online'].includes(payment.paymentMethod)) {
        payment.mode = 'online';
    }
    // If online advance, calculate gateway fees (2% Razorpay + 18% GST on the fee = 2.36%)
    if (payment.paymentSource === 'pillora_online' && payment.paymentType === 'advance') {
        if (!payment.gatewayCharges || payment.gatewayCharges === 0) {
            const amountPaise = payment.amountInPaise || Math.round(payment.amount * 100);
            const feePaise = Math.round(amountPaise * 0.02);
            const taxPaise = Math.round(feePaise * 0.18);
            const netPaise = amountPaise - feePaise - taxPaise;
            payment.gatewayCharges = feePaise / 100;
            payment.gatewayTaxes = taxPaise / 100;
            payment.netPayable = netPaise / 100;
        }
    }
    else if (payment.paymentSource === 'clinic_collection') {
        payment.gatewayCharges = 0;
        payment.gatewayTaxes = 0;
        payment.netPayable = 0;
        payment.settlementStatus = 'not_applicable';
    }
});
exports.default = mongoose_1.default.model('Payment', PaymentSchema);
