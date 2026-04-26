import { Request, Response } from 'express';
import PartnerRequest from '../models/PartnerRequest';

export const submitPartnerRequest = async (req: Request, res: Response) => {
    try {
        const partnerRequest = new PartnerRequest(req.body);
        await partnerRequest.save();
        res.status(201).json({ success: true, message: 'Partner request submitted successfully' });
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
