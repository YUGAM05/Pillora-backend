import { Request as ExpressRequest, Response, NextFunction } from 'express';
import VoiceHospitalConfig from '../models/VoiceHospitalConfig';

interface Request extends ExpressRequest {
    hospitalId?: string;
}

export const resolveVoiceHospital = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Log req.body during testing to identify fields sent by Vapi webhook
        console.log('[ResolveVoiceHospital] Request body:', JSON.stringify(req.body, null, 2));

        const exotelNumber = 
            req.body?.message?.call?.phoneNumber?.number || 
            req.body?.message?.phoneNumber?.number ||
            req.body?.call?.phoneNumber?.number ||
            req.body?.phoneNumber ||
            req.body?.message?.call?.to ||
            req.body?.to ||
            req.body?.calledNumber;

        if (!exotelNumber) {
            console.warn('[ResolveVoiceHospital] No phone number extracted from request body');
            res.status(403).json({ error: "voice_booking_not_enabled_for_this_number" });
            return;
        }

        const config = await VoiceHospitalConfig.findOne({ exotelNumber });

        if (!config || !config.isEnabled) {
            console.warn(`[ResolveVoiceHospital] Voice config not found or disabled for exotelNumber: ${exotelNumber}`);
            res.status(403).json({ error: "voice_booking_not_enabled_for_this_number" });
            return;
        }

        req.hospitalId = config.hospitalId.toString();
        next();
    } catch (error: any) {
        console.error('[ResolveVoiceHospital] Middleware error:', error.message);
        res.status(500).json({ error: "internal_server_error" });
    }
};
