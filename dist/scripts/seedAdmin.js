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
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = __importDefault(require("../models/User"));
dotenv_1.default.config();
const seedAdmin = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/e-pharmacy';
        console.log('Connecting to MongoDB at:', uri);
        yield mongoose_1.default.connect(uri);
        console.log('Connected! Creating Admin...');
        const email = 'admin@pillora.in';
        const password = 'admin';
        const salt = yield bcryptjs_1.default.genSalt(10);
        const passwordHash = yield bcryptjs_1.default.hash(password, salt);
        const user = yield User_1.default.findOneAndUpdate({ email }, {
            name: 'Super Admin',
            email,
            passwordHash,
            role: 'admin',
            status: 'approved'
        }, { upsert: true, new: true });
        console.log('-----------------------------------');
        console.log('✅ Admin Account Ready');
        console.log('📧 Email:    ' + email);
        console.log('🔑 Password: ' + password);
        console.log('-----------------------------------');
        process.exit(0);
    }
    catch (error) {
        console.error('Failed to seed admin:', error);
        process.exit(1);
    }
});
seedAdmin();
