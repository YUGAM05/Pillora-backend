import { Request, Response } from 'express';
import Prescription from '../models/Prescription';
import { extractTextFromImage, cleanOcrText } from '../services/ocrService';
import { verifyPrescription } from '../services/aiService';
import fs from 'fs';
import { AuthRequest } from '../middleware/authMiddleware';

export const uploadPrescription = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const userId = req.user._id;
        console.log(`[Upload] Starting process for user: ${userId}`);
        const filePath = req.file.path;
        console.log(`[Upload] File saved at: ${filePath}`);

        // 1. Extract Text
        console.log(`[Upload] Starting OCR...`);
        const rawText = await extractTextFromImage(filePath);
        const cleanedText = cleanOcrText(rawText);
        console.log(`[Upload] OCR complete. Text length: ${cleanedText.length}`);

        // 2. Verify with AI
        console.log(`[Upload] Starting AI Verification...`);
        const aiResult = await verifyPrescription(cleanedText);
        console.log(`[Upload] AI Result: ${aiResult.is_valid ? 'Valid' : 'Invalid'}`);

        // 3. Create Prescription Record
        console.log(`[Upload] Saving to DB...`);
        const prescription = await Prescription.create({
            user_id: userId,
            image_url: filePath,
            ocr_text: cleanedText,
            ai_result: aiResult,
            medicines_extracted: aiResult.medicines || [],
            admin_status: 'pending'
        });
        console.log(`[Upload] DB Record created: ${prescription._id}`);

        // 4. Do NOT delete the local file so that the Admin and User can view it later.
        console.log(`[Upload] Keeping image file at ${filePath} for future rendering.`);

        console.log(`[Upload] Success! Returning 201.`);
        res.status(201).json(prescription);
    } catch (error: any) {
        console.error('[Upload Error]', error);
        res.status(500).json({ message: error.message });
    }
};

export const getUserPrescriptions = async (req: AuthRequest, res: Response) => {
    try {
        const prescriptions = await Prescription.find({ user_id: req.user._id })
            .sort({ createdAt: -1 });
        res.status(200).json(prescriptions);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getPrescriptionById = async (req: Request, res: Response) => {
    try {
        const prescription = await Prescription.findById(req.params.id);
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }
        res.status(200).json(prescription);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const adminGetAllPrescriptions = async (req: Request, res: Response) => {
    try {
        const prescriptions = await Prescription.find()
            .populate('user_id', 'name email')
            .sort({ createdAt: -1 });
        res.status(200).json(prescriptions);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const adminVerifyPrescription = async (req: AuthRequest, res: Response) => {
    try {
        const { admin_status, admin_notes } = req.body;
        const updateData: any = {
            admin_status,
            admin_notes,
            admin_id: req.user._id
        };

        if (admin_status === 'approved') {
            const validUntil = new Date();
            validUntil.setMonth(validUntil.getMonth() + 6);
            updateData.valid_until = validUntil;
        }

        const prescription = await Prescription.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        res.status(200).json(prescription);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
