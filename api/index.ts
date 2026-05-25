import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let app: any;
try {
    app = require('../src/app').default;
} catch (error: any) {
    console.error('CRITICAL BOOT ERROR:', error);
    const express = require('express');
    app = express();

    // Always set CORS headers — even on a critical boot failure.
    // Without this, OPTIONS preflight returns 500 with no CORS headers and
    // the browser reports a misleading "CORS error" instead of the real problem.
    app.use((req: any, res: any, next: any) => {
        const origin = req.headers.origin;
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        next();
    });

    app.use((req: any, res: any) => {
        res.status(500).json({
            message: 'CRITICAL BOOT ERROR',
            error: error.message || error,
            stack: error.stack || 'No stack trace available'
        });
    });
}

export default app;
