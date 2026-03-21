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
const ocrService_1 = require("../services/ocrService");
const aiService_1 = require("../services/aiService");
const fs_1 = __importDefault(require("fs"));
const uploadPrescription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const userId = req.user._id;
        const filePath = req.file.path;
        // 1. Extract Text
        const rawText = yield (0, ocrService_1.extractTextFromImage)(filePath);
        const cleanedText = (0, ocrService_1.cleanOcrText)(rawText);
        // 2. Verify with AI
        const aiResult = yield (0, aiService_1.verifyPrescription)(cleanedText);
        // 3. Create Prescription Record
        const prescription = yield Prescription_1.default.create({
            user_id: userId,
            image_url: filePath, // In real app, upload to S3 first
            ocr_text: cleanedText,
            ai_result: aiResult,
            medicines_extracted: aiResult.medicines || [],
            admin_status: 'pending'
        });
        // 4. Delete local file (if it was just a temp upload)
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
        res.status(201).json(prescription);
    }
    catch (error) {
        console.error(error);
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
