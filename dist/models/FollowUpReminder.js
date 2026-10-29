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
const FollowUpReminderSchema = new mongoose_1.Schema({
    hospital: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    hospitalName: { type: String, required: true },
    patient: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    patientName: { type: String, required: true, trim: true },
    patientPhone: { type: String, required: true, trim: true, index: true },
    patientEmail: { type: String, trim: true },
    originalAppointment: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Appointment' },
    doctor: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Doctor' },
    doctorName: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    followUpDate: { type: Date, required: true, index: true },
    followUpTime: { type: String, trim: true },
    reason: { type: String, trim: true },
    reminderTiming: {
        type: String,
        enum: ['1_day_before', '2_days_before', '3_days_before', 'custom'],
        default: '1_day_before',
    },
    reminderDate: { type: Date, required: true, index: true },
    channel: {
        type: String,
        enum: ['whatsapp', 'sms', 'email'],
        default: 'whatsapp',
    },
    status: {
        type: String,
        enum: ['scheduled', 'sent', 'failed', 'cancelled'],
        default: 'scheduled',
        index: true,
    },
    isConfirmedBooking: { type: Boolean, default: false },
    followUpAppointment: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Appointment' },
    sentAt: { type: Date },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
    notes: { type: String },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
// Compound indexes for optimal querying
FollowUpReminderSchema.index({ hospital: 1, status: 1, reminderDate: 1 });
FollowUpReminderSchema.index({ hospital: 1, followUpDate: 1 });
FollowUpReminderSchema.index({ status: 1, reminderDate: 1 });
exports.default = mongoose_1.default.model('FollowUpReminder', FollowUpReminderSchema);
