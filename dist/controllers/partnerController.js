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
exports.updatePartnerRequestStatus = exports.getPartnerRequests = exports.submitPartnerRequest = void 0;
const PartnerRequest_1 = __importDefault(require("../models/PartnerRequest"));
const activityLogger_1 = require("../utils/activityLogger");
const submitPartnerRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const partnerRequest = new PartnerRequest_1.default(req.body);
        yield partnerRequest.save();
        res.status(201).json({ success: true, message: 'Partner request submitted successfully' });
        // Log Platform Activity
        const io = req.app.get('io');
        (0, activityLogger_1.logActivity)(io, {
            title: 'New Partnership Inquiry',
            description: `${req.body.name} from ${req.body.organization || 'an organization'} wants to partner with us.`,
            type: 'partner'
        });
    }
    catch (error) {
        console.error('Error submitting partner request:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
});
exports.submitPartnerRequest = submitPartnerRequest;
const getPartnerRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requests = yield PartnerRequest_1.default.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: requests });
    }
    catch (error) {
        console.error('Error fetching partner requests:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
});
exports.getPartnerRequests = getPartnerRequests;
const updatePartnerRequestStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const request = yield PartnerRequest_1.default.findByIdAndUpdate(id, { status }, { new: true });
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }
        res.status(200).json({ success: true, data: request });
    }
    catch (error) {
        console.error('Error updating partner request status:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
});
exports.updatePartnerRequestStatus = updatePartnerRequestStatus;
