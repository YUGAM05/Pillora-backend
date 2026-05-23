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
exports.adminVerifyPrescription = exports.adminGetAllPrescriptions = exports.getPrescriptionById = exports.getUserPrescriptions = exports.uploadPrescription = void 0;
const Prescription_1 = __importDefault(require("../models/Prescription"));
const aiService_1 = require("../services/aiService");
const generative_ai_1 = require("@google/generative-ai");
let genAI = null;
const getGenAI = () => {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured in the backend environment variables.');
        }
        genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    return genAI;
};
// ✅ Replaces Tesseract OCR - uses Gemini Vision directly
const extractTextWithGemini = (buffer, mimeType) => __awaiter(void 0, void 0, void 0, function* () {
    const client = getGenAI();
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const base64Image = buffer.toString('base64');
    const result = yield model.generateContent([
        {
            inlineData: {
                mimeType: mimeType,
                data: base64Image
            }
        },
        'Extract all text from this prescription image including medicine names, dosages, and instructions. Return only the extracted text.'
    ]);
    return result.response.text();
});
const uploadPrescription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const extractedText = yield extractTextWithGemini(fileBuffer, mimeType);
        console.log(`[Upload] OCR complete. Text length: ${extractedText.length}`);
        // 2. Verify with AI
        console.log(`[Upload] Starting AI Verification...`);
        const aiResult = yield (0, aiService_1.verifyPrescription)(extractedText);
        console.log(`[Upload] AI Result: ${aiResult.is_valid ? 'Valid' : 'Invalid'}`);
        // 3. Convert image to base64 for storage in DB
        const base64Image = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
        // 4. Create Prescription Record
        console.log(`[Upload] Saving to DB...`);
        const prescription = yield Prescription_1.default.create({
            user_id: userId,
            image_url: base64Image, // ✅ Store as base64 instead of file path
            ocr_text: extractedText,
            ai_result: aiResult,
            medicines_extracted: aiResult.medicines || [],
            admin_status: 'pending'
        });
        console.log(`[Upload] DB Record created: ${prescription._id}`);
        console.log(`[Upload] Success! Returning 201.`);
        res.status(201).json(prescription);
    }
    catch (error) {
        console.error('[Upload Error]', error);
        res.status(500).json({ message: error.message });
    }
});
exports.uploadPrescription = uploadPrescription;
const getUserPrescriptions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const prescriptions = yield Prescription_1.default.find({ user_id: req.user._id })
            .sort({ createdAt: -1 });
        res.status(200).json(prescriptions);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getUserPrescriptions = getUserPrescriptions;
const getPrescriptionById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const prescription = yield Prescription_1.default.findById(req.params.id);
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }
        res.status(200).json(prescription);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getPrescriptionById = getPrescriptionById;
const adminGetAllPrescriptions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const prescriptions = yield Prescription_1.default.find()
            .populate('user_id', 'name email')
            .sort({ createdAt: -1 });
        res.status(200).json(prescriptions);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.adminGetAllPrescriptions = adminGetAllPrescriptions;
const adminVerifyPrescription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { admin_status, admin_notes } = req.body;
        const updateData = {
            admin_status,
            admin_notes,
            admin_id: req.user._id
        };
        if (admin_status === 'approved') {
            const validUntil = new Date();
            validUntil.setMonth(validUntil.getMonth() + 6);
            updateData.valid_until = validUntil;
        }
        const prescription = yield Prescription_1.default.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }
        res.status(200).json(prescription);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.adminVerifyPrescription = adminVerifyPrescription;
