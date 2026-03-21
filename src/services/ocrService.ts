import Tesseract from 'tesseract.js';

export const extractTextFromImage = async (imagePath: string): Promise<string> => {
    try {
        const result = await Tesseract.recognize(imagePath, 'eng');
        return result.data.text;
    } catch (error: any) {
        throw new Error('OCR extraction failed: ' + error.message);
    }
};

export const cleanOcrText = (raw: string): string => {
    return raw
        .replace(/\r/g, '')          // Remove carriage returns
        .replace(/[ \t]+/g, ' ')     // Replace multiple spaces/tabs with single space
        .replace(/\n\s*\n/g, '\n')   // Replace multiple newlines with single newline
        .trim();                     // Trim whitespace
};
