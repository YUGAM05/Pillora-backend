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
exports.setupAdmin = exports.loginUser = exports.registerUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const generateToken = (id, role) => {
    return jsonwebtoken_1.default.sign({ id, role }, process.env.JWT_SECRET || 'defaultSecret', {
        expiresIn: '30d',
    });
};
const registerUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password, role, bankDetails, pharmacyCertificate, aadhaarCardUrl, phone, address } = req.body;
    try {
        console.log(`Registering user: ${email}, Role: ${role}`);
        const userExists = yield User_1.default.findOne({ email: email.toLowerCase() });
        if (userExists) {
            console.log('Registration failed: User already exists');
            res.status(400).json({ message: 'User already exists' });
            return;
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        const passwordHash = yield bcryptjs_1.default.hash(password, salt);
        const initialStatus = role === 'seller' ? 'pending' : 'approved';
        const userData = {
            name,
            email: email.toLowerCase(),
            passwordHash,
            role: role || 'customer',
            status: initialStatus,
            phone,
            address
        };
        if (role === 'seller') {
            if (bankDetails)
                userData.bankDetails = bankDetails;
            if (pharmacyCertificate)
                userData.pharmacyCertificate = pharmacyCertificate;
            if (aadhaarCardUrl)
                userData.aadhaarCardUrl = aadhaarCardUrl;
        }
        const user = yield User_1.default.create(userData);
        if (user) {
            console.log('User created successfully:', user._id);
            if (user.status === 'pending') {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    message: "Registration successful. Please wait for admin approval."
                });
            }
            else {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    phone: user.phone,
                    address: user.address,
                    location: user.location,
                    token: generateToken(user._id, user.role),
                });
            }
        }
        else {
            console.log('Registration failed: User creation returned null');
            res.status(400).json({ message: 'Invalid user data provided' });
        }
    }
    catch (error) {
        console.error('Registration Server Error:', error);
        res.status(500).json({
            message: 'Internal server error during registration',
            details: error.message
        });
    }
});
exports.registerUser = registerUser;
const loginUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    try {
        const user = yield User_1.default.findOne({ email: email.toLowerCase() });
        if (user && user.passwordHash && (yield bcryptjs_1.default.compare(password, user.passwordHash))) {
            console.log(`Login attempt for ${email}: Role=${user.role}, Status=${user.status}`);
            // Allow admin, customer, or any non-rejected user to login
            // We only block rejected users here. Pending users can login but usually have limited access on frontend.
            if (user.role !== 'admin' && user.status === 'rejected') {
                res.status(403).json({
                    message: 'Your account has been rejected. Please contact support.',
                    status: user.status
                });
                return;
            }
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                phone: user.phone,
                address: user.address,
                location: user.location,
                token: generateToken(user._id, user.role),
            });
        }
        else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.loginUser = loginUser;
// Temporary Setup Route
const setupAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const email = 'admin@life-link.com';
        const password = 'admin';
        const salt = yield bcryptjs_1.default.genSalt(10);
        const passwordHash = yield bcryptjs_1.default.hash(password, salt);
        yield User_1.default.findOneAndUpdate({ email }, { name: 'Super Admin', email, passwordHash, role: 'admin', status: 'approved' }, { upsert: true, new: true });
        console.log("Admin setup complete via API.");
        res.json({ message: "Admin Account Created Successfully! Login with admin@life-link.com / admin" });
    }
    catch (error) {
        res.status(500).json({ message: 'Setup Failed', error });
    }
});
exports.setupAdmin = setupAdmin;
