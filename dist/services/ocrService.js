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
exports.cleanOcrText = exports.extractTextFromImage = void 0;
const tesseract_js_1 = __importDefault(require("tesseract.js"));
const extractTextFromImage = (imagePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield tesseract_js_1.default.recognize(imagePath, 'eng');
        return result.data.text;
    }
    catch (error) {
        throw new Error('OCR extraction failed: ' + error.message);
    }
});
exports.extractTextFromImage = extractTextFromImage;
const cleanOcrText = (raw) => {
    return raw
        .replace(/\n+/g, '\n') // Replace multiple newlines with single
        .replace(/\s+/g, ' ') // Replace multiple spaces with single
        .trim(); // Trim whitespace
};
exports.cleanOcrText = cleanOcrText;
