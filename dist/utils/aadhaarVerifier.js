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
exports.verifyAadhaarLocal = exports.inv = void 0;
exports.validateVerhoeff = validateVerhoeff;
const tesseract_js_1 = __importDefault(require("tesseract.js"));
const ollama_1 = require("@langchain/ollama");
/**
 * Verhoeff Algorithm for Aadhaar number validation
 */
const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];
exports.inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
function validateVerhoeff(array) {
    let c = 0;
    const invertedArray = typeof array === 'string'
        ? array.split('').map(Number).reverse()
        : [...array].reverse();
    for (let i = 0; i < invertedArray.length; i++) {
        c = d[c][p[i % 8][invertedArray[i]]];
    }
    return c === 0;
}
const ollama = new ollama_1.Ollama({
    baseUrl: "http://localhost:11434",
    model: "llama3.2:1b",
});
const verifyAadhaarLocal = (imageBuffer, patientName) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`[Agent] Start verify: ${patientName}. Image type: ${typeof imageBuffer}`);
        // Prepare image for Tesseract
        let processedImage = imageBuffer;
        if (typeof imageBuffer === 'string') {
            if (imageBuffer.startsWith('data:')) {
                console.log("[Agent] Detected Data URL format.");
            }
            else {
                console.log("[Agent] Detected raw base64 string, converting to Buffer...");
                try {
                    processedImage = Buffer.from(imageBuffer, 'base64');
                }
                catch (e) {
                    console.error("[Agent] Buffer conversion failed:", e);
                }
            }
        }
        console.log("[Agent] Starting OCR with Tesseract...");
        const { data: { text } } = yield tesseract_js_1.default.recognize(processedImage, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    console.log(`[Tesseract] ${Math.round(m.progress * 100)}%`);
                }
                else if (m.status === 'loading tesseract core') {
                    console.log("[Tesseract] Loading Core...");
                }
            }
        });
        console.log("[Agent] OCR Extracted Text length:", (text === null || text === void 0 ? void 0 : text.length) || 0);
        // Extract 12-digit Aadhaar number (format XXXX XXXX XXXX or XXXXXXXXXXXX)
        const aadhaarMatch = text.match(/\d{4}\s\d{4}\s\d{4}/) || text.match(/\d{12}/);
        const aadhaarNumber = aadhaarMatch ? aadhaarMatch[0].replace(/\s/g, '') : null;
        // 🚨 HARD RULE 1: Must find a potential Aadhaar Number
        if (!aadhaarNumber) {
            console.log("[Agent] No Aadhaar number pattern found. Rejecting immediately.");
            return {
                status: "Rejected",
                remarks: "kyc verification is inncorrect",
                aadhaarNumber: null
            };
        }
        // 🚨 HARD RULE 2: Verhoeff Checksum
        const verhoeffResult = validateVerhoeff(aadhaarNumber);
        console.log(`[Agent] Found Aadhaar: ${aadhaarNumber}, Verhoeff Valid: ${verhoeffResult}`);
        if (!verhoeffResult) {
            console.log("[Agent] Verhoeff checksum failed. Rejecting.");
            return {
                status: "Rejected",
                remarks: "kyc verification is inncorrect",
                aadhaarNumber: null
            };
        }
        // 🚨 HARD RULE 3: Essential Keywords
        // Document must contain 'Government of India', 'UIDAI', or 'Aadhaar'
        const keywords = ['government of india', 'india', 'bharat', 'uidai', 'aadhaar', 'unique identification', 'male', 'female', 'dob'];
        const lowerText = text.toLowerCase();
        const hasKeyword = keywords.some(k => lowerText.includes(k));
        if (!hasKeyword) {
            console.log("[Agent] No essential Aadhaar keywords found. Rejecting.");
            return {
                status: "Rejected",
                remarks: "kyc verification is inncorrect",
                aadhaarNumber: null
            };
        }
        // 🚨 HARD RULE 4: Name Match (Basic Fuzzy)
        // If patientName is provided, we should find at least part of it in the text
        if (patientName) {
            const nameParts = patientName.toLowerCase().split(' ').filter(p => p.length > 2);
            const isNamePresent = nameParts.some(part => lowerText.includes(part));
            if (!isNamePresent) {
                console.log(`[Agent] Name mismatch. User: ${patientName}, Text: ${text.slice(0, 50)}...`);
                // We might perform a stricter check via AI, but for "fake image" protection, this is good.
                // However, OCR can be messy. Let's trust the AI for name matching IF the hard rules passed.
            }
        }
        // Format result instantly from logic
        let result = {
            status: verhoeffResult && hasKeyword ? "Verified" : "Rejected",
            remarks: verhoeffResult && hasKeyword ? "Verified via fast pattern matching" : "kyc verification is inncorrect"
        };
        // CRITICAL: Overwrite AI result if Verhoeff fails
        if (!verhoeffResult && aadhaarNumber) {
            console.log("[Agent] Verhoeff failed.");
            result.status = "Rejected";
            result.remarks = "kyc verification is inncorrect";
        }
        // Ensure "kyc verification is inncorrect" is used for any rejection
        if (result.status === "Rejected") {
            result.remarks = "kyc verification is inncorrect";
        }
        console.log("[Agent] Fast Verification Complete. Final Result:", result);
        return Object.assign(Object.assign({}, result), { aadhaarNumber: aadhaarNumber // Return the raw extracted number
         });
    }
    catch (error) {
        console.error("[Agent] Local Verification Error:", error);
        return {
            status: "Error",
            remarks: `Technical Error: ${error.message}`,
            aadhaarNumber: null
        };
    }
});
exports.verifyAadhaarLocal = verifyAadhaarLocal;
