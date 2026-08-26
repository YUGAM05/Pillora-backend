import cron from 'node-cron';
import Appointment from '../models/Appointment';
import { sendWhatsAppTemplate } from '../services/whatsappService';
import { sendSms } from '../services/sms.service';
import { formatDateIST, formatTimeIST } from '../utils/dateHelper';

/**
 * Initializes Appointment Reminders Cron Job.
 * Runs every 15 minutes to check for upcoming appointments needing 24h or 2h reminders.
 */
export const initAppointmentRemindersCron = () => {
    console.log('[Cron] Initializing Appointment Reminders Cron Job (Every 15 mins)');

    cron.schedule('*/15 * * * *', async () => {
        console.log('[Cron] Checking for upcoming appointment reminders (24h & 2h)...');
        try {
            const now = new Date();

            // ─── 1. 24-HOUR REMINDERS ────────────────────────────────────────────────
            const start24h = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
            const end24h = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

            const appts24h = await Appointment.find({
                status: 'confirmed',
                slotTime: { $gte: start24h, $lte: end24h },
                $or: [{ reminder24hSent: false }, { reminder24hSent: { $exists: false } }]
            }).populate('patient').populate('hospital');

            for (const appt of appts24h) {
                const phone = appt.patientPhone || (appt.patient as any)?.phone;
                const patientName = appt.patientName || (appt.patient as any)?.name || 'Patient';
                const hospitalName = appt.hospitalName || (appt.hospital as any)?.name || 'Hospital';
                const dateStr = formatDateIST(appt.slotTime);
                const timeSlotStr = formatTimeIST(appt.slotTime);

                if (phone) {
                    // Send WhatsApp Template Reminder
                    try {
                        await sendWhatsAppTemplate(
                            phone,
                            'appointment_reminder',
                            'en',
                            [
                                {
                                    type: 'body',
                                    parameters: [
                                        { type: 'text', text: patientName },
                                        { type: 'text', text: hospitalName },
                                        { type: 'text', text: `${dateStr} ${timeSlotStr}` },
                                        { type: 'text', text: appt._id.toString() }
                                    ]
                                }
                            ]
                        );
                        console.log(`[Cron 24h Reminder] WhatsApp sent to ${phone} for appointment ${appt._id}`);
                    } catch (waErr: any) {
                        console.error(`[Cron 24h Reminder] WhatsApp error for ${appt._id}:`, waErr.message || waErr);
                    }

                    // Send SMS Reminder alongside
                    try {
                        const message = `Reminder: Hi ${patientName}, your appointment at ${hospitalName} is scheduled for tomorrow at ${timeSlotStr}. Appt ID: ${appt._id}`;
                        await sendSms(phone, message);
                        console.log(`[Cron 24h Reminder] SMS sent to ${phone}`);
                    } catch (smsErr: any) {
                        console.error(`[Cron 24h Reminder] SMS error for ${appt._id}:`, smsErr.message || smsErr);
                    }
                }

                appt.reminder24hSent = true;
                await appt.save();
            }

            // ─── 2. 2-HOUR REMINDERS ─────────────────────────────────────────────────
            const start2h = new Date(now.getTime() + 1.75 * 60 * 60 * 1000);
            const end2h = new Date(now.getTime() + 2.25 * 60 * 60 * 1000);

            const appts2h = await Appointment.find({
                status: 'confirmed',
                slotTime: { $gte: start2h, $lte: end2h },
                $or: [{ reminder2hSent: false }, { reminder2hSent: { $exists: false } }]
            }).populate('patient').populate('hospital');

            for (const appt of appts2h) {
                const phone = appt.patientPhone || (appt.patient as any)?.phone;
                const patientName = appt.patientName || (appt.patient as any)?.name || 'Patient';
                const hospitalName = appt.hospitalName || (appt.hospital as any)?.name || 'Hospital';
                const dateStr = formatDateIST(appt.slotTime);
                const timeSlotStr = formatTimeIST(appt.slotTime);

                if (phone) {
                    // Send WhatsApp Template Reminder
                    try {
                        await sendWhatsAppTemplate(
                            phone,
                            'appointment_reminder',
                            'en',
                            [
                                {
                                    type: 'body',
                                    parameters: [
                                        { type: 'text', text: patientName },
                                        { type: 'text', text: hospitalName },
                                        { type: 'text', text: `${dateStr} ${timeSlotStr}` },
                                        { type: 'text', text: appt._id.toString() }
                                    ]
                                }
                            ]
                        );
                        console.log(`[Cron 2h Reminder] WhatsApp sent to ${phone} for appointment ${appt._id}`);
                    } catch (waErr: any) {
                        console.error(`[Cron 2h Reminder] WhatsApp error for ${appt._id}:`, waErr.message || waErr);
                    }

                    // Send SMS Reminder alongside
                    try {
                        const message = `Reminder: Hi ${patientName}, your appointment at ${hospitalName} is in 2 hours (${timeSlotStr}). Appt ID: ${appt._id}`;
                        await sendSms(phone, message);
                        console.log(`[Cron 2h Reminder] SMS sent to ${phone}`);
                    } catch (smsErr: any) {
                        console.error(`[Cron 2h Reminder] SMS error for ${appt._id}:`, smsErr.message || smsErr);
                    }
                }

                appt.reminder2hSent = true;
                await appt.save();
            }

        } catch (error: any) {
            console.error('[Cron] Error running appointment reminders cron:', error.message || error);
        }
    });
};
