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
