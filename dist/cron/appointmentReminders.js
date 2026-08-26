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
exports.initAppointmentRemindersCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const whatsappService_1 = require("../services/whatsappService");
const sms_service_1 = require("../services/sms.service");
const dateHelper_1 = require("../utils/dateHelper");
/**
 * Initializes Appointment Reminders Cron Job.
 * Runs every 15 minutes to check for upcoming appointments needing 24h or 2h reminders.
 */
const initAppointmentRemindersCron = () => {
    console.log('[Cron] Initializing Appointment Reminders Cron Job (Every 15 mins)');
    node_cron_1.default.schedule('*/15 * * * *', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        console.log('[Cron] Checking for upcoming appointment reminders (24h & 2h)...');
        try {
            const now = new Date();
            // ─── 1. 24-HOUR REMINDERS ────────────────────────────────────────────────
            const start24h = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
            const end24h = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);
            const appts24h = yield Appointment_1.default.find({
                status: 'confirmed',
                slotTime: { $gte: start24h, $lte: end24h },
                $or: [{ reminder24hSent: false }, { reminder24hSent: { $exists: false } }]
            }).populate('patient').populate('hospital');
            for (const appt of appts24h) {
                const phone = appt.patientPhone || ((_a = appt.patient) === null || _a === void 0 ? void 0 : _a.phone);
                const patientName = appt.patientName || ((_b = appt.patient) === null || _b === void 0 ? void 0 : _b.name) || 'Patient';
                const hospitalName = appt.hospitalName || ((_c = appt.hospital) === null || _c === void 0 ? void 0 : _c.name) || 'Hospital';
                const dateStr = (0, dateHelper_1.formatDateIST)(appt.slotTime);
                const timeSlotStr = (0, dateHelper_1.formatTimeIST)(appt.slotTime);
                if (phone) {
                    // Send WhatsApp Template Reminder
                    try {
                        yield (0, whatsappService_1.sendWhatsAppTemplate)(phone, 'appointment_reminder', 'en', [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: patientName },
                                    { type: 'text', text: hospitalName },
                                    { type: 'text', text: `${dateStr} ${timeSlotStr}` },
                                    { type: 'text', text: appt._id.toString() }
                                ]
                            }
                        ]);
                        console.log(`[Cron 24h Reminder] WhatsApp sent to ${phone} for appointment ${appt._id}`);
                    }
                    catch (waErr) {
                        console.error(`[Cron 24h Reminder] WhatsApp error for ${appt._id}:`, waErr.message || waErr);
                    }
                    // Send SMS Reminder alongside
                    try {
                        const message = `Reminder: Hi ${patientName}, your appointment at ${hospitalName} is scheduled for tomorrow at ${timeSlotStr}. Appt ID: ${appt._id}`;
                        yield (0, sms_service_1.sendSms)(phone, message);
                        console.log(`[Cron 24h Reminder] SMS sent to ${phone}`);
                    }
                    catch (smsErr) {
                        console.error(`[Cron 24h Reminder] SMS error for ${appt._id}:`, smsErr.message || smsErr);
                    }
                }
                appt.reminder24hSent = true;
                yield appt.save();
            }
            // ─── 2. 2-HOUR REMINDERS ─────────────────────────────────────────────────
            const start2h = new Date(now.getTime() + 1.75 * 60 * 60 * 1000);
            const end2h = new Date(now.getTime() + 2.25 * 60 * 60 * 1000);
            const appts2h = yield Appointment_1.default.find({
                status: 'confirmed',
                slotTime: { $gte: start2h, $lte: end2h },
                $or: [{ reminder2hSent: false }, { reminder2hSent: { $exists: false } }]
            }).populate('patient').populate('hospital');
            for (const appt of appts2h) {
                const phone = appt.patientPhone || ((_d = appt.patient) === null || _d === void 0 ? void 0 : _d.phone);
                const patientName = appt.patientName || ((_e = appt.patient) === null || _e === void 0 ? void 0 : _e.name) || 'Patient';
                const hospitalName = appt.hospitalName || ((_f = appt.hospital) === null || _f === void 0 ? void 0 : _f.name) || 'Hospital';
                const dateStr = (0, dateHelper_1.formatDateIST)(appt.slotTime);
                const timeSlotStr = (0, dateHelper_1.formatTimeIST)(appt.slotTime);
                if (phone) {
                    // Send WhatsApp Template Reminder
                    try {
                        yield (0, whatsappService_1.sendWhatsAppTemplate)(phone, 'appointment_reminder', 'en', [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: patientName },
                                    { type: 'text', text: hospitalName },
                                    { type: 'text', text: `${dateStr} ${timeSlotStr}` },
                                    { type: 'text', text: appt._id.toString() }
                                ]
                            }
                        ]);
                        console.log(`[Cron 2h Reminder] WhatsApp sent to ${phone} for appointment ${appt._id}`);
                    }
                    catch (waErr) {
                        console.error(`[Cron 2h Reminder] WhatsApp error for ${appt._id}:`, waErr.message || waErr);
                    }
                    // Send SMS Reminder alongside
                    try {
                        const message = `Reminder: Hi ${patientName}, your appointment at ${hospitalName} is in 2 hours (${timeSlotStr}). Appt ID: ${appt._id}`;
                        yield (0, sms_service_1.sendSms)(phone, message);
                        console.log(`[Cron 2h Reminder] SMS sent to ${phone}`);
                    }
                    catch (smsErr) {
                        console.error(`[Cron 2h Reminder] SMS error for ${appt._id}:`, smsErr.message || smsErr);
                    }
                }
                appt.reminder2hSent = true;
                yield appt.save();
            }
        }
        catch (error) {
            console.error('[Cron] Error running appointment reminders cron:', error.message || error);
        }
    }));
};
exports.initAppointmentRemindersCron = initAppointmentRemindersCron;
