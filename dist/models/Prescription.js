"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const PrescriptionSchema = new mongoose_1.Schema({
    rx_id: { type: String, unique: true },
    user_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    image_url: { type: String, required: true },
    ocr_text: { type: String },
    ai_result: { type: mongoose_1.Schema.Types.Mixed },
    medicines_extracted: [{
            name: String,
            dosage: String,
            quantity: String,
            duration: String
        }],
    admin_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    admin_notes: { type: String },
    valid_until: { type: Date },
    is_used: { type: Boolean, default: false }
}, { timestamps: true });
PrescriptionSchema.pre('save', function () {
    return __awaiter(this, void 0, void 0, function* () {
        if (!this.rx_id) {
            const year = new Date().getFullYear();
            const count = yield mongoose_1.default.model('Prescription').countDocuments();
            this.rx_id = `RX-${year}-${(count + 1).toString().padStart(5, '0')}`;
        }
    });
});
exports.default = mongoose_1.default.model('Prescription', PrescriptionSchema);
