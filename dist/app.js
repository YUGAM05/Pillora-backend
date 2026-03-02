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

const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("./config/passport"));

const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;

// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
}));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '100mb' }));
app.use(express_1.default.urlencoded({ limit: '100mb', extended: true }));

// ✅ CORS - All panel origins allowed
const allowedOrigins = [
    // Local development
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004',

    // ✅ USER PANEL
    'https://apex-user-panel.vercel.app',

    // ✅ ADMIN PANEL
    'https://apex-admin-panel.vercel.app',

    // ✅ SELLER PANEL
    'https://apex-seller-panel.vercel.app',

    // ✅ DELIVERY PANEL
    'https://apex-delivery-panel.vercel.app',

    // ✅ BACKEND (for internal requests)
    'https://apex-backend-theta.vercel.app',

    // From environment variable (optional extra origin)
    process.env.FRONTEND_URL
].filter(Boolean); // removes undefined if FRONTEND_URL is not set

app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.error('CORS blocked for origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

// ✅ CRITICAL: Handle preflight OPTIONS requests (fixes the "preflight failed" error)
app.options('*', (0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

// Session middleware
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Initialize Passport
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());

// Routes
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

// Health Check Root Route
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Apex Care API is running on Vercel',
        status: 'Online'
    });
});

// Database Connection
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!process.env.MONGO_URI) {
            console.error('MONGO_URI is missing!');
            return;
        }
        if (mongoose_1.default.connection.readyState >= 1) return;
        yield mongoose_1.default.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected!');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
    }
});

// Connect to DB immediately for Serverless
connectDB();

// Global Error Handler
app.use((err, req, res, next) => {
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// Listen only if not on Vercel (local dev)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}

// THE MOST IMPORTANT LINE FOR VERCEL:
module.exports = app;