// Deployment Trigger: 2026-05-15 13:50
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import session from 'express-session';

// Disable command buffering globally so queries fail immediately in case of database disconnection
mongoose.set('bufferCommands', false);
import passport from './config/passport';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // Allow all origins dynamically
            callback(null, true);
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

const allowedOrigins = [
    'https://pillora.in',
    'https://www.pillora.in',
    'https://pillora-admin.vercel.app',
    'https://www.pillora-admin.vercel.app',
    'https://pillora-hospital.vercel.app',
    'https://pillora-seller.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:5000',
];

// ─── CORS — registered FIRST, before DB middleware and all routes ─────────────
// OPTIONS preflight is short-circuited here with 200 so the DB middleware
// never runs on preflight requests (a DB error would send a 500 with no CORS
// headers, causing the browser to report a CORS failure instead of the real error).
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    const origin = req.headers.origin;

    if (origin === 'https://pillora-admin.vercel.app' || origin === 'https://www.pillora-admin.vercel.app') {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        const isLocal = origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'));
        const isVercel = origin && origin.endsWith('.vercel.app');
        const isPillora = origin && (origin.includes('pillora.in') || origin.includes('pillora-admin'));

        if (origin && (isLocal || isVercel || isPillora || allowedOrigins.includes(origin))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else if (!origin) {
            // Non-browser clients (curl, Postman, server-to-server)
            res.setHeader('Access-Control-Allow-Origin', '*');
        } else {
            // Fallback: set origin dynamically if it exists to allow successful handshake
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // cache preflight 24 h

    // ✅ Return 200 immediately for OPTIONS — do NOT fall through to DB middleware
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Explicit OPTIONS handler for all routes to ensure preflight always succeeds
app.options(/.*/, (req, res) => {
    const origin = req.headers.origin;
    if (origin === 'https://pillora-admin.vercel.app' || origin === 'https://www.pillora-admin.vercel.app') {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
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

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(morgan('dev'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

app.use(passport.initialize());
app.use(passport.session());

import authRoutes from './routes/authRoutes';
import bloodBankRoutes from './routes/bloodBankRoutes';
import safetyRoutes from './routes/safetyRoutes';
import adminRoutes from './routes/adminRoutes';
import sellerRoutes from './routes/sellerRoutes';
import deliveryRoutes from './routes/deliveryRoutes';
import productRoutes from './routes/productRoutes';
import notificationRoutes from './routes/notificationRoutes';
import prescriptionRoutes from './routes/prescriptionRoutes';
import hospitalRoutes from './routes/hospitalRoutes';
import orderRoutes from './routes/orderRoutes';
import healthHubRoutes from './routes/healthHubRoutes';
import supportRoutes from './routes/supportRoutes';
import blogRoutes from './routes/blogRoutes';
import aiRoutes from './routes/aiRoutes';
import couponRoutes from './routes/couponRoutes';
import medicineRoutes from './routes/medicineRoutes';
import uploadRoutes from './routes/uploadRoutes';
import partnerRoutes from './routes/partnerRoutes';
import hospitalDashboardRoutes from './routes/hospitalDashboardRoutes';
import analyticsRoutes from './routes/analyticsRoutes';



app.use('/api/auth', authRoutes);
app.use('/api/blood-bank', bloodBankRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/health-hub', healthHubRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/hospital/dashboard', hospitalDashboardRoutes);
app.use('/api/metrics', analyticsRoutes);

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Apex Care API is running with Sockets',
        timestamp: new Date().toISOString(),
        dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    });
});

export const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    try {
        const uri = process.env.MONGO_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster';
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 4000,
            connectTimeoutMS: 4000,
        });
        console.log('[DB] Connected to MongoDB');
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

export default app;