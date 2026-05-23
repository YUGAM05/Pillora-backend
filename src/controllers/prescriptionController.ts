import { Request, Response } from 'express';
import Prescription from '../models/Prescription';
import { verifyPrescription } from '../services/aiService';
import { AuthRequest } from '../middleware/authMiddleware';
import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

const getGenAI = (): GoogleGenerativeAI => {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured in the backend environment variables.');
        }
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
};

// ✅ Replaces Tesseract OCR - uses Gemini Vision directly
const extractTextWithGemini = async (buffer: Buffer, mimeType: string): Promise<string> => {
    const client = getGenAI();
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const base64Image = buffer.toString('base64');

    const result = await model.generateContent([
        {
            inlineData: {
                mimeType: mimeType,
                data: base64Image
            }
        },
        'Extract all text from this prescription image including medicine names, dosages, and instructions. Return only the extracted text.'
    ]);

    return result.response.text();
};

export const uploadPrescription = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const userId = req.user._id;
        console.log(`[Upload] Starting process for user: ${userId}`);

        // ✅ Use buffer instead of file path
        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        console.log(`[Upload] File received in memory. Size: ${fileBuffer.length} bytes`);

        // 1. Extract Text using Gemini Vision (replaces Tesseract)
        console.log(`[Upload] Starting Gemini OCR...`);
        const extractedText = await extractTextWithGemini(fileBuffer, mimeType);
        console.log(`[Upload] OCR complete. Text length: ${extractedText.length}`);

        // 2. Verify with AI
        console.log(`[Upload] Starting AI Verification...`);
        const aiResult = await verifyPrescription(extractedText);
        console.log(`[Upload] AI Result: ${aiResult.is_valid ? 'Valid' : 'Invalid'}`);

        // 3. Convert image to base64 for storage in DB
        const base64Image = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

        // 4. Create Prescription Record
        console.log(`[Upload] Saving to DB...`);
        const prescription = await Prescription.create({
            user_id: userId,
            image_url: base64Image,  // ✅ Store as base64 instead of file path
            ocr_text: extractedText,
            ai_result: aiResult,
            medicines_extracted: aiResult.medicines || [],
            admin_status: 'pending'
        });
        console.log(`[Upload] DB Record created: ${prescription._id}`);

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