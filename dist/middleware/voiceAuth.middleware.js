"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceAuth = void 0;
const voiceAuth = (req, res, next) => {
    const voiceSecret = req.headers['x-voice-secret'];
    const expectedSecret = process.env.VOICE_API_SECRET;
    if (!expectedSecret) {
        console.error('[VoiceAuth] VOICE_API_SECRET is not set in environment variables');
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    if (!voiceSecret || voiceSecret !== expectedSecret) {
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    next();
};
exports.voiceAuth = voiceAuth;
