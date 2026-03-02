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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("./config/passport"));
const app = (0, express_1.default)();
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
// ✅ Manual CORS middleware - no cors package, no path-to-regexp issues
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // ✅ Handle preflight OPTIONS requests instantly - no wildcard needed
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});
app.use(express_1.default.json({ limit: '100mb' }));
app.use(express_1.default.urlencoded({ limit: '100mb', extended: true }));
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
// Ensure DB is connected before every request in serverless environment
app.use((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (mongoose_1.default.connection.readyState === 0) {
        console.log('[middleware] DB disconnected, reconnecting...');
        yield (0, exports.connectDB)();
    }
    next();
}));
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
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Apex Care API is running',
        timestamp: new Date().toISOString(),
        dbStatus: mongoose_1.default.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        services: {
            aiSafetyChecker: 'Active',
            bloodBank: 'Active',
        },
    });
});
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    if (mongoose_1.default.connection.readyState >= 1) {
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
        yield mongoose_1.default.connect(uri);
        console.log('[DB] MongoDB Connected successfully!');
    }
    catch (error) {
        console.error('[DB] MongoDB Connection Error:', error.message);
    }
});
exports.connectDB = connectDB;
app.use((err, req, res, next) => {
    console.error('[GlobalError]', err.message);
    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
    });
});
if (process.env.NODE_ENV !== 'production') {
    (() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield (0, exports.connectDB)();
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT} - Payload Limit 100mb Active`);
            });
        }
        catch (err) {
            console.error('Fatal startup error:', err);
        }
    }))();
}
exports.default = app;
