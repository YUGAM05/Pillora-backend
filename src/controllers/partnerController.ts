import { Request, Response } from 'express';
import PartnerRequest from '../models/PartnerRequest';
import { logActivity } from '../utils/activityLogger';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendTelegramMessage, escapeTelegramHtml } from '../utils/telegram';

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, maxItems = 30): string[] | undefined => {
    const arr = Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? [v] : []);
    const out = arr.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().slice(0, 100)).slice(0, maxItems);
    return out.length ? out : undefined;
};
const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : undefined;
};

export const submitPartnerRequest = async (req: any, res: Response) => {
    try {
        const body = req.body || {};
        const type = body.type === 'ngo' ? 'ngo' : 'hospital';

        // Only known fields are stored (no mass assignment of status etc.).
        // `description` is accepted as an alias of `message` (older /partners page).
        const data: Record<string, any> = {
            type,
            organizationName: str(body.organizationName, 200),
            city: str(body.city, 100),
            area: str(body.area, 150),
            address: str(body.address, 500),
            contactPersonName: str(body.contactPersonName, 150),
            designation: str(body.designation, 100),
            phoneNumber: str(body.phoneNumber, 20),
            email: str(body.email, 200).toLowerCase(),
            message: str(body.message, 3000) || str(body.description, 3000) || undefined,
            facilityType: str(body.facilityType, 100) || undefined,
            registrationNumber: str(body.registrationNumber, 100) || undefined,
            specializations: strList(body.specializations),
            doctorCount: num(body.doctorCount),
            facilities: strList(body.facilities),
            governmentSchemes: strList(body.governmentSchemes),
            ngoType: str(body.ngoType, 100) || undefined,
            donorCount: num(body.donorCount),
            isDigitized: str(body.isDigitized, 50) || undefined,
            areasCovered: str(body.areasCovered, 500) || undefined,
            bloodGroups: strList(body.bloodGroups, 8),
            interestedPlan: str(body.interestedPlan, 100) || undefined
        };

        const required: [string, string][] = [
            ['organizationName', 'organization name'], ['city', 'city'], ['area', 'area'], ['address', 'address'],
            ['contactPersonName', 'contact person'], ['designation', 'designation'], ['phoneNumber', 'phone number'], ['email', 'email']
        ];
        const missing = required.filter(([k]) => !data[k]).map(([, label]) => label);
        if (missing.length) {
            return res.status(400).json({ success: false, message: `Please fill in: ${missing.join(', ')}.` });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
        }

        const partnerRequest = new PartnerRequest(data);
        await partnerRequest.save();

        // Log Platform Activity
        const io = req.app.get('io');
        logActivity(io, {
            title: 'New Partnership Inquiry',
            description: `${data.contactPersonName} from ${data.organizationName} wants to partner with us.`,
            type: 'partner'
        });

        // Telegram alert (user text HTML-escaped; awaited so serverless does not cut it off)
        const e = escapeTelegramHtml;
        const timestamp = new Date((partnerRequest as any).createdAt || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const lines = type === 'hospital'
            ? [
                '👨‍⚕️ <b>New Doctor Partner Request</b>',
                `👤 ${e(data.contactPersonName)} (${e(data.designation)})`,
                `🏥 ${e(data.organizationName)}`,
                `📍 ${e(data.area)}, ${e(data.city)}`,
                `📞 ${e(data.phoneNumber)}`,
                `📧 ${e(data.email)}`,
                ...(data.message ? [`💬 ${e(data.message)}`] : []),
                `🕐 ${timestamp}`
            ]
            : [
                '🏢 <b>New NGO Partner Request</b>',
                `🏢 ${e(data.organizationName)}`,
                `👤 ${e(data.contactPersonName)}`,
                `📍 ${e(data.city)}`,
                `📞 ${e(data.phoneNumber)}`,
                `📧 ${e(data.email)}`,
                `🕐 ${timestamp}`
            ];
        const msg = lines.join('\n');
        await sendTelegramMessage(msg);

        res.status(201).json({ success: true, message: 'Partner request submitted successfully' });
    } catch (error: any) {
        console.error('Error submitting partner request:', error);
        res.status(500).json({ success: false, message: 'Could not submit your request. Please try again.' });
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
        
        const request = await PartnerRequest.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }
        
        res.status(200).json({ success: true, data: request });
    } catch (error: any) {
        console.error('Error updating partner request status:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
};
