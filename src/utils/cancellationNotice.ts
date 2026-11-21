import Notification from '../models/Notification';
import Hospital from '../models/Hospital';
import Doctor from '../models/Doctor';
import User from '../models/User';
import { sendCancellationRefundEmail } from '../services/emailService';
import { sendCountedTemplate } from '../services/usageService';

/**
 * Tell the patient that the hospital (or Pillora) cancelled their appointment and how much is being
 * refunded: an in-app notification, an email, and the WhatsApp template `appointment_cancelled`
 * (patient, hospital, date, time, refund amount). The WhatsApp template must be approved in Meta
 * Business first; until then that send just fails and is logged. Never throws, never blocks.
 */
export const notifyPatientOfCancellation = async (appointment: any, refundAmount: number) => {
    try {
        if (!appointment) return;
        const [hospital, doctor, patient]: any[] = await Promise.all([
            Hospital.findById(appointment.hospital).select('name').lean(),
            appointment.doctor ? Doctor.findById(appointment.doctor).select('name').lean() : null,
            appointment.patient ? User.findById(appointment.patient).select('name email phone phoneNumber').lean() : null
        ]);
        const hospitalName = hospital?.name || 'The hospital';
        const patientName = appointment.patientName || patient?.name || 'Patient';
        const when = appointment.slotTime ? new Date(appointment.slotTime) : null;
        const date = when ? when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';
        const time = when ? when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : String(appointment.appointmentTime || '');
        const bookingRef = String(appointment.tokenNumber || appointment._id || '').slice(-8).toUpperCase();
        const refund = Math.round((Number(refundAmount) || 0) * 100) / 100;
        const refundText = refund > 0 ? ` Your advance of ₹${refund.toFixed(2)} is being refunded and should reach you in 5-7 working days.` : '';

        const jobs: Promise<any>[] = [];

        if (appointment.patient) {
            jobs.push(Notification.create({
                user: appointment.patient,
                message: `${hospitalName} cancelled your appointment on ${date} at ${time}.${refundText}`,
                type: 'warning',
                relatedId: appointment._id
            }));
        }

        const email = appointment.patientEmail || patient?.email;
        if (email) {
            jobs.push(sendCancellationRefundEmail({
                toEmail: email,
                patientName,
                hospitalName,
                doctorName: doctor?.name,
                date,
                timeSlot: time,
                bookingRef,
                refundAmount: refund
            }));
        }

        const phone = appointment.patientPhone || patient?.phoneNumber || patient?.phone;
        if (phone) {
            jobs.push(sendCountedTemplate(
                { hospitalId: appointment.hospital, kind: 'other', appointmentId: appointment._id },
                phone,
                'appointment_cancelled',
                'en',
                [{
                    type: 'body',
                    parameters: [
                        { type: 'text', text: patientName },
                        { type: 'text', text: hospitalName },
                        { type: 'text', text: date || '-' },
                        { type: 'text', text: time || '-' },
                        { type: 'text', text: refund > 0 ? `₹${refund.toFixed(2)}` : '₹0' }
                    ]
                }]
            ));
        }

        const results = await Promise.allSettled(jobs);
        results.forEach((r) => {
            if (r.status === 'rejected') console.error('[CancellationNotice]', (r.reason as any)?.message || r.reason);
        });
    } catch (err: any) {
        console.error('[CancellationNotice] Could not notify patient:', err?.message || err);
    }
};
