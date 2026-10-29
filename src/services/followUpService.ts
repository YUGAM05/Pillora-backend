import FollowUpReminder, { IFollowUpReminder } from '../models/FollowUpReminder';
import Hospital from '../models/Hospital';
import { sendWhatsAppTemplate, formatPhoneNumber } from './whatsappService';
import { sendSms } from './sms.service';
import nodemailer from 'nodemailer';
import { formatDateIST } from '../utils/dateHelper';

const EMAIL_FROM_NAME = 'Pillora Health';
const EMAIL_FROM_ADDRESS = process.env.EMAIL_USER || 'team@pillora.in';
const DEFAULT_FROM = `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`;

const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Calculates the reminder dispatch date/time in Asia/Kolkata timezone (default 09:00 AM IST).
 * If the resulting reminder time is in the past, sets it to 2 minutes from now.
 */
export const calculateReminderDate = (
    followUpDate: Date | string,
    timing: '1_day_before' | '2_days_before' | '3_days_before' | 'custom',
    customDateTime?: Date | string
): Date => {
    if (timing === 'custom' && customDateTime) {
        let customDate: Date;
        if (typeof customDateTime === 'string') {
            const trimmed = customDateTime.trim();
            // If already an ISO string with Z or offset (+05:30), parse directly
            if (trimmed.endsWith('Z') || trimmed.includes('+') || (trimmed.length > 10 && trimmed.slice(10).includes('-'))) {
                customDate = new Date(trimmed);
            } else {
                // If local string like YYYY-MM-DDTHH:mm from input, explicitly treat as Indian Standard Time (+05:30)
                const dateStr = trimmed.length === 16 ? `${trimmed}:00+05:30` : `${trimmed}+05:30`;
                customDate = new Date(dateStr);
            }
        } else {
            customDate = new Date(customDateTime);
        }

        return isNaN(customDate.getTime()) ? new Date() : customDate;
    }

    const followUp = new Date(followUpDate);
    let daysToSubtract = 1;
    if (timing === '2_days_before') daysToSubtract = 2;
    if (timing === '3_days_before') daysToSubtract = 3;

    // Subtract days from the follow-up date
    const targetDate = new Date(followUp);
    targetDate.setDate(targetDate.getDate() - daysToSubtract);

    // Set to 09:00 AM IST (which is 03:30 AM UTC: 9 - 5.5 = 3.5)
    // Using UTC setter so it is server-timezone agnostic
    const reminderUtc = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        3, 30, 0, 0
    ));

    const now = new Date();
    // If the calculated time is already in the past (e.g. scheduling for tomorrow at noon), schedule 2 minutes from now
    if (reminderUtc.getTime() <= now.getTime()) {
        return new Date(now.getTime() + 2 * 60 * 1000);
    }

    return reminderUtc;
};

/**
 * Constructs user-friendly reminder text following Pillora guidelines.
 * Accurately distinguishes between Recommended Follow-Up vs Confirmed Appointment.
 */
export const constructReminderMessage = (reminder: IFollowUpReminder, hospitalSlug?: string): {
    subject: string;
    textMessage: string;
    htmlMessage: string;
} => {
    const formattedDate = formatDateIST(reminder.followUpDate);
    const timeStr = reminder.followUpTime ? ` at ${reminder.followUpTime}` : '';
    const reasonStr = reminder.reason ? `Reason / Notes: ${reminder.reason}. ` : '';
    const bookingUrl = hospitalSlug
        ? `https://www.pillorahospital.in/hospitals/${hospitalSlug}`
        : 'https://www.pillorahospital.in/hospitals';

    if (reminder.isConfirmedBooking) {
        const subject = `Confirmed Follow-Up Reminder - ${reminder.hospitalName}`;
        const textMessage = `Hello ${reminder.patientName}, this is a reminder from ${reminder.hospitalName}. Your confirmed follow-up consultation with Dr. ${reminder.doctorName} is scheduled for ${formattedDate}${timeStr}. ${reasonStr}Please arrive 10 minutes prior to your time. Contact ${reminder.hospitalName} for any assistance.`;
        const htmlMessage = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
                <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <h2 style="color: #065f46; margin: 0 0 6px 0; font-size: 20px;">Confirmed Follow-Up Appointment ✅</h2>
                    <p style="color: #047857; margin: 0; font-size: 13px;">This appointment is confirmed in our hospital schedule.</p>
                </div>
                <p style="font-size: 15px; color: #334155; line-height: 1.6;">
                    Hello <strong>${reminder.patientName}</strong>,<br/>
                    This is a reminder that your follow-up appointment is scheduled for tomorrow with <strong>Dr. ${reminder.doctorName}</strong>.
                </p>
                <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 4px 0; color: #1e293b;"><strong>Hospital:</strong> ${reminder.hospitalName}</p>
                    <p style="margin: 4px 0; color: #1e293b;"><strong>Doctor:</strong> Dr. ${reminder.doctorName} ${reminder.department ? `(${reminder.department})` : ''}</p>
                    <p style="margin: 4px 0; color: #1e293b;"><strong>Date & Time:</strong> ${formattedDate}${timeStr}</p>
                    ${reminder.reason ? `<p style="margin: 4px 0; color: #1e293b;"><strong>Purpose:</strong> ${reminder.reason}</p>` : ''}
                </div>
                <p style="font-size: 13px; color: #64748b;">Please arrive 10 minutes before your scheduled time. We look forward to seeing you!</p>
            </div>
        `;
        return { subject, textMessage, htmlMessage };
    } else {
        const subject = `Recommended Follow-Up Reminder - ${reminder.hospitalName}`;
        const textMessage = `Hello ${reminder.patientName}, this is a reminder from ${reminder.hospitalName}. Dr. ${reminder.doctorName} has recommended a follow-up checkup on ${formattedDate}${timeStr}. ${reasonStr}Please contact the hospital or visit ${bookingUrl} to book an appointment if needed. (Note: This is a recommended follow-up, not a confirmed appointment).`;
        const htmlMessage = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
                <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <h2 style="color: #92400e; margin: 0 0 6px 0; font-size: 20px;">Recommended Doctor Follow-Up 🔔</h2>
                    <p style="color: #b45309; margin: 0; font-size: 13px;">Your doctor recommended returning for a checkup on this date.</p>
                </div>
                <p style="font-size: 15px; color: #334155; line-height: 1.6;">
                    Hello <strong>${reminder.patientName}</strong>,<br/>
                    During your previous consultation at <strong>${reminder.hospitalName}</strong>, <strong>Dr. ${reminder.doctorName}</strong> recommended a follow-up review around <strong>${formattedDate}</strong>.
                </p>
                <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 4px 0; color: #1e293b;"><strong>Hospital:</strong> ${reminder.hospitalName}</p>
                    <p style="margin: 4px 0; color: #1e293b;"><strong>Doctor:</strong> Dr. ${reminder.doctorName} ${reminder.department ? `(${reminder.department})` : ''}</p>
                    <p style="margin: 4px 0; color: #1e293b;"><strong>Recommended Date:</strong> ${formattedDate}${timeStr}</p>
                    ${reminder.reason ? `<p style="margin: 4px 0; color: #1e293b;"><strong>Reason:</strong> ${reminder.reason}</p>` : ''}
                </div>
                <div style="margin: 24px 0;">
                    <a href="${bookingUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px; display: inline-block;">
                        Book Appointment Online
                    </a>
                </div>
                <p style="font-size: 12px; color: #64748b; margin-top: 16px;">
                    <em>Note: If you have already booked your visit or attended this consultation, please disregard this reminder.</em>
                </p>
            </div>
        `;
        return { subject, textMessage, htmlMessage };
    }
};

/**
 * Dispatches a single scheduled follow-up reminder through the configured channel.
 */
export const dispatchFollowUpReminder = async (
    reminderId: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const reminder = await FollowUpReminder.findById(reminderId);
        if (!reminder) {
            return { success: false, error: 'Reminder not found' };
        }

        if (reminder.status === 'cancelled') {
            return { success: false, error: 'Reminder was cancelled' };
        }

        if (reminder.status === 'sent') {
            return { success: true };
        }

        const hospital = await Hospital.findById(reminder.hospital);
        const { subject, textMessage, htmlMessage } = constructReminderMessage(reminder, hospital?.slug);

        let deliverySuccess = false;
        let deliveryError = '';

        // 1. WhatsApp Delivery
        if (reminder.channel === 'whatsapp') {
            try {
                const targetPhone = formatPhoneNumber(reminder.patientPhone);
                const formattedDate = formatDateIST(reminder.followUpDate);
                const timeSlotStr = reminder.followUpTime || '10:00 AM';
                const docName = reminder.doctorName
                    ? (reminder.doctorName.trim().toLowerCase().startsWith('dr') ? reminder.doctorName.trim() : `Dr. ${reminder.doctorName.trim()}`)
                    : 'Consultant Doctor';

                // Meta approved 'appointment_reminder' template expects 5 body parameters:
                // {{1}} Patient Name, {{2}} Doctor Name, {{3}} Hospital Name, {{4}} Date, {{5}} Time
                const waResult = await sendWhatsAppTemplate(
                    targetPhone,
                    'appointment_reminder',
                    'en',
                    [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: reminder.patientName || 'Patient' },
                                { type: 'text', text: docName },
                                { type: 'text', text: reminder.hospitalName || 'Pillora Hospital' },
                                { type: 'text', text: formattedDate },
                                { type: 'text', text: timeSlotStr }
                            ]
                        }
                    ]
                );

                if (waResult.success) {
                    deliverySuccess = true;
                } else {
                    // Fallback to sending SMS if WhatsApp template failed
                    const waErrString = typeof waResult.error === 'object' ? JSON.stringify(waResult.error) : String(waResult.error || 'WhatsApp error');
                    console.log(`[FollowUpService] WhatsApp template failed (${waErrString}), attempting SMS fallback for ${targetPhone}...`);
                    const smsRes = await sendSms(reminder.patientPhone, textMessage);
                    deliverySuccess = smsRes.success;
                    if (!smsRes.success) {
                        deliveryError = `WhatsApp: ${waErrString} | SMS: ${smsRes.error || 'SMS failed'}`;
                    }
                }
            } catch (err: any) {
                deliveryError = err.message || 'WhatsApp sending failed';
            }
        }

        // 2. SMS Delivery
        else if (reminder.channel === 'sms') {
            try {
                const smsRes = await sendSms(reminder.patientPhone, textMessage);
                deliverySuccess = smsRes.success;
                if (!smsRes.success) deliveryError = smsRes.error || 'SMS failed';
            } catch (err: any) {
                deliveryError = err.message || 'SMS error';
            }
        }

        // 3. Email Delivery
        else if (reminder.channel === 'email') {
            if (!reminder.patientEmail) {
                deliverySuccess = false;
                deliveryError = 'Patient email address is missing for email channel';
            } else {
                try {
                    await transporter.sendMail({
                        from: DEFAULT_FROM,
                        to: reminder.patientEmail,
                        subject,
                        text: textMessage,
                        html: htmlMessage,
                    });
                    deliverySuccess = true;
                } catch (err: any) {
                    deliveryError = err.message || 'Email delivery failed';
                }
            }
        }

        // Update Reminder outcome in Database
        if (deliverySuccess) {
            reminder.status = 'sent';
            reminder.sentAt = new Date();
            reminder.failureReason = undefined;
            await reminder.save();
            console.log(`[FollowUpService] ✅ Follow-up reminder ${reminder._id} successfully sent to ${reminder.patientName} (${reminder.channel})`);
            return { success: true };
        } else {
            reminder.status = 'failed';
            reminder.failureReason = deliveryError || 'Unknown delivery failure';
            reminder.retryCount = (reminder.retryCount || 0) + 1;
            await reminder.save();
            console.error(`[FollowUpService] ❌ Follow-up reminder ${reminder._id} failed: ${deliveryError}`);
            return { success: false, error: deliveryError };
        }

    } catch (error: any) {
        console.error('[FollowUpService] Unexpected error:', error);
        return { success: false, error: error.message || 'Unexpected error' };
    }
};
