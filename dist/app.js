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
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const express_session_1 = __importDefault(require("express-session"));
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
    }
    else {
        const isLocal = origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'));
        const isVercel = origin && origin.endsWith('.vercel.app');
        const isPillora = origin && (origin.includes('pillora.in') || origin.includes('pillora-admin'));
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
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const bloodBankRoutes_1 = __importDefault(require("./routes/bloodBankRoutes"));
const safetyRoutes_1 = __importDefault(require("./routes/safetyRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const sellerRoutes_1 = __importDefault(require("./routes/sellerRoutes"));
const deliveryRoutes_1 = __importDefault(require("./routes/deliveryRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const prescriptionRoutes_1 = __importDefault(require("./routes/prescriptionRoutes"));
const hospitalRoutes_1 = __importDefault(require("./routes/hospitalRoutes"));
const orderRoutes_1 = __importDefault(require("./routes/orderRoutes"));
const healthHubRoutes_1 = __importDefault(require("./routes/healthHubRoutes"));
const supportRoutes_1 = __importDefault(require("./routes/supportRoutes"));
const blogRoutes_1 = __importDefault(require("./routes/blogRoutes"));
const aiRoutes_1 = __importDefault(require("./routes/aiRoutes"));
const couponRoutes_1 = __importDefault(require("./routes/couponRoutes"));
const medicineRoutes_1 = __importDefault(require("./routes/medicineRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const partnerRoutes_1 = __importDefault(require("./routes/partnerRoutes"));
const hospitalDashboardRoutes_1 = __importDefault(require("./routes/hospitalDashboardRoutes"));
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
app.use('/api/auth', authRoutes_1.default);
app.use('/api/blood-bank', bloodBankRoutes_1.default);
app.use('/api/safety', safetyRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/api/seller', sellerRoutes_1.default);
app.use('/api/delivery', deliveryRoutes_1.default);
app.use('/api/products', productRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/prescriptions', prescriptionRoutes_1.default);
app.use('/api/hospitals', hospitalRoutes_1.default);
app.use('/api/orders', orderRoutes_1.default);
app.use('/api/health-hub', healthHubRoutes_1.default);
app.use('/api/support', supportRoutes_1.default);
app.use('/api/blogs', blogRoutes_1.default);
app.use('/api/ai', aiRoutes_1.default);
app.use('/api/coupons', couponRoutes_1.default);
app.use('/api/medicines', medicineRoutes_1.default);
app.use('/api/upload', uploadRoutes_1.default);
app.use('/api/partners', partnerRoutes_1.default);
app.use('/api/hospital/dashboard', hospitalDashboardRoutes_1.default);
app.use('/api/metrics', analyticsRoutes_1.default);
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Apex Care API is running with Sockets',
        timestamp: new Date().toISOString(),
        dbStatus: mongoose_1.default.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    });
});
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    if (mongoose_1.default.connection.readyState === 1)
        return;
    try {
        const uri = process.env.MONGO_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster';
        yield mongoose_1.default.connect(uri, {
            serverSelectionTimeoutMS: 4000,
            connectTimeoutMS: 4000,
        });
        console.log('[DB] Connected to MongoDB');
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
