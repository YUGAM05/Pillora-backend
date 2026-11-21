import express from 'express';
import rateLimit from 'express-rate-limit';
import { applyCorsHeaders } from '../config/security';

/**
 * Per-IP limit for public lead/contact forms (partner requests, demo/contact tickets).
 * Same express-rate-limit setup as the auth limiters (app has trust proxy = 1 for Vercel).
 * In-memory per instance on serverless, so it is a basic spam brake, not a hard guarantee.
 */
export const publicFormLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: express.Request, res: express.Response) => {
        applyCorsHeaders(req.headers.origin, res);
        res.status(429).json({ success: false, message: 'Too many submissions from your network. Please try again in an hour.' });
    },
});
