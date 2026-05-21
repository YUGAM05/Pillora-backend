// Deployment Trigger: 2026-05-15 13:50
import dotenv from 'dotenv';
dotenv.config();

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
    'https://pillora.in',        // ✅ added
    'https://www.pillora.in',    // ✅ added
    'https://pillora-admin.vercel.app', // ✅ added
    'https://www.pillora-admin.vercel.app', // ✅ added
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:5000',
];

// ✅ Permissive CORS for development
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    const origin = req.headers.origin;
    // Allow all local origins, Vercel deployments, or allowed list
    const isLocal = origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'));
    const isVercel = origin && origin.endsWith('.vercel.app');
    const isPillora = origin && (origin.includes('pillora.in') || origin.includes('pillora-admin'));
    if (origin && (isLocal || isVercel || isPillora || allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
        // Fallback for tools/non-browser requests
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Ensure Database connection is fully established before processing requests (critical for serverless with bufferCommands: false)
app.use(async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    try {
        await connectDB();
        next();
    } catch (err: any) {
        console.error('[DBMiddleware] Database connection failed:', err.message);
        res.status(500).json({ 
            message: 'Database connection failed', 
            error: process.env.NODE_ENV === 'production' ? undefined : err.message 
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

app.use(async (req, res, next) => {
    if (mongoose.connection.readyState === 0) {
        await connectDB();
    }
    next();
});

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
        await mongoose.connect(uri);
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

if (process.env.NODE_ENV !== 'production') {
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
    // Start interval in production or serverless environments if active
    setInterval(() => {
        runHoldCleanup(io);
    }, 60000);
}

export default app;