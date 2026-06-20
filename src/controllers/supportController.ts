import { Request, Response } from 'express';
import SupportTicket from '../models/SupportTicket';
import { sendTelegramMessage } from '../utils/telegram';

export const createTicket = async (req: any, res: Response) => {
    try {
        const { subject, message, type } = req.body;
        const userId = req.user._id;

        const ticket = new SupportTicket({
            userId,
            subject,
            message,
            type
        });

        await ticket.save();

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

        sendTelegramMessage(telegramMsg).catch(err => {
            console.error('[Telegram] Ticket notification dispatch failed:', err);
        });

        res.status(201).json({ message: "Support ticket created successfully", ticket });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getAllTickets = async (req: Request, res: Response) => {
    try {
        const tickets = await SupportTicket.find().populate('userId', 'name email phone').sort({ createdAt: -1 });
        res.status(200).json(tickets);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;

        const ticket = await SupportTicket.findByIdAndUpdate(
            id,
            { status, adminNotes },
            { new: true }
        );

        if (!ticket) {
            return res.status(404).json({ message: "Ticket not found" });
        }

        res.status(200).json({ message: "Ticket updated successfully", ticket });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getMyTickets = async (req: any, res: Response) => {
    try {
        const userId = req.user._id;
        const tickets = await SupportTicket.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json(tickets);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
