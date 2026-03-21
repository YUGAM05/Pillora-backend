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
const OrderSchema = new mongoose_1.Schema({
    user_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }, // Legacy
    rx_id: { type: String },
    seller_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }, // Legacy
    delivery_agent_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    assignedDelivery: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }, // Legacy
    medicines: [{
            medicine_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Medicine', required: true },
            product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Inventory' }, // Legacy
            name: { type: String, required: true },
            quantity: { type: Number, required: true },
            price: { type: Number, required: true }
        }],
    items: [{
            product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Inventory' },
            quantity: { type: Number },
            price: { type: Number }
        }],
    total_amount: { type: Number, required: true },
    totalAmount: { type: Number }, // Legacy
    delivery_address: { type: String, required: true },
    shippingLocation: { type: Object }, // Legacy
    status: {
        type: String,
        default: 'order_placed'
    },
    orderStatus: { type: String }, // Legacy
    payment_status: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    paymentStatus: { type: String }, // Legacy
    delivery_location: {
        lat: Number,
        lng: Number
    },
    estimated_delivery: { type: Date },
    platform_fee: { type: Number, default: 10 },
    platformFee: { type: Number }, // Legacy
    seller_commission: { type: Number, required: true },
    sellerCommission: { type: Number }, // Legacy
    delivery_fee: { type: Number },
    deliveryFee: { type: Number }, // Legacy
    deliveryEarning: { type: Number }, // Legacy
    adminDeliveryCommission: { type: Number }, // Legacy
    medicineSubtotal: { type: Number }, // Legacy
    deliveryDistance: { type: Number } // Legacy
}, { timestamps: true });
exports.default = mongoose_1.default.model('Order', OrderSchema);
