// Deployment Trigger: 2026-05-15 13:50
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';
// Disable command buffering globally so queries fail immediately in case of database disconnection
mongoose.set('bufferCommands', false);
import passport from './config/passport';
import { initDailyStatsCron } from './cron/dailyStats';
import { initAppointmentRemindersCron } from './cron/appointmentReminders';
import { initFollowUpRemindersCron } from './cron/followUpRemindersCron';
import { initSubscriptionExpiryCron } from './cron/subscriptionExpiryCron';
import { createServer } from 'http';
import { Server } from 'socket.io';
import User from './models/User';
import crypto from 'crypto';
import { getMongoUri, getJwtSecret, applyCorsHeaders, isAllowedOrigin } from './config/security';

const app = express();
// Vercel sits in front of the app: trust its X-Forwarded-For so req.ip (used by
// the rate limiters) is the real client IP, not one shared proxy address.
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // Browsers: only our own frontends. No Origin = server-to-server client.
            callback(null, !origin || isAllowedOrigin(origin));
        },
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Make io accessible in controllers
app.set('io', io);

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;

// ─── CORS — registered FIRST, before DB middleware and all routes ─────────────
// Only the real frontends (config/security.ts ALLOWED_ORIGINS) and localhost get
// CORS headers. Reflecting any origin together with Allow-Credentials let any
// website make authenticated calls on a visitor's behalf.
// OPTIONS preflight is short-circuited here so the DB middleware never runs on it.
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    applyCorsHeaders(req.headers.origin, res);
    if (isAllowedOrigin(req.headers.origin)) {
        res.setHeader('Access-Control-Max-Age', '86400'); // cache preflight 24 h
    }
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});


// ─── DB middleware — only reached by non-OPTIONS requests ────────────────────
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err: any) {
        console.error('[DBMiddleware] Database connection failed:', err.message);
        res.status(500).json({
            message: 'Database connection failed',
            error: process.env.NODE_ENV === 'production' ? undefined : err.message,
        });
    }
});

app.use(express.json({
    limit: '100mb',
    // Keep the exact bytes of webhook calls whose signature is computed over the raw body:
    // WhatsApp (X-Hub-Signature-256) and Razorpay (X-Razorpay-Signature on /api/payments/verify).
    verify: (req: any, _res, buf) => {
        const url: string = req.originalUrl || '';
        if (url.startsWith('/api/webhook/whatsapp') || url.startsWith('/api/payments/verify')) req.rawBody = buf;
    },
}));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(morgan('dev'));

app.use(session({
    // No hard-coded fallback: derive one from JWT_SECRET when SESSION_SECRET is unset.
    secret: process.env.SESSION_SECRET || crypto.createHmac('sha256', getJwtSecret()).update('express-session').digest('hex'),
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: getMongoUri(),
        collectionName: 'sessions',
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

app.use(passport.initialize());
app.use(passport.session());

// ─── Route Imports & Bindings with Verbose Boot Sequence Logging ───
console.log('=== AUTH ROUTES LOADING ===');
const authRoutes = require('./routes/authRoutes').default || require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
console.log('=== AUTH ROUTES LOADED ===');

console.log('=== BLOOD BANK ROUTES LOADING ===');
const bloodBankRoutes = require('./routes/bloodBankRoutes').default || require('./routes/bloodBankRoutes');
app.use('/api/blood-bank', bloodBankRoutes);
console.log('=== BLOOD BANK ROUTES LOADED ===');

console.log('=== SAFETY ROUTES LOADING ===');
const safetyRoutes = require('./routes/safetyRoutes').default || require('./routes/safetyRoutes');
app.use('/api/safety', safetyRoutes);
console.log('=== SAFETY ROUTES LOADED ===');

console.log('=== ADMIN ROUTES LOADING ===');
const adminRoutes = require('./routes/adminRoutes').default || require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);
console.log('=== ADMIN ROUTES LOADED ===');

console.log('=== SELLER ROUTES LOADING ===');
const sellerRoutes = require('./routes/sellerRoutes').default || require('./routes/sellerRoutes');
app.use('/api/seller', sellerRoutes);
console.log('=== SELLER ROUTES LOADED ===');

console.log('=== DELIVERY ROUTES LOADING ===');
const deliveryRoutes = require('./routes/deliveryRoutes').default || require('./routes/deliveryRoutes');
app.use('/api/delivery', deliveryRoutes);
console.log('=== DELIVERY ROUTES LOADED ===');

console.log('=== PRODUCT ROUTES LOADING ===');
const productRoutes = require('./routes/productRoutes').default || require('./routes/productRoutes');
app.use('/api/products', productRoutes);
console.log('=== PRODUCT ROUTES LOADED ===');

console.log('=== NOTIFICATION ROUTES LOADING ===');
const notificationRoutes = require('./routes/notificationRoutes').default || require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);
console.log('=== NOTIFICATION ROUTES LOADED ===');

console.log('=== PRESCRIPTION ROUTES LOADING ===');
const prescriptionRoutes = require('./routes/prescriptionRoutes').default || require('./routes/prescriptionRoutes');
app.use('/api/prescriptions', prescriptionRoutes);
console.log('=== PRESCRIPTION ROUTES LOADED ===');

console.log('=== HOSPITAL ROUTES LOADING ===');
const hospitalRoutes = require('./routes/hospitalRoutes').default || require('./routes/hospitalRoutes');
app.use('/api/hospitals', hospitalRoutes);
console.log('=== HOSPITAL ROUTES LOADED ===');

console.log('=== ORDER ROUTES LOADING ===');
const orderRoutes = require('./routes/orderRoutes').default || require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);
console.log('=== ORDER ROUTES LOADED ===');

console.log('=== HEALTH HUB ROUTES LOADING ===');
const healthHubRoutes = require('./routes/healthHubRoutes').default || require('./routes/healthHubRoutes');
app.use('/api/health-hub', healthHubRoutes);
console.log('=== HEALTH HUB ROUTES LOADED ===');

console.log('=== SUPPORT ROUTES LOADING ===');
const supportRoutes = require('./routes/supportRoutes').default || require('./routes/supportRoutes');
app.use('/api/support', supportRoutes);
console.log('=== SUPPORT ROUTES LOADED ===');

console.log('=== BLOG ROUTES LOADING ===');
const blogRoutes = require('./routes/blogRoutes').default || require('./routes/blogRoutes');
app.use('/api/blogs', blogRoutes);
console.log('=== BLOG ROUTES LOADED ===');

console.log('=== AI ROUTES LOADING ===');
const aiRoutes = require('./routes/aiRoutes').default || require('./routes/aiRoutes');
app.use('/api/ai', aiRoutes);
console.log('=== AI ROUTES LOADED ===');

console.log('=== COUPON ROUTES LOADING ===');
const couponRoutes = require('./routes/couponRoutes').default || require('./routes/couponRoutes');
app.use('/api/coupons', couponRoutes);
console.log('=== COUPON ROUTES LOADED ===');

console.log('=== WEBHOOK ROUTES LOADING ===');
const webhookRoutes = require('./routes/webhookRoutes').default || require('./routes/webhookRoutes');
app.use('/api/webhook', webhookRoutes);
console.log('=== WEBHOOK ROUTES LOADED ===');

// Scheduled jobs, triggered by the always-on voice server (see routes/cronRoutes.ts)
const cronRoutes = require('./routes/cronRoutes').default || require('./routes/cronRoutes');
app.use('/api/cron', cronRoutes);

console.log('=== MEDICINE ROUTES LOADING ===');
const medicineRoutes = require('./routes/medicineRoutes').default || require('./routes/medicineRoutes');
app.use('/api/medicines', medicineRoutes);
console.log('=== MEDICINE ROUTES LOADED ===');

console.log('=== UPLOAD ROUTES LOADING ===');
const uploadRoutes = require('./routes/uploadRoutes').default || require('./routes/uploadRoutes');
app.use('/api/upload', uploadRoutes);
console.log('=== UPLOAD ROUTES LOADED ===');

console.log('=== PARTNER ROUTES LOADING ===');
const partnerRoutes = require('./routes/partnerRoutes').default || require('./routes/partnerRoutes');
app.use('/api/partners', partnerRoutes);
console.log('=== PARTNER ROUTES LOADED ===');

console.log('=== HOSPITAL DASHBOARD ROUTES LOADING ===');
const hospitalDashboardRoutes = require('./routes/hospitalDashboardRoutes').default || require('./routes/hospitalDashboardRoutes');
app.use('/api/hospital/dashboard', hospitalDashboardRoutes);
console.log('=== HOSPITAL DASHBOARD ROUTES LOADED ===');

console.log('=== HOSPITAL SETTINGS ROUTES LOADING ===');
const hospitalSettingsRoutes = require('./routes/hospitalSettingsRoutes').default || require('./routes/hospitalSettingsRoutes');
app.use('/api/hospital/settings', hospitalSettingsRoutes);
console.log('=== HOSPITAL SETTINGS ROUTES LOADED ===');

console.log('=== PAYMENT ROUTES LOADING ===');
const paymentRoutes = require('./routes/paymentRoutes').default || require('./routes/paymentRoutes');
app.use('/api/payments', paymentRoutes);
console.log('=== PAYMENT ROUTES LOADED ===');

console.log('=== SETTLEMENT ROUTES LOADING ===');
const settlementRoutes = require('./routes/settlementRoutes').default || require('./routes/settlementRoutes');
app.use('/api/settlements', settlementRoutes);
console.log('=== SETTLEMENT ROUTES LOADED ===');

console.log('=== APPOINTMENT ROUTES LOADING ===');
const appointmentRoutes = require('./routes/appointmentRoutes').default || require('./routes/appointmentRoutes');
app.use('/api/appointments', appointmentRoutes);
console.log('=== APPOINTMENT ROUTES LOADED ===');

console.log('=== ANALYTICS ROUTES LOADING ===');
const analyticsRoutes = require('./routes/analyticsRoutes').default || require('./routes/analyticsRoutes');
app.use('/api/metrics', analyticsRoutes);
console.log('=== ANALYTICS ROUTES LOADED ===');

console.log('=== VOICE ROUTES LOADING ===');
const voiceRoutes = require('./routes/voice.routes').default || require('./routes/voice.routes');
app.use('/api/voice', voiceRoutes);
console.log('=== VOICE ROUTES LOADED ===');

console.log('=== VOICE TTS ROUTES LOADING ===');
const voiceTtsRoutes = require('./routes/voiceTts').default || require('./routes/voiceTts');
app.use(voiceTtsRoutes);
console.log('=== VOICE TTS ROUTES LOADED ===');

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Pillora API is running with Sockets',
        timestamp: new Date().toISOString(),
        dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    });
});

export const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    
    // If connection is already in progress, wait for the open event to complete
    if (mongoose.connection.readyState === 2) {
        console.log('[DB] Connection in progress, waiting for open event...');
        await new Promise((resolve, reject) => {
            const onOpen = () => {
                cleanup();
                resolve(true);
            };
            const onError = (err: any) => {
                cleanup();
                reject(err);
            };
            const cleanup = () => {
                mongoose.connection.removeListener('open', onOpen);
                mongoose.connection.removeListener('error', onError);
            };
            mongoose.connection.once('open', onOpen);
            mongoose.connection.once('error', onError);
        });
        return;
    }
    
    try {
        const uri = getMongoUri();
        await mongoose.connect(uri, {
            dbName: 'e-pharmacy',
            serverSelectionTimeoutMS: 4000,
            connectTimeoutMS: 4000,
        });
        console.log('[DB] Connected to MongoDB:', mongoose.connection.name);

        // Fix MongoDB index issues (e.g. non-sparse email_1 index causing E11000 on null emails)
        try {
            const usersColl = mongoose.connection.db?.collection('users');
            if (usersColl) {
                const indexes = await usersColl.indexes();
                const emailIdx = indexes.find((i: any) => i.name === 'email_1');
                if (emailIdx && !emailIdx.sparse) {
                    console.log('[DB] Dropping non-sparse email_1 index on users collection...');
                    await usersColl.dropIndex('email_1');
                    console.log('[DB] Dropped legacy email_1 index successfully.');
                }
            }
            await User.syncIndexes();
        } catch (idxErr: any) {
            console.warn('[DB] Index sync notice:', idxErr.message);
        }
    } catch (error: any) {
        console.error('[DB] Connection Error:', error.message);
        throw error;
    }
};

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[GlobalError]', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

import { runHoldCleanup } from './utils/holdManager';

const isServerless = process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME;

if (process.env.NODE_ENV !== 'production' && !isServerless) {
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server (HTTP + WS) ready on port ${PORT}`);
        // Connect to DB in background so server stays alive even if DB is slow
        connectDB().then(() => {
            console.log('✅ Background DB connection established');
            // Start the 60 seconds cron fallback job for expired holds
            setInterval(() => {
                runHoldCleanup(io);
            }, 60000);
        }).catch(err => {
            console.error('❌ Background DB connection failed:', err);
        });
    });
} else {
    // Only run persistent intervals in production if NOT running in a serverless environment like Vercel
    if (!isServerless) {
        const cleanUpInterval = setInterval(() => {
            runHoldCleanup(io);
        }, 60000);
        if (cleanUpInterval && typeof cleanUpInterval.unref === 'function') {
            cleanUpInterval.unref();
        }
    }
}

// Initialize in-process timers only on a long-running server. On Vercel they
// never fire; there the jobs run via POST /api/cron/* (see routes/cronRoutes.ts).
// DISABLE_INTERNAL_CRON=true also turns them off (e.g. local testing against
// the real database, so no real reminders go out).
if (!process.env.VERCEL && process.env.DISABLE_INTERNAL_CRON !== 'true') {
    initDailyStatsCron();
    initAppointmentRemindersCron();
    initFollowUpRemindersCron();
    initSubscriptionExpiryCron();
} else {
    console.log('[Cron] In-process timers disabled; jobs run via /api/cron/*');
}

export default app;