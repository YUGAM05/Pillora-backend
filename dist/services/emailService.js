"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPrescriptionEmail = exports.sendInvoiceEmail = exports.sendHospitalNotificationEmail = exports.sendBookingConfirmationEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const transporter = nodemailer_1.default.createTransport({
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
const sendBookingConfirmationEmail = (_a) => __awaiter(void 0, [_a], void 0, function* ({ toEmail, patientName, hospitalName, date, timeSlot, bookingId }) {
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
    yield transporter.sendMail(mailOptions);
    console.log('Confirmation email sent to', toEmail);
});
exports.sendBookingConfirmationEmail = sendBookingConfirmationEmail;
const sendHospitalNotificationEmail = (_a) => __awaiter(void 0, [_a], void 0, function* ({ hospitalEmail, hospitalName, patientName, patientEmail, patientPhone, date, timeSlot, bookingId }) {
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
    yield transporter.sendMail(mailOptions);
    console.log('Hospital notification email sent to', hospitalEmail);
});
exports.sendHospitalNotificationEmail = sendHospitalNotificationEmail;
const sendInvoiceEmail = (_a) => __awaiter(void 0, [_a], void 0, function* ({ toEmail, patientName, hospitalName, invoiceUrl, date, amount }) {
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
    yield transporter.sendMail(mailOptions);
    console.log('Invoice email sent to', toEmail);
});
exports.sendInvoiceEmail = sendInvoiceEmail;
const sendPrescriptionEmail = (_a) => __awaiter(void 0, [_a], void 0, function* ({ toEmail, patientName, hospitalName, prescriptionUrl, date }) {
    const mailOptions = {
        from: `"Pillora" <team@pillora.in>`,
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
    yield transporter.sendMail(mailOptions);
    console.log('Prescription email sent to', toEmail);
});
exports.sendPrescriptionEmail = sendPrescriptionEmail;
