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
exports.connectDB = void 0;
// Deployment Trigger: 2026-05-15 13:50
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const express_session_1 = __importDefault(require("express-session"));
const connect_mongo_1 = __importDefault(require("connect-mongo"));
// Disable command buffering globally so queries fail immediately in case of database disconnection
mongoose_1.default.set('bufferCommands', false);
const passport_1 = __importDefault(require("./config/passport"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
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
    'https://www.pillora-hospital.vercel.app',
    'https://pillora-seller.vercel.app',
    'https://www.pillora-seller.vercel.app',
    'https://pillorahospital.in',
    'https://www.pillorahospital.in',
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
    }
    else {
        const isLocal = origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'));
        const isVercel = origin && origin.endsWith('.vercel.app');
        const isPillora = origin && (origin.includes('pillora.in') ||
            origin.includes('pillora-admin') ||
            origin.includes('pillora-hospital') ||
            origin.includes('pillora-seller') ||
            origin.includes('pillorahospital.in'));
        if (origin && (isLocal || isVercel || isPillora || allowedOrigins.includes(origin))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        else if (!origin) {
            // Non-browser clients (curl, Postman, server-to-server)
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        else {
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
    }
    else if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
});
// ─── DB middleware — only reached by non-OPTIONS requests ────────────────────
app.use((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, exports.connectDB)();
        next();
    }
    catch (err) {
        console.error('[DBMiddleware] Database connection failed:', err.message);
        res.status(500).json({
            message: 'Database connection failed',
            error: process.env.NODE_ENV === 'production' ? undefined : err.message,
        });
    }
}));
app.use(express_1.default.json({ limit: '100mb' }));
app.use(express_1.default.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express_1.default.static('uploads')); // Serve uploaded files
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, morgan_1.default)('dev'));
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    store: connect_mongo_1.default.create({
        mongoUrl: process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster',
        collectionName: 'sessions',
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
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
console.log('=== ANALYTICS ROUTES LOADING ===');
const analyticsRoutes = require('./routes/analyticsRoutes').default || require('./routes/analyticsRoutes');
app.use('/api/metrics', analyticsRoutes);
console.log('=== ANALYTICS ROUTES LOADED ===');
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Pillora API is running with Sockets',
        timestamp: new Date().toISOString(),
        dbStatus: mongoose_1.default.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    });
});
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    if (mongoose_1.default.connection.readyState === 1)
        return;
    // If connection is already in progress, wait for the open event to complete
    if (mongoose_1.default.connection.readyState === 2) {
        console.log('[DB] Connection in progress, waiting for open event...');
        yield new Promise((resolve, reject) => {
            const onOpen = () => {
                cleanup();
                resolve(true);
            };
            const onError = (err) => {
                cleanup();
                reject(err);
            };
            const cleanup = () => {
                mongoose_1.default.connection.removeListener('open', onOpen);
                mongoose_1.default.connection.removeListener('error', onError);
            };
            mongoose_1.default.connection.once('open', onOpen);
            mongoose_1.default.connection.once('error', onError);
        });
        return;
    }
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster';
        yield mongoose_1.default.connect(uri, {
            dbName: 'e-pharmacy',
            serverSelectionTimeoutMS: 4000,
            connectTimeoutMS: 4000,
        });
        console.log('[DB] Connected to MongoDB:', mongoose_1.default.connection.name);
    }
    catch (error) {
        console.error('[DB] Connection Error:', error.message);
        throw error;
    }
});
exports.connectDB = connectDB;
app.use((err, req, res, next) => {
    console.error('[GlobalError]', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});
const holdManager_1 = require("./utils/holdManager");
const isServerless = process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME;
if (process.env.NODE_ENV !== 'production' && !isServerless) {
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server (HTTP + WS) ready on port ${PORT}`);
        // Connect to DB in background so server stays alive even if DB is slow
        (0, exports.connectDB)().then(() => {
            console.log('✅ Background DB connection established');
            // Start the 60 seconds cron fallback job for expired holds
            setInterval(() => {
                (0, holdManager_1.runHoldCleanup)(io);
            }, 60000);
        }).catch(err => {
            console.error('❌ Background DB connection failed:', err);
        });
    });
}
else {
    // Only run persistent intervals in production if NOT running in a serverless environment like Vercel
    if (!isServerless) {
        const cleanUpInterval = setInterval(() => {
            (0, holdManager_1.runHoldCleanup)(io);
        }, 60000);
        if (cleanUpInterval && typeof cleanUpInterval.unref === 'function') {
            cleanUpInterval.unref();
        }
    }
}
exports.default = app;
