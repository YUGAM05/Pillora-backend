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
const path_1 = __importDefault(require("path"));
const hospitalController_1 = require("../controllers/hospitalController");
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster';
mongoose_1.default.connect(MONGO_URI)
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Connected to MongoDB. Running seed...');
    // Mock req and res
    const req = {};
    const res = {
        json: (data) => {
            console.log('Seed success:', data);
            process.exit(0);
        },
        status: (code) => {
            return {
                json: (data) => {
                    console.error('Seed failed with code', code, data);
                    process.exit(1);
                }
            };
        }
    };
    yield (0, hospitalController_1.seedHospitals)(req, res);
}))
    .catch((err) => {
    console.error('Connection error:', err);
    process.exit(1);
});
