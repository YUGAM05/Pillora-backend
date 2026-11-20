import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import Hospital from '../models/Hospital';
import VoiceCall from '../models/VoiceCall';
import VoiceHospitalConfig from '../models/VoiceHospitalConfig';
import { usageSummary, createPackOrder, verifyPackPayment, reconcilePendingPacks, grantPack } from '../services/usageService';
import { packFor } from '../config/plans';

const hospitalOf = (req: AuthRequest) => (req as any).hospital;

// ------------------------------------------------------------- hospital panel

/** GET /api/hospital/dashboard/usage : plan, this month's usage, packs, pack catalogue. */
export const getUsage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = hospitalOf(req);
        await reconcilePendingPacks(hospital._id).catch(() => {});
        res.json(await usageSummary(hospital._id));
    } catch (error: any) {
        console.error('[Usage] getUsage failed:', error.message);
        res.status(500).json({ message: 'Could not load usage' });
    }
};

/** POST /api/hospital/dashboard/packs/order { packCode } : start a Razorpay payment for a pack. */
export const orderPack = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { packCode } = req.body || {};
        if (!packFor(packCode)) {
            res.status(400).json({ message: 'Unknown pack' });
            return;
        }
        const hospital = hospitalOf(req);
        const order = await createPackOrder(hospital._id, packCode);
        res.json({ ...order, hospitalName: hospital.name, email: hospital.email, phone: hospital.phone });
    } catch (error: any) {
        console.error('[Usage] orderPack failed:', error.message);
        res.status(500).json({ message: error.message === 'Online payments are not configured' ? error.message : 'Could not start the payment' });
    }
};

/** POST /api/hospital/dashboard/packs/verify { razorpay_order_id, razorpay_payment_id, razorpay_signature } */
export const verifyPack = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            res.status(400).json({ message: 'Missing payment details' });
            return;
        }
        const pack = await verifyPackPayment(hospitalOf(req)._id, razorpay_order_id, razorpay_payment_id, razorpay_signature);
        res.json({ success: true, pack: { id: pack._id, kind: pack.kind, quantity: pack.quantity, status: pack.status, expiresAt: pack.expiresAt } });
    } catch (error: any) {
        console.error('[Usage] verifyPack failed:', error.message);
        res.status(400).json({ success: false, message: 'Payment could not be verified. If money was deducted, the pack will appear within a few minutes, or contact support.' });
    }
};

/** GET /api/hospital/dashboard/voice-calls : last 50 AI receptionist calls. */
export const getVoiceCalls = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const calls = await VoiceCall.find({ hospital: hospitalOf(req)._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('appointment', 'patientName appointmentDate appointmentTime doctorName status')
            .lean();
        res.json(calls);
    } catch (error: any) {
        res.status(500).json({ message: 'Could not load calls' });
    }
};

// ------------------------------------------------------------- admin panel

const validId = (id: string) => mongoose.Types.ObjectId.isValid(id);

/** GET /api/admin/hospitals/:id/usage */
export const adminGetUsage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!validId(req.params.id)) {
            res.status(400).json({ message: 'Invalid hospital id' });
            return;
        }
        const [summary, voice] = await Promise.all([
            usageSummary(req.params.id),
            VoiceHospitalConfig.find({ hospitalId: req.params.id }).select('exotelNumber isEnabled').lean(),
        ]);
        res.json({ ...summary, voiceNumbers: voice.map((v: any) => ({ number: v.exotelNumber, enabled: v.isEnabled })) });
    } catch (error: any) {
        res.status(500).json({ message: 'Could not load usage' });
    }
};

/** POST /api/admin/hospitals/:id/packs { packCode } or { kind, quantity }, optional { price, note } */
export const adminGrantPack = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!validId(req.params.id) || !(await Hospital.exists({ _id: req.params.id }))) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        const { packCode, kind, quantity, price, note } = req.body || {};
        const pack = await grantPack(req.params.id, {
            packCode,
            kind,
            quantity: quantity !== undefined ? Number(quantity) : undefined,
            price: price !== undefined ? Number(price) : undefined,
            note,
            grantedBy: (req as any).user?._id,
        });
        res.status(201).json({ success: true, pack });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message || 'Could not add the pack' });
    }
};

/**
 * PUT /api/admin/hospitals/:id/voice-number { number, enabled }
 * Link (or pause/unlink) an AI receptionist phone number for a hospital.
 * number: any format; stored digits-only with country code, e.g. 912269857389.
 */
export const adminSetVoiceNumber = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!validId(req.params.id) || !(await Hospital.exists({ _id: req.params.id }))) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        let digits = String(req.body?.number || '').replace(/\D/g, '');
        if (digits.length === 10) digits = `91${digits}`;
        if (digits.length < 11 || digits.length > 13) {
            res.status(400).json({ message: 'Enter the phone number with country code, e.g. +91 22 6985 7389' });
            return;
        }
        if (req.body?.unlink === true) {
            await VoiceHospitalConfig.deleteOne({ exotelNumber: digits, hospitalId: req.params.id });
            res.json({ success: true, unlinked: digits });
            return;
        }
        const other = await VoiceHospitalConfig.findOne({ exotelNumber: digits, hospitalId: { $ne: req.params.id } }).lean();
        if (other) {
            res.status(409).json({ message: 'This number is already linked to another hospital' });
            return;
        }
        const config = await VoiceHospitalConfig.findOneAndUpdate(
            { exotelNumber: digits },
            { $set: { hospitalId: req.params.id, exotelNumber: digits, isEnabled: req.body?.enabled !== false } },
            { upsert: true, new: true }
        );
        res.json({ success: true, number: config.exotelNumber, enabled: config.isEnabled });
    } catch (error: any) {
        res.status(500).json({ message: 'Could not save the number' });
    }
};
