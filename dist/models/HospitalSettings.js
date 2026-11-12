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
const HospitalSettingsSchema = new mongoose_1.Schema({
    hospitalId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
                doctorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Doctor' },
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
exports.default = mongoose_1.default.model('HospitalSettings', HospitalSettingsSchema);
