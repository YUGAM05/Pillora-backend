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
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
            product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Inventory' },
            name: { type: String, required: true },
            price: { type: Number, required: true },
            quantity: { type: Number, required: true },
            image: { type: String }
        }],
    shippingAddress: {
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        email: { type: String, required: true },
        addressLine1: { type: String, required: true },
        addressLine2: { type: String },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pinCode: { type: String, required: true },
        addressType: { type: String, enum: ['home', 'office'], default: 'home' }
    },
    totalAmount: { type: Number, required: true },
    medicineSubtotal: { type: Number, required: true },
    platformFee: { type: Number, required: true, default: 10 },
    sellerCommission: { type: Number, required: true },
    deliveryFee: { type: Number },
    adminDeliveryCommission: { type: Number },
    paymentMethod: { type: String, required: true, default: 'cod' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    orderStatus: { type: String, enum: ['pending', 'confirmed', 'shipped', 'out_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'], default: 'pending' },
    assignedDelivery: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    deliveryDistance: { type: Number },
    deliveryEarning: { type: Number },
    shippingLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    notes: { type: String },
    couponCode: { type: String },
    discountAmount: { type: Number, default: 0 }
}, { timestamps: true });
exports.default = mongoose_1.default.model('Order', OrderSchema);
