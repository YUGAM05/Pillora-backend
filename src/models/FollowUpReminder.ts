import mongoose, { Schema, Document } from 'mongoose';

export type ReminderTimingType = '1_day_before' | '2_days_before' | '3_days_before' | 'custom';
export type ReminderChannelType = 'whatsapp' | 'sms' | 'email';
export type ReminderStatusType = 'scheduled' | 'sent' | 'failed' | 'cancelled';

export interface IFollowUpReminder extends Document {
    hospital: mongoose.Types.ObjectId;
    hospitalName: string;
    patient?: mongoose.Types.ObjectId;
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    originalAppointment?: mongoose.Types.ObjectId;
    doctor?: mongoose.Types.ObjectId;
    doctorName: string;
    department?: string;
    followUpDate: Date;
    followUpTime?: string;
    reason?: string;
    reminderTiming: ReminderTimingType;
    reminderDate: Date;
    channel: ReminderChannelType;
    status: ReminderStatusType;
    isConfirmedBooking: boolean;
    followUpAppointment?: mongoose.Types.ObjectId;
    sentAt?: Date;
    failureReason?: string;
    retryCount: number;
    notes?: string;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const FollowUpReminderSchema: Schema = new Schema(
    {
        hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
        hospitalName: { type: String, required: true },
        patient: { type: Schema.Types.ObjectId, ref: 'User' },
        patientName: { type: String, required: true, trim: true },
        patientPhone: { type: String, required: true, trim: true, index: true },
        patientEmail: { type: String, trim: true },
        originalAppointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
        doctor: { type: Schema.Types.ObjectId, ref: 'Doctor' },
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
        followUpAppointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
        sentAt: { type: Date },
        failureReason: { type: String },
        retryCount: { type: Number, default: 0 },
        notes: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// Compound indexes for optimal querying
FollowUpReminderSchema.index({ hospital: 1, status: 1, reminderDate: 1 });
FollowUpReminderSchema.index({ hospital: 1, followUpDate: 1 });
FollowUpReminderSchema.index({ status: 1, reminderDate: 1 });

export default mongoose.model<IFollowUpReminder>('FollowUpReminder', FollowUpReminderSchema);
