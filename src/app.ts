import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import session from 'express-session';
import passport from './config/passport';

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
    'https://apex-admin-panel.vercel.app',
    'https://apex-user-panel.vercel.app',
    'https://apex-seller-panel.vercel.app',
    'https://apex-delivery-panel.vercel.app',
    'https://apex-backend-theta.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:5000',
];

const corsOptions: cors.CorsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked request from: ${origin}`);
            callback(new Error(`CORS policy: origin ${origin} not allowed`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false,
};

// ✅ Apply CORS to all routes
app.use(cors(corsOptions));

// ✅ CRITICAL FIX: Handle preflight OPTIONS requests for all routes
app.options('(.*)', cors(corsOptions));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(morgan('dev'));

// ✅ FIXED: Added sameSite: 'none' for cross-origin cookie support
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

// FIX: Ensure DB is connected before every request in serverless environment
app.use(async (req, res, next) => {
    if (mongoose.connection.readyState === 0) {
        console.log('[middleware] DB disconnected, reconnecting...');
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

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Apex Care API is running',
        timestamp: new Date().toISOString(),
        dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        services: {
            aiSafetyChecker: 'Active',
            bloodBank: 'Active',
        },
    });
});

export const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) {
        console.log('[DB] Already connected, reusing connection');
        return;
    }
    try {
        const uri = process.env.MONGO_URI;
        console.log('[DB] MONGO_URI exists:', !!uri);
        if (!uri) {
            console.error('[DB] MONGO_URI is not set in environment variables!');
            return;
        }
        console.log('[DB] Connecting to MongoDB...');
        await mongoose.connect(uri);
        console.log('[DB] MongoDB Connected successfully!');
    } catch (error: any) {
        console.error('[DB] MongoDB Connection Error:', error.message);
    }
};

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[GlobalError]', err.message);
    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
    });
});

if (process.env.NODE_ENV !== 'production') {
    (async () => {
        try {
            await connectDB();
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT} - Payload Limit 100mb Active`);
            });
        } catch (err) {
            console.error('Fatal startup error:', err);
        }
    })();
}

export default app;