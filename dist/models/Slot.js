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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const SlotSchema = new mongoose_1.Schema({
    doctor: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    hospital: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['available', 'booked', 'blocked', 'cancelled'], default: 'available' },
    appointment: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Appointment' },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    cancelledBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    booked_count: { type: Number, default: 0 },
    max_appointments: { type: Number, default: 1 },
    hold_count: { type: Number, default: 0 },
}, { timestamps: true });
// Index for quick availability lookups
SlotSchema.index({ doctor: 1, startTime: 1 });
SlotSchema.index({ hospital: 1, status: 1 });
exports.default = mongoose_1.default.model('Slot', SlotSchema);
