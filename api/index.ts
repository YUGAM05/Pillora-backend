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
    app.use((req: any, res: any) => {
        res.status(500).json({
            message: 'CRITICAL BOOT ERROR',
            error: error.message || error,
            stack: error.stack || 'No stack trace available'
        });
    });
}

export default app;
