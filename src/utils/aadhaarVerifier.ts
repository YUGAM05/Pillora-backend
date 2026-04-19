import Tesseract from 'tesseract.js';
import { Ollama } from '@langchain/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import fs from 'fs';
import path from 'path';

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

export const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function validateVerhoeff(array: string | number[]) {
    let c = 0;
    const invertedArray = typeof array === 'string'
        ? array.split('').map(Number).reverse()
        : [...array].reverse();

    for (let i = 0; i < invertedArray.length; i++) {
        c = d[c][p[i % 8][invertedArray[i]]];
    }

    return c === 0;
}

const ollama = new Ollama({
    baseUrl: "http://localhost:11434",
    model: "llama3.2:1b",
});

export const verifyAadhaarLocal = async (imageBuffer: Buffer | string, patientName: string) => {
    try {
        console.log(`[Agent] Start verify: ${patientName}. Image type: ${typeof imageBuffer}`);

        // Prepare image for Tesseract
        let processedImage: any = imageBuffer;
        if (typeof imageBuffer === 'string') {
            if (imageBuffer.startsWith('data:')) {
                console.log("[Agent] Detected Data URL format.");
            } else {
                console.log("[Agent] Detected raw base64 string, converting to Buffer...");
                try {
                    processedImage = Buffer.from(imageBuffer, 'base64');
                } catch (e) {
                    console.error("[Agent] Buffer conversion failed:", e);
                }
            }
        }

        console.log("[Agent] Starting OCR with Tesseract...");
        const { data: { text } } = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    console.log(`[Tesseract] ${Math.round(m.progress * 100)}%`);
                } else if (m.status === 'loading tesseract core') {
                    console.log("[Tesseract] Loading Core...");
                }
            }
        });
        console.log("[Agent] OCR Extracted Text length:", text?.length || 0);

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

        // Use LangChain/Ollama for "brain" analysis
        const prompt = PromptTemplate.fromTemplate(`
            You are an AI assistant for Apex Care. Your task is to verify an Aadhaar card.
            
            IMPORTANT: Return ONLY a valid JSON object.
            
            EXTRACTED TEXT FROM OCR:
            "{text}"
            
            PATIENT NAME TO MATCH:
            "{patientName}"
            
            AADHAAR NUMBER FOUND BY LOGIC:
            "{aadhaarNumber}"
            
            VERHOEFF CHECKSUM RESULT:
            "{verhoeffResult}"
            
            Analyze the text. Check if it looks like a genuine Aadhaar card and if the name matches.
            
            Return JSON:
            {{
                "status": "Verified" or "Rejected",
                "remarks": "reason"
            }}
        `);

        // Limit text length to avoid token limit or performance issues
        const cleanText = text.replace(/"/g, "'").replace(/[\n\r]/g, " ").slice(0, 1500);

        const formattedPrompt = await prompt.format({
            text: cleanText,
            patientName,
            aadhaarNumber: aadhaarNumber || "Errors",
            verhoeffResult: "Passed"
        });

        console.log(`[Agent] Calling Ollama (Llama3)... Text length: ${cleanText.length}`);
        
        // Use a flag to track if AI succeeded
        let aiResultAvailable = false;
        let result = {
            status: verhoeffResult ? "Verified" : "Rejected",
            remarks: verhoeffResult ? "Verified via Verhoeff checksum" : "kyc verification is inncorrect"
        };

        try {
            // Set a timeout for Ollama (8 seconds)
            const aiPromise = ollama.invoke(formattedPrompt);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('AI Request Timeout')), 8000)
            );

            const response = await Promise.race([aiPromise, timeoutPromise]) as string;
            console.log("[Agent] AI Response received.");

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                result.status = parsed.status || result.status;
                result.remarks = parsed.remarks || result.remarks;
                aiResultAvailable = true;
                console.log("[Agent] Parsed AI Result:", result);
            }
        } catch (e: any) {
            console.warn(`[Agent] AI Analysis skipped or failed: ${e.message}. Falling back to logic-only verification.`);
            // Result is already set to the regex/verhoeff result above
        }

        // Final check on status enum compatibility
        const validStatuses = ['Verified', 'Rejected', 'Error'];

        // Normalize status to match Enum ('Verified', 'Rejected', 'Error')
        if (result && typeof result.status === 'string') {
            const normalized = result.status.charAt(0).toUpperCase() + result.status.slice(1).toLowerCase();
            if (validStatuses.includes(normalized)) {
                result.status = normalized;
            }
        }

        // CRITICAL: Overwrite AI result if Verhoeff fails
        if (!verhoeffResult && aadhaarNumber) {
            console.log("[Agent] Verhoeff failed. Overriding AI result for transparency.");
            result.status = "Rejected";
            result.remarks = "kyc verification is inncorrect";
        }

        if (!result || !validStatuses.includes(result.status)) {
            console.warn(`[Agent] AI returned invalid or missing status, defaulting to logic result.`);
            const fallbackRemarks = verhoeffResult ? "Verified via Verhoeff checksum" : "kyc verification is inncorrect";
            result = {
                status: verhoeffResult ? "Verified" : "Rejected",
                remarks: (result && result.remarks) || fallbackRemarks
            };
        }

        // Ensure "kyc verification is inncorrect" is used for any rejection
        if (result.status === "Rejected") {
            result.remarks = "kyc verification is inncorrect";
        }

        console.log("[Agent] Verification Complete. Final Result:", result);
        return {
            ...result,
            aadhaarNumber: aadhaarNumber // Return the raw extracted number
        };

    } catch (error: any) {
        console.error("[Agent] Local Verification Error:", error);
        return {
            status: "Error",
            remarks: `Technical Error: ${error.message}`,
            aadhaarNumber: null
        };
    }
};
