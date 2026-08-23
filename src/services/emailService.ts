import nodemailer from 'nodemailer';

const EMAIL_FROM_NAME = 'Pillora';
const EMAIL_FROM_ADDRESS = process.env.EMAIL_USER || 'team@pillora.in';
const DEFAULT_FROM = `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`;
const BLOOD_CONNECT_FROM = `"Pillora Blood Connect" <${EMAIL_FROM_ADDRESS}>`;

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.in',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Verify transporter connection with SMTP server
 */
export const verifyEmailTransporter = async (): Promise<boolean> => {
  try {
    await transporter.verify();
    console.log('[EmailService] SMTP transporter connection verified successfully.');
    return true;
  } catch (error: any) {
    console.error('[EmailService] SMTP transporter verification failed:', error.message);
    return false;
  }
};

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
  if (!toEmail) {
    console.error('[EmailService] Cannot send booking confirmation: toEmail is missing');
    return;
  }
  try {
    const mailOptions = {
      from: DEFAULT_FROM,
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
  } catch (error: any) {
    console.error('Error sending confirmation email to', toEmail, ':', error.message);
  }
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
  if (!hospitalEmail) {
    console.error('[EmailService] Cannot send hospital notification: hospitalEmail is missing');
    return;
  }
  try {
    const mailOptions = {
      from: DEFAULT_FROM,
      to: hospitalEmail,
      subject: `New Appointment Booked - ${patientName} | ${date} ${timeSlot}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #e63946;">New Appointment Booked 🏥</h2>
          <p>A new appointment has been booked at <strong>${hospitalName}</strong>.</p>
          <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background:#f8f8f8;">
              <td style="padding:10px; border:1px solid #ddd;"><strong>Patient Name</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">${patientName}</td>
            </tr>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>Patient Email</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">${patientEmail}</td>
            </tr>
            <tr style="background:#f8f8f8;">
              <td style="padding:10px; border:1px solid #ddd;"><strong>Patient Phone</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">${patientPhone}</td>
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
          <p style="color: #888; font-size: 12px;">This is an automated notification from Pillora. Please do not reply.</p>
          <hr/>
          <p style="text-align:center; color:#e63946; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Hospital notification email sent to', hospitalEmail);
  } catch (error: any) {
    console.error('Error sending hospital notification email to', hospitalEmail, ':', error.message);
  }
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
  if (!toEmail) {
    console.error('[EmailService] Cannot send invoice email: toEmail is missing');
    return;
  }
  try {
    const mailOptions = {
      from: DEFAULT_FROM,
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
  } catch (error: any) {
    console.error('Error sending invoice email to', toEmail, ':', error.message);
  }
};

export interface PrescriptionEmailProps {
  toEmail: string;
  patientName: string;
  hospitalName: string;
  prescriptionUrl: string;
  date: string;
}

export const sendPrescriptionEmail = async ({
  toEmail,
  patientName,
  hospitalName,
  prescriptionUrl,
  date
}: PrescriptionEmailProps) => {
  if (!toEmail) {
    console.error('[EmailService] Cannot send prescription email: toEmail is missing');
    return;
  }
  try {
    const mailOptions = {
      from: DEFAULT_FROM,
      to: toEmail,
      subject: `Your Prescription - ${hospitalName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #10b981;">Prescription Uploaded 📝</h2>
          <p>Hi <strong>${patientName}</strong>,</p>
          <p>Your prescription for the consultation at <strong>${hospitalName}</strong> on ${date} has been uploaded and is ready for download.</p>
          <p>You can view and download your prescription using the link below:</p>
          <a href="${prescriptionUrl}" style="display:inline-block; padding:10px 20px; color:#fff; background:#10b981; text-decoration:none; border-radius:5px; margin:20px 0;">Download Prescription</a>
          <p style="color: #888; font-size: 12px;">This is an automated email from Pillora. Please do not reply.</p>
          <hr/>
          <p style="text-align:center; color:#10b981; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Prescription email sent to', toEmail);
  } catch (error: any) {
    console.error('Error sending prescription email to', toEmail, ':', error.message);
  }
};

export interface KYCFailedEmailProps {
  toEmail: string;
  patientName: string;
}

export const sendKYCFailedEmail = async ({ toEmail, patientName }: KYCFailedEmailProps) => {
  if (!toEmail) {
    console.error('[EmailService] Cannot send KYC failed email: toEmail is missing');
    return;
  }
  try {
    const mailOptions = {
      from: BLOOD_CONNECT_FROM,
      to: toEmail,
      subject: `Blood Request Verification Failed - Pillora`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #e63946;">KYC Verification Failed ❌</h2>
          <p>Hi <strong>${patientName}</strong>,</p>
          <p>We regret to inform you that your blood request could not be verified. Your KYC verification has <strong>failed</strong>.</p>
          <p>This could be due to:</p>
          <ul>
            <li>Incomplete or incorrect documents submitted</li>
            <li>Information mismatch in the request form</li>
            <li>Invalid or unclear document images</li>
          </ul>
          <p>Please resubmit your blood request with correct and valid documents.</p>
          <p style="color: #888; font-size: 12px;">If you believe this is an error please contact us at team@pillora.in</p>
          <hr/>
          <p style="text-align:center; color:#e63946; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log('KYC failed email sent to', toEmail);
  } catch (error) {
    console.error('Error sending KYC failed email:', error);
  }
};

export interface NoDonorFoundEmailProps {
  toEmail: string;
  patientName: string;
  bloodGroup: string;
  city: string;
  area: string;
}

export const sendNoDonorFoundEmail = async ({ toEmail, patientName, bloodGroup, city, area }: NoDonorFoundEmailProps) => {
  if (!toEmail) {
    console.error('[EmailService] Cannot send No Donor Found email: toEmail is missing');
    return;
  }
  try {
    const mailOptions = {
      from: BLOOD_CONNECT_FROM,
      to: toEmail,
      subject: `No Blood Donor Found in Your Area - Pillora`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #e63946;">No Donor Found 😔</h2>
          <p>Hi <strong>${patientName}</strong>,</p>
          <p>Your KYC verification was <strong style="color:green;">successful</strong>, however we could not find any available <strong>${bloodGroup}</strong> blood donors in your area.</p>
          <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background:#f8f8f8;">
              <td style="padding:10px; border:1px solid #ddd;"><strong>Blood Group Needed</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">${bloodGroup}</td>
            </tr>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>City</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">${city}</td>
            </tr>
            <tr style="background:#f8f8f8;">
              <td style="padding:10px; border:1px solid #ddd;"><strong>Area</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">${area}</td>
            </tr>
          </table>
          <p>We will notify you as soon as a matching donor becomes available in your area.</p>
          <p>You can also try contacting nearby blood banks or hospitals directly.</p>
          <p style="color: #888; font-size: 12px;">For urgent help contact us at team@pillora.in or call your nearest blood bank.</p>
          <hr/>
          <p style="text-align:center; color:#e63946; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log('No donor found email sent to', toEmail);
  } catch (error) {
    console.error('Error sending No Donor Found email:', error);
  }
};

export interface DonorFoundProps {
  name: string;
  bloodGroup: string;
  phone: string;
  area: string;
  city: string;
}

export interface DonorFoundEmailProps {
  toEmail: string;
  patientName: string;
  bloodGroup: string;
  unitsNeeded: number;
  requestArea?: string;
  requestCity?: string;
  donors: DonorFoundProps[];
}

export const sendDonorFoundEmail = async ({
  toEmail,
  patientName,
  bloodGroup,
  unitsNeeded,
  requestArea,
  requestCity,
  donors
}: DonorFoundEmailProps) => {
  if (!toEmail) {
    console.error('[EmailService] Cannot send Donor Found email: toEmail is missing');
    return;
  }
  try {
    const donorRows = donors.map(donor => `
      <tr>
        <td style="padding:10px; border:1px solid #ddd;">${donor.name}</td>
        <td style="padding:10px; border:1px solid #ddd;">${donor.bloodGroup}</td>
        <td style="padding:10px; border:1px solid #ddd;">${donor.phone}</td>
        <td style="padding:10px; border:1px solid #ddd;">${donor.area}, ${donor.city}</td>
      </tr>
    `).join('');

    const mailOptions = {
      from: BLOOD_CONNECT_FROM,
      to: toEmail,
      subject: `Blood Donor(s) Found - Pillora Blood Connect`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #e63946;">Blood Donor(s) Found! 🩸</h2>
          <p>Hi <strong>${patientName}</strong>,</p>
          <p>Great news! Your KYC verification was <strong style="color:green;">successful</strong> and we found <strong>${donors.length}</strong> matching <strong>${bloodGroup}</strong> donor(s) in your area.</p>
          <p><strong>Units Needed:</strong> ${unitsNeeded}</p>
          <p><strong>Your Request Location:</strong> ${requestArea}, ${requestCity}</p>
          <p>The following donors are available near your area:</p>
          <h3 style="color:#e63946;">Donor Details:</h3>
          <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background:#e63946; color:white;">
                <th style="padding:10px; border:1px solid #ddd;">Name</th>
                <th style="padding:10px; border:1px solid #ddd;">Blood Group</th>
                <th style="padding:10px; border:1px solid #ddd;">Phone</th>
                <th style="padding:10px; border:1px solid #ddd;">Location</th>
              </tr>
            </thead>
            <tbody>
              ${donorRows}
            </tbody>
          </table>
          <p>Please contact the donor(s) directly using the phone numbers above.</p>
          <p style="color:#e63946; font-weight:bold;">⚠️ Please be respectful and confirm availability before proceeding.</p>
          <p style="color: #888; font-size: 12px;">This is an automated email from Pillora Blood Connect. Please do not reply to this email.</p>
          <hr/>
          <p style="text-align:center; color:#e63946; font-weight:bold;">Pillora — Blood Donors & Hospital Network</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log('Donor found email sent to', toEmail);
  } catch (error) {
    console.error('Error sending Donor Found email:', error);
  }
};

interface PasswordResetProps {
  toEmail: string;
  name: string;
  resetLink: string;
}

export const sendPasswordResetEmail = async ({
  toEmail,
  name,
  resetLink
}: PasswordResetProps) => {
  if (!toEmail) {
    console.error('[EmailService] Cannot send Password Reset email: toEmail is missing');
    throw new Error('Recipient email is missing');
  }
  const mailOptions = {
    from: DEFAULT_FROM,
    to: toEmail,
    subject: 'Reset Your Pillora Password',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px 20px; background-color: #f8fafc;">
        <div style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #3b82f6; margin: 0; font-size: 28px; font-weight: 800; tracking-tight: -0.025em;">Pillora</h2>
            <p style="color: #64748b; font-size: 14px; margin-top: 4px; font-weight: 500;">Your Health, Secure and Connected</p>
          </div>
          
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 30px;" />
          
          <p style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px;">Hello ${name},</p>
          
          <p style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px;">We received a request to reset your password. Click the button below to create a new password.</p>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="${resetLink}" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2); transition: all 0.2s ease;">Reset Password</a>
          </div>
          
          <p style="font-size: 14px; color: #ef4444; background-color: #fef2f2; border: 1px solid #fee2e2; padding: 12px 16px; border-radius: 8px; font-weight: 500; margin-bottom: 24px;">
            ⚠️ This link expires in 15 minutes.
          </p>
          
          <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 30px;">If you didn't request this, you can safely ignore this email.</p>
          
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 24px;" />
          
          <p style="font-size: 14px; color: #64748b; margin: 0; line-height: 1.5;">Regards,<br><strong style="color: #334155;">Team Pillora</strong></p>
        </div>
        <div style="text-align: center; margin-top: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated email from Pillora. Please do not reply.</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to', toEmail);
  } catch (error) {
    console.error('Error sending Password Reset email:', error);
    throw error;
  }
};



