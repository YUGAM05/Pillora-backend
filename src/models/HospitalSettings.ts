import mongoose, { Schema, Document } from 'mongoose';

export interface IHospitalSettings extends Document {
    hospitalId: mongoose.Types.ObjectId;

    // Appointment Settings
    appointmentSettings: {
        isOnlineBookingEnabled: boolean;
        isOfflineBookingEnabled: boolean;
        defaultSlotDuration: number; // 10, 15, 20, 30
        bufferTimeBetweenSlots: number; // 0, 5, 10, 15
        maxAppointmentsPerSlot: number;
        advanceBookingWindowDays: number;
        minBookingNoticeHours: number;
        allowSameDayBooking: boolean;
        cancellationPolicyHours: number;
        reschedulePolicyHours: number;
        weeklyHolidays: string[];
        specialClosingDays: { date: string; reason: string }[];
        doctorOverrides: {
            doctorId: mongoose.Types.ObjectId;
            slotDuration?: number;
            bufferTime?: number;
            maxAppointmentsPerSlot?: number;
            weeklyHolidays?: string[];
        }[];
    };

    // Notification Preferences
    notificationPreferences: {
        newAppointment: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
        appointmentCancellation: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
        appointmentRescheduled: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
        paymentReceived: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
        patientArrival: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
        doctorAvailability: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
        dailySummary: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
        settlementUpdates: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
    };

    // Bank Details Change Request (if pending Pillora Admin verification)
    bankDetailsPendingApproval?: {
        accountHolderName: string;
        bankName: string;
        branchName: string;
        accountNumber: string;
        ifscCode: string;
        upiId?: string;
        requestedAt: Date;
        status: 'pending' | 'approved' | 'rejected';
    };

    // Security & Auth Settings
    twoFactorAuthEnabled: boolean;
    authorizedDevices?: {
        deviceName: string;
        ipAddress: string;
        lastSeen: Date;
    }[];

    // Deactivation Request
    deactivationRequest?: {
        requested: boolean;
        reason?: string;
        requestedAt?: Date;
        status?: 'pending' | 'reviewed' | 'completed' | 'cancelled';
    };

    // Export History Log
    exportHistory: {
        exportType: string;
        format: 'csv' | 'xlsx' | 'pdf';
        recordCount: number;
        requestedBy?: string;
        createdAt: Date;
    }[];

    createdAt: Date;
    updatedAt: Date;
}



const HospitalSettingsSchema: Schema = new Schema({
    hospitalId: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        unique: true,
        index: true
    },
    appointmentSettings: {
        isOnlineBookingEnabled: { type: Boolean, default: true },
        isOfflineBookingEnabled: { type: Boolean, default: true },
        defaultSlotDuration: { type: Number, default: 15, enum: [10, 15, 20, 30] },
        bufferTimeBetweenSlots: { type: Number, default: 5, enum: [0, 5, 10, 15] },
        maxAppointmentsPerSlot: { type: Number, default: 1, min: 1, max: 20 },
        advanceBookingWindowDays: { type: Number, default: 30, min: 1, max: 90 },
        minBookingNoticeHours: { type: Number, default: 1, min: 0, max: 48 },
        allowSameDayBooking: { type: Boolean, default: true },
        cancellationPolicyHours: { type: Number, default: 2, min: 0, max: 72 },
        reschedulePolicyHours: { type: Number, default: 2, min: 0, max: 72 },
        weeklyHolidays: [{ type: String, default: 'Sunday' }],
        specialClosingDays: [{
            date: { type: String, required: true },
            reason: { type: String, default: 'Special Holiday' }
        }],
        doctorOverrides: [{
            doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor' },
            slotDuration: Number,
            bufferTime: Number,
            maxAppointmentsPerSlot: Number,
            weeklyHolidays: [String]
        }]
    },
    notificationPreferences: {
        newAppointment: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        },
        appointmentCancellation: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        },
        appointmentRescheduled: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        },
        paymentReceived: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        },
        patientArrival: {
            email: { type: Boolean, default: false },
            sms: { type: Boolean, default: false },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        },
        doctorAvailability: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        },
        dailySummary: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        },
        settlementUpdates: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            whatsapp: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true }
        }
    },
    bankDetailsPendingApproval: {
        accountHolderName: String,
        bankName: String,
        branchName: String,
        accountNumber: String,
        ifscCode: String,
        upiId: String,
        requestedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
    },
    twoFactorAuthEnabled: { type: Boolean, default: false },
    authorizedDevices: [{
        deviceName: String,
        ipAddress: String,
        lastSeen: { type: Date, default: Date.now }
    }],
    deactivationRequest: {
        requested: { type: Boolean, default: false },
        reason: String,
        requestedAt: Date,
        status: { type: String, enum: ['pending', 'reviewed', 'completed', 'cancelled'], default: 'pending' }
    },
    exportHistory: [{
        exportType: { type: String, required: true },
        format: { type: String, enum: ['csv', 'xlsx', 'pdf'], default: 'csv' },
        recordCount: { type: Number, default: 0 },
        requestedBy: String,
        createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

export default mongoose.model<IHospitalSettings>('HospitalSettings', HospitalSettingsSchema);
