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
exports.createGuestTicket = exports.getMyTickets = exports.updateTicketStatus = exports.getAllTickets = exports.createTicket = void 0;
const SupportTicket_1 = __importDefault(require("../models/SupportTicket"));
const telegram_1 = require("../utils/telegram");
const createTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { subject, message, type } = req.body;
        const userId = req.user._id;
        const ticket = new SupportTicket_1.default({
            userId,
            subject,
            message,
            type
        });
        yield ticket.save();
        // Get requester details from auth user
        const userName = req.user.name || 'Anonymous';
        const userEmail = req.user.email || 'N/A';
        const userPhone = req.user.phone || 'N/A';
        // Format and send Telegram Alert
        const telegramMsg = `🎫 <b>New Support Ticket</b>\n\n` +
            `👤 <b>Name:</b> ${userName}\n` +
            `📧 <b>Email:</b> ${userEmail}\n` +
            `📱 <b>Phone:</b> ${userPhone}\n` +
            `📋 <b>Type:</b> ${type || 'Refund Inquiry'}\n` +
            `📌 <b>Subject:</b> ${subject}\n\n` +
            `✉️ <b>Message:</b>\n<i>"${message}"</i>\n\n` +
            `🕐 <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
        (0, telegram_1.sendTelegramMessage)(telegramMsg).catch(err => {
            console.error('[Telegram] Ticket notification dispatch failed:', err);
        });
        res.status(201).json({ message: "Support ticket created successfully", ticket });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.createTicket = createTicket;
const getAllTickets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tickets = yield SupportTicket_1.default.find().populate('userId', 'name email phone').sort({ createdAt: -1 });
        res.status(200).json(tickets);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getAllTickets = getAllTickets;
const updateTicketStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;
        const ticket = yield SupportTicket_1.default.findByIdAndUpdate(id, { status, adminNotes }, { new: true });
        if (!ticket) {
            return res.status(404).json({ message: "Ticket not found" });
        }
        res.status(200).json({ message: "Ticket updated successfully", ticket });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateTicketStatus = updateTicketStatus;
const getMyTickets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user._id;
        const tickets = yield SupportTicket_1.default.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json(tickets);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getMyTickets = getMyTickets;
const createGuestTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, phone, subject, message } = req.body;
        // Map subject to support ticket type
        let type = 'Other';
        if (subject && (subject.includes('Appointment') || subject.includes('Issue')))
            type = 'General Support';
        else if (subject && (subject.includes('Payment') || subject.includes('Refund')))
            type = 'Return Inquiry';
        else if (subject && subject.includes('Prescription'))
            type = 'Order Issue';
        else if (subject && subject.includes('Account'))
            type = 'General Support';
        else if (subject && subject.includes('Technical'))
            type = 'Technical Issue';
        const ticket = new SupportTicket_1.default({
            guestName: name,
            guestEmail: email,
            guestPhone: phone,
            subject: subject || 'General Query',
            message: message || '',
            type
        });
        yield ticket.save();
        // Format and send Telegram Alert
        const telegramMsg = `🎫 <b>New Support Ticket (GUEST)</b>\n\n` +
            `👤 <b>Name:</b> ${name || 'Anonymous'}\n` +
            `📧 <b>Email:</b> ${email || 'N/A'}\n` +
            `📱 <b>Phone:</b> ${phone || 'N/A'}\n` +
            `📋 <b>Type:</b> ${type}\n` +
            `📌 <b>Subject:</b> ${subject || 'General Query'}\n\n` +
            `✉️ <b>Message:</b>\n<i>"${message}"</i>\n\n` +
            `🕐 <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
        (0, telegram_1.sendTelegramMessage)(telegramMsg).catch(err => {
            console.error('[Telegram] Guest ticket notification dispatch failed:', err);
        });
        res.status(201).json({ message: "Guest ticket created successfully", ticket });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.createGuestTicket = createGuestTicket;
