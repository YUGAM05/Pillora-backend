import express, { Request, Response } from 'express';
import { SarvamAIClient } from 'sarvamai';

const router = express.Router();

const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY || '',
});

router.post('/api/voice/tts-gujarati', async (req: Request, res: Response): Promise<any> => {
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
    const sarvamResponse = await sarvam.textToSpeech.convertStream({
      text,
      target_language_code: 'gu-IN',
      speaker: 'shubh',
      model: 'bulbul:v3',
      pace: 1,
      speech_sample_rate: Number(sampleRate),
      output_audio_codec: 'linear16',
    });

    const arrayBuffer = await sarvamResponse.arrayBuffer();
    const pcmBuffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', pcmBuffer.length);
    return res.end(pcmBuffer);

  } catch (err: any) {
    console.error('tts-gujarati proxy error:', err.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'TTS synthesis failed' });
    }
  }
});

export default router;
