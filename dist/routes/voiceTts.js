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
const express_1 = __importDefault(require("express"));
const sarvamai_1 = require("sarvamai");
const router = express_1.default.Router();
const sarvam = new sarvamai_1.SarvamAIClient({
    apiSubscriptionKey: process.env.SARVAM_API_KEY || '',
});
router.post('/api/voice/tts-gujarati', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const incomingSecret = req.headers['x-vapi-secret'];
        if (!incomingSecret || incomingSecret !== process.env.VAPI_TTS_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { message } = req.body;
        if (!message || message.type !== 'voice-request') {
            return res.status(400).json({ error: 'Invalid message type' });
        }
        const { text, sampleRate } = message;
        const validSampleRates = [8000, 16000, 22050, 24000];
        if (!text || !validSampleRates.includes(Number(sampleRate))) {
            return res.status(400).json({ error: 'Invalid text or sampleRate' });
        }
        // output_audio_codec must be 'linear16' for raw PCM, as 'pcm' is not valid for Sarvam.
        const sarvamResponse = yield sarvam.textToSpeech.convertStream({
            text,
            target_language_code: 'gu-IN',
            speaker: 'shubh',
            model: 'bulbul:v3',
            pace: 1,
            speech_sample_rate: Number(sampleRate),
            output_audio_codec: 'linear16',
        });
        const arrayBuffer = yield sarvamResponse.arrayBuffer();
        const pcmBuffer = Buffer.from(arrayBuffer);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', pcmBuffer.length);
        return res.end(pcmBuffer);
    }
    catch (err) {
        console.error('tts-gujarati proxy error:', err.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'TTS synthesis failed' });
        }
    }
}));
exports.default = router;
