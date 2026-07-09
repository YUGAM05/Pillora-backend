"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-cbc';
// Fallback key must be exactly 32 bytes (256 bits)
const FALLBACK_KEY = 'd6f3e0a0344d5d36e87a918a2d1f67f2';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || FALLBACK_KEY;
const IV_LENGTH = 16; // For AES, this is always 16 bytes
function encrypt(text) {
    if (!text)
        return '';
    try {
        const iv = crypto_1.default.randomBytes(IV_LENGTH);
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }
    catch (error) {
        console.error('Encryption failed:', error);
        return text; // Return unencrypted as emergency fallback
    }
}
function decrypt(text) {
    if (!text)
        return '';
    try {
        const textParts = text.split(':');
        if (textParts.length < 2) {
            // Not encrypted or formatted wrong, return as-is
            return text;
        }
        const iv = Buffer.from(textParts.shift() || '', 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
    catch (error) {
        console.error('Decryption failed:', error);
        return text;
    }
}
