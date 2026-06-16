import { Request, Response } from 'express';
import PartnerRequest from '../models/PartnerRequest';
import { logActivity } from '../utils/activityLogger';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendTelegramMessage } from '../utils/telegram';

export const submitPartnerRequest = async (req: any, res: Response) => {
    try {
        const partnerRequest = new PartnerRequest(req.body);
        await partnerRequest.save();
        res.status(201).json({ success: true, message: 'Partner request submitted successfully' });

        // Log Platform Activity
        const io = req.app.get('io');
        logActivity(io, {
            title: 'New Partnership Inquiry',
            description: `${req.body.name} from ${req.body.organization || 'an organization'} wants to partner with us.`,
            type: 'partner'
        });

        // Send Telegram notification based on partner type
        const timestamp = new Date((partnerRequest as any).createdAt || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        if (partnerRequest.type === 'hospital') {
            sendTelegramMessage(
                `👨‍⚕️ <b>New Doctor Partner Request</b>\n👤 Dr. ${partnerRequest.contactPersonName}\n🏥 ${partnerRequest.organizationName}\n📍 ${partnerRequest.city}\n📞 ${partnerRequest.phoneNumber}\n📧 ${partnerRequest.email}\n🕐 ${timestamp}`
            ).catch(err => console.error('Telegram notification failed:', err));
        } else if (partnerRequest.type === 'ngo') {
            sendTelegramMessage(
                `🏢 <b>New NGO Partner Request</b>\n🏢 ${partnerRequest.organizationName}\n👤 ${partnerRequest.contactPersonName}\n📞 ${partnerRequest.phoneNumber}\n📧 ${partnerRequest.email}\n🕐 ${timestamp}`
            ).catch(err => console.error('Telegram notification failed:', err));
        }
    } catch (error: any) {
        console.error('Error submitting partner request:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
};

export const getPartnerRequests = async (req: Request, res: Response) => {
    try {
        const requests = await PartnerRequest.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: requests });
    } catch (error: any) {
        console.error('Error fetching partner requests:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
};

export const updatePartnerRequestStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const request = await PartnerRequest.findByIdAndUpdate(id, { status }, { new: true });
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }
        
        res.status(200).json({ success: true, data: request });
    } catch (error: any) {
        console.error('Error updating partner request status:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
};
