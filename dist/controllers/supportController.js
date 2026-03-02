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
exports.getMyTickets = exports.updateTicketStatus = exports.getAllTickets = exports.createTicket = void 0;
const SupportTicket_1 = __importDefault(require("../models/SupportTicket"));
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
