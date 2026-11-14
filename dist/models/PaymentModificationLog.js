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
const PaymentModificationLogSchema = new mongoose_1.Schema({
    appointmentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
        index: true
    },
    paymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Payment',
        required: false,
        index: true
    },
    hospitalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    modifiedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    modifierName: {
        type: String,
        default: 'Hospital Staff'
    },
    modifierRole: {
        type: String,
        default: 'hospital'
    },
    reason: {
        type: String,
        required: true,
        trim: true
    },
    previousValues: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true
    },
    updatedValues: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true
    },
    changes: [
        {
            field: { type: String, required: true },
            label: { type: String, required: true },
            oldValue: { type: mongoose_1.Schema.Types.Mixed },
            newValue: { type: mongoose_1.Schema.Types.Mixed }
        }
    ],
    ipAddress: {
        type: String,
        default: 'unknown'
    },
    userAgent: {
        type: String,
        default: 'unknown'
    }
}, {
    timestamps: true
});
PaymentModificationLogSchema.index({ hospitalId: 1, createdAt: -1 });
PaymentModificationLogSchema.index({ appointmentId: 1, createdAt: -1 });
exports.default = mongoose_1.default.model('PaymentModificationLog', PaymentModificationLogSchema);
