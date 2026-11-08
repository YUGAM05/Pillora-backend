import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IPayment extends Document {
    transactionId: string;
    appointmentId: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
    hospitalId: mongoose.Types.ObjectId;
    patientName?: string;
    amount: number; // in Rupees
    amountInPaise?: number; // in integer Paise
    consultationFee?: number;
    advanceFee?: number;
    paymentType: 'advance' | 'balance' | 'full' | 'refund';
    paymentSource: 'pillora_online' | 'clinic_collection';
    paymentMethod: 'razorpay' | 'cash' | 'upi' | 'card' | 'other_online';
    mode?: 'online' | 'offline'; // For backward compatibility
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    gatewayCharges?: number; // Razorpay 2% fee in INR
    gatewayTaxes?: number; // 18% GST on Razorpay fee in INR
    netPayable?: number; // Net amount payable to hospital in INR
    status: 'pending' | 'completed' | 'failed' | 'refund_initiated' | 'refunded' | 'paid';
    recordedBy?: mongoose.Types.ObjectId; // ID of the hospital admin/receptionist
    settlementStatus?: 'Pending' | 'Processing' | 'Settled' | 'Failed' | 'Reversed' | 'Waiting for Razorpay Settlement' | 'Ready for Settlement' | 'Payment Initiated' | 'Awaiting Hospital Confirmation' | 'Settlement Completed' | 'not_applicable' | 'refunded' | 'retained_by_pillora' | 'On Hold' | 'Under Review';
    settlementId?: mongoose.Types.ObjectId;
    settlementDate?: Date;
    notes?: string;
    refundDetails?: {
        refundId?: string;
        reason?: string;
        amount?: number;
        refundedAt?: Date;
    };
    idempotencyKey?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
    transactionId: { 
        type: String, 
        unique: true, 
        sparse: true, 
        index: true 
    },
    appointmentId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Appointment', 
        required: true, 
        index: true 
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
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
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
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
    settlementId: { type: Schema.Types.ObjectId, ref: 'Settlement', required: false, index: true },
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
PaymentSchema.pre('save', function (this: any) {
    const payment = this;

    // Generate unique transactionId if not set
    if (!payment.transactionId) {
        const prefix = payment.paymentType === 'advance' ? 'TXN-ADV' 
                     : payment.paymentType === 'balance' ? 'TXN-BAL'
                     : payment.paymentType === 'full' ? 'TXN-CLN'
                     : 'TXN-REF';
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase();
        payment.transactionId = `${prefix}-${dateStr}-${randomStr}`;
    }

    // Ensure amountInPaise
    if (payment.amount !== undefined && payment.amountInPaise === undefined) {
        payment.amountInPaise = Math.round(payment.amount * 100);
    }

    // Sync mode with paymentMethod for backward compatibility
    if (payment.paymentMethod === 'cash') {
        payment.mode = 'offline';
    } else if (['razorpay', 'upi', 'card', 'other_online'].includes(payment.paymentMethod)) {
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
    } else if (payment.paymentSource === 'clinic_collection') {
        payment.gatewayCharges = 0;
        payment.gatewayTaxes = 0;
        payment.netPayable = 0;
        payment.settlementStatus = 'not_applicable';
    }
});

export default mongoose.model<IPayment>('Payment', PaymentSchema);
