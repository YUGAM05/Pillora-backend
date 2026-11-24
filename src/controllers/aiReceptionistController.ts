import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import Hospital from '../models/Hospital';
import VoiceHospitalConfig from '../models/VoiceHospitalConfig';
import { readAiReceptionist, parseAiReceptionistInput, AI_INFO_MAX, AI_NAME_MAX } from '../utils/aiReceptionist';

/**
 * AI phone receptionist settings: the hospital name as the AI says it, the
 * greeting language and the information the AI may give callers.
 * Hospital panel: GET/PUT /api/hospital/dashboard/ai-receptionist (owner, administrator)
 * Admin panel:    GET/PUT /api/admin/hospitals/:id/ai-receptionist
 */

/** The hospital's AI numbers (linked by Pillora in the admin panel) and whether each is on. */
const numbersOf = async (hospitalId: any) =>
    (await VoiceHospitalConfig.find({ hospitalId }).select('exotelNumber isEnabled').lean()).map((v: any) => ({
        number: v.exotelNumber,
        enabled: v.isEnabled,
    }));

const view = async (hospital: any) => ({
    hospitalName: hospital.name,
    settings: readAiReceptionist(hospital),
    numbers: await numbersOf(hospital._id),
    limits: { infoMax: AI_INFO_MAX, nameMax: AI_NAME_MAX },
});

async function load(hospitalId: any, res: Response): Promise<void> {
    const hospital = await Hospital.findById(hospitalId).select('name aiReceptionist').lean();
    if (!hospital) {
        res.status(404).json({ message: 'Hospital not found' });
        return;
    }
    res.json(await view(hospital));
}

async function save(hospitalId: any, body: any, userId: any, res: Response): Promise<void> {
    const hospital = await Hospital.findById(hospitalId).select('name aiReceptionist').lean();
    if (!hospital) {
        res.status(404).json({ message: 'Hospital not found' });
        return;
    }
    const parsed = parseAiReceptionistInput(body, readAiReceptionist(hospital));
    if (!parsed.ok || !parsed.value) {
        res.status(400).json({ message: parsed.message || 'Invalid settings' });
        return;
    }
    const updated = await Hospital.findByIdAndUpdate(
        hospitalId,
        { $set: { aiReceptionist: { ...parsed.value, updatedAt: new Date(), updatedBy: userId } } },
        { new: true }
    )
        .select('name aiReceptionist')
        .lean();
    res.json({ success: true, ...(await view(updated)) });
}

// ------------------------------------------------------------- hospital panel

/** GET /api/hospital/dashboard/ai-receptionist */
export const getAiReceptionist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await load((req as any).hospital._id, res);
    } catch (error: any) {
        console.error('[AiReceptionist] get failed:', error.message);
        res.status(500).json({ message: 'Could not load the AI receptionist settings' });
    }
};

/** PUT /api/hospital/dashboard/ai-receptionist { spokenNameGu, spokenNameHi, firstLanguage, info } */
export const updateAiReceptionist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await save((req as any).hospital._id, req.body, (req as any).user?._id, res);
    } catch (error: any) {
        console.error('[AiReceptionist] update failed:', error.message);
        res.status(500).json({ message: 'Could not save the AI receptionist settings' });
    }
};

// ------------------------------------------------------------- admin panel

const validId = (id: string) => mongoose.Types.ObjectId.isValid(id);

/** GET /api/admin/hospitals/:id/ai-receptionist */
export const adminGetAiReceptionist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!validId(req.params.id)) {
            res.status(400).json({ message: 'Invalid hospital id' });
            return;
        }
        await load(req.params.id, res);
    } catch (error: any) {
        console.error('[AiReceptionist] admin get failed:', error.message);
        res.status(500).json({ message: 'Could not load the AI receptionist settings' });
    }
};

/** PUT /api/admin/hospitals/:id/ai-receptionist { spokenNameGu, spokenNameHi, firstLanguage, info } */
export const adminUpdateAiReceptionist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!validId(req.params.id)) {
            res.status(400).json({ message: 'Invalid hospital id' });
            return;
        }
        await save(req.params.id, req.body, (req as any).user?._id, res);
    } catch (error: any) {
        console.error('[AiReceptionist] admin update failed:', error.message);
        res.status(500).json({ message: 'Could not save the AI receptionist settings' });
    }
};
