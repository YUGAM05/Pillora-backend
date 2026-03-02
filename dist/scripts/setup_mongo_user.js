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
dotenv_1.default.config();
const MONGO_URI_UNSECURED = 'mongodb://localhost:27017/admin';
function createUser() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Connecting to MongoDB...');
            yield mongoose_1.default.connect(MONGO_URI_UNSECURED);
            console.log('Connected!');
            const db = mongoose_1.default.connection.db;
            console.log('Creating admin user...');
            // @ts-ignore
            yield db.command({
                createUser: "admin",
                pwd: "admin123",
                roles: [
                    { role: "root", db: "admin" }
                ]
            });
            console.log('Successfully created admin user!');
            console.log('Username: admin');
            console.log('Password: admin123');
            process.exit(0);
        }
        catch (error) {
            if (error.message.includes('already exists')) {
                console.log('User already exists.');
                process.exit(0);
            }
            console.error('Error creating user:', error);
            process.exit(1);
        }
    });
}
createUser();
