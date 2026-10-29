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
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const mongoose_1 = __importDefault(require("mongoose"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
function migrate() {
    return __awaiter(this, void 0, void 0, function* () {
        const mongoUri = process.env.MONGO_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster';
        yield mongoose_1.default.connect(mongoUri);
        console.log('Connected to DB for subscription migration');
        const hospitals = yield Hospital_1.default.find();
        console.log(`Found ${hospitals.length} hospitals`);
        for (const h of hospitals) {
            let changed = false;
            if (!h.joiningDate) {
                h.joiningDate = h.createdAt || new Date();
                changed = true;
            }
            if (!h.subscriptionDurationDays) {
                h.subscriptionDurationDays = 30;
                changed = true;
            }
            if (!h.paymentStatus) {
                h.paymentStatus = 'Pending';
                changed = true;
            }
            if (!h.subscriptionStatus) {
                h.subscriptionStatus = 'Pending';
                changed = true;
            }
            if (changed) {
                yield h.save();
                console.log(`Migrated ${h.name}: joiningDate=${h.joiningDate}, paymentStatus=${h.paymentStatus}, subscriptionStatus=${h.subscriptionStatus}`);
            }
            else {
                console.log(`${h.name} is already up to date`);
            }
        }
        console.log('Migration completed');
        process.exit(0);
    });
}
migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
