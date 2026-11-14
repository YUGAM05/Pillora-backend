import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentChangeDiff {
    field: string;
    label: string;
    oldValue: any;
    newValue: any;
}

export interface IPaymentModificationLog extends Document {
    appointmentId: mongoose.Types.ObjectId;
    paymentId?: mongoose.Types.ObjectId;
    hospitalId: mongoose.Types.ObjectId;
    modifiedBy: mongoose.Types.ObjectId;
    modifierName?: string;
    modifierRole?: string;
    reason: string;
    previousValues: {
        patientName?: string;
        doctorId?: string;
        doctorName?: string;
        consultationFee?: number;
        advancePaid?: number;
        balancePaid?: number;
        balanceDue?: number;
        clinicCashCollection?: number;
        clinicOnlineCollection?: number;
        paymentAmount?: number;
        paymentMethod?: string;
        paymentMode?: string;
        paymentDate?: Date;
        transactionReference?: string;
        notes?: string;
        [key: string]: any;
    };
    updatedValues: {
        patientName?: string;
        doctorId?: string;
        doctorName?: string;
        consultationFee?: number;
        advancePaid?: number;
        balancePaid?: number;
        balanceDue?: number;
        clinicCashCollection?: number;
        clinicOnlineCollection?: number;
        paymentAmount?: number;
        paymentMethod?: string;
        paymentMode?: string;
        paymentDate?: Date;
        transactionReference?: string;
        notes?: string;
        [key: string]: any;
    };
    changes: IPaymentChangeDiff[];
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PaymentModificationLogSchema: Schema = new Schema({
    appointmentId: {
        type: Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
        index: true
    },
    paymentId: {
        type: Schema.Types.ObjectId,
        ref: 'Payment',
        required: false,
        index: true
    },
    hospitalId: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    modifiedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    modifierName: {
        type: String,
        default: 'Hospital Staff'
    },
    modifierRole: {
        type: String,
        default: 'hospital'
    },
    reason: {
        type: String,
        required: true,
        trim: true
    },
    previousValues: {
        type: Schema.Types.Mixed,
        required: true
    },
    updatedValues: {
        type: Schema.Types.Mixed,
        required: true
    },
    changes: [
        {
            field: { type: String, required: true },
            label: { type: String, required: true },
            oldValue: { type: Schema.Types.Mixed },
            newValue: { type: Schema.Types.Mixed }
        }
    ],
    ipAddress: {
        type: String,
        default: 'unknown'
    },
    userAgent: {
        type: String,
        default: 'unknown'
    }
}, {
    timestamps: true
});

PaymentModificationLogSchema.index({ hospitalId: 1, createdAt: -1 });
PaymentModificationLogSchema.index({ appointmentId: 1, createdAt: -1 });

export default mongoose.model<IPaymentModificationLog>('PaymentModificationLog', PaymentModificationLogSchema);
