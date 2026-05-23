import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.in',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

interface BookingConfirmationProps {
  toEmail: string;
  patientName: string;
  hospitalName: string;
  date: string;
  timeSlot: string;
  bookingId: string;
}

export const sendBookingConfirmationEmail = async ({
  toEmail,
  patientName,
  hospitalName,
  date,
  timeSlot,
  bookingId
}: BookingConfirmationProps) => {
  const mailOptions = {
    from: `"Pillora" <team@pillora.in>`,
    to: toEmail,
    subject: `Appointment Confirmed - ${hospitalName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #e63946;">Appointment Confirmed ✅</h2>
        <p>Hi <strong>${patientName}</strong>,</p>
        <p>Your appointment has been successfully booked.</p>
        <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background:#f8f8f8;">
            <td style="padding:10px; border:1px solid #ddd;"><strong>Hospital</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">${hospitalName}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #ddd;"><strong>Date</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">${date}</td>
          </tr>
          <tr style="background:#f8f8f8;">
            <td style="padding:10px; border:1px solid #ddd;"><strong>Time Slot</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">${timeSlot}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #ddd;"><strong>Booking ID</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">${bookingId}</td>
          </tr>
        </table>
        <p>Please arrive <strong>10 minutes early</strong> for your appointment.</p>
        <p style="color: #888; font-size: 12px;">This is an automated email from Pillora. Please do not reply.</p>
        <hr/>
        <p style="text-align:center; color:#e63946; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log('Confirmation email sent to', toEmail);
};

export interface HospitalNotificationProps {
  hospitalEmail: string;
  hospitalName: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  date: string;
  timeSlot: string;
  bookingId: string;
}

export const sendHospitalNotificationEmail = async ({
  hospitalEmail,
  hospitalName,
  patientName,
  patientEmail,
  patientPhone,
  date,
  timeSlot,
  bookingId
}: HospitalNotificationProps) => {
  const mailOptions = {
    from: `"Pillora" <team@pillora.in>`,
    to: hospitalEmail,
    subject: `New Appointment Booked - ${patientName} | ${date} ${timeSlot}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #e63946;">New Appointment Booked 🏥</h2>
        <p>A new appointment has been booked at <strong>\${hospitalName}</strong>.</p>
        <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background:#f8f8f8;">
            <td style="padding:10px; border:1px solid #ddd;"><strong>Patient Name</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">\${patientName}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #ddd;"><strong>Patient Email</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">\${patientEmail}</td>
          </tr>
          <tr style="background:#f8f8f8;">
            <td style="padding:10px; border:1px solid #ddd;"><strong>Patient Phone</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">\${patientPhone}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #ddd;"><strong>Date</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">\${date}</td>
          </tr>
          <tr style="background:#f8f8f8;">
            <td style="padding:10px; border:1px solid #ddd;"><strong>Time Slot</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">\${timeSlot}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #ddd;"><strong>Booking ID</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">\${bookingId}</td>
          </tr>
        </table>
        <p style="color: #888; font-size: 12px;">This is an automated notification from Pillora. Please do not reply.</p>
        <hr/>
        <p style="text-align:center; color:#e63946; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log('Hospital notification email sent to', hospitalEmail);
};

export interface InvoiceEmailProps {
  toEmail: string;
  patientName: string;
  hospitalName: string;
  invoiceUrl: string;
  date: string;
  amount: number;
}

export const sendInvoiceEmail = async ({
  toEmail,
  patientName,
  hospitalName,
  invoiceUrl,
  date,
  amount
}: InvoiceEmailProps) => {
  const mailOptions = {
    from: `"Pillora" <team@pillora.in>`,
    to: toEmail,
    subject: `Your Invoice - ${hospitalName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #e63946;">Invoice Generated 📄</h2>
        <p>Hi <strong>${patientName}</strong>,</p>
        <p>Your invoice for the consultation at <strong>${hospitalName}</strong> on ${date} has been generated.</p>
        <p><strong>Total Amount:</strong> ₹${amount}</p>
        <p>You can view and download your invoice using the link below:</p>
        <a href="${invoiceUrl}" style="display:inline-block; padding:10px 20px; color:#fff; background:#e63946; text-decoration:none; border-radius:5px; margin:20px 0;">Download Invoice</a>
        <p style="color: #888; font-size: 12px;">This is an automated email from Pillora. Please do not reply.</p>
        <hr/>
        <p style="text-align:center; color:#e63946; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log('Invoice email sent to', toEmail);
};
