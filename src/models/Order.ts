import mongoose, { Schema, Document } from 'mongoose';

export interface IOrder {
    user_id: mongoose.Types.ObjectId;
    user?: mongoose.Types.ObjectId; // Legacy support
    rx_id?: string;
    seller_id: mongoose.Types.ObjectId;
    seller?: mongoose.Types.ObjectId; // Legacy support
    delivery_agent_id?: mongoose.Types.ObjectId;
    assignedDelivery?: mongoose.Types.ObjectId; // Legacy support
    medicines: Array<{
        medicine_id: mongoose.Types.ObjectId;
        product?: mongoose.Types.ObjectId; // Legacy support
        name: string;
        quantity: number;
        price: number;
    }>;
    items?: Array<any>; // Legacy support
    total_amount: number;
    totalAmount?: number; // Legacy support
    delivery_address: string;
    shippingLocation?: any; // Legacy support
    status: 'prescription_verified' | 'order_placed' | 'confirmed_by_seller' | 'out_for_pickup' | 'in_transit' | 'delivered' | 'cancelled' | 'pending' | 'confirmed' | 'shipped';
    orderStatus?: string; // Legacy support
    payment_status: 'pending' | 'paid' | 'refunded';
    paymentStatus?: string; // Legacy support
    delivery_location?: {
        lat: number;
        lng: number;
    };
    estimated_delivery?: Date;
    platform_fee: number;
    platformFee?: number; // Legacy support
    seller_commission: number;
    sellerCommission?: number; // Legacy support
    delivery_fee?: number;
    deliveryFee?: number; // Legacy support
    deliveryEarning?: number; // Legacy support
    adminDeliveryCommission?: number; // Legacy support
    medicineSubtotal?: number; // Legacy support
    deliveryDistance?: number; // Legacy support
}

export interface IOrderDocument extends IOrder, Document { }

const OrderSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' }, // Legacy
    rx_id: { type: String },
    seller_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User' }, // Legacy
    delivery_agent_id: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedDelivery: { type: Schema.Types.ObjectId, ref: 'User' }, // Legacy
    medicines: [{
        medicine_id: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
        product: { type: Schema.Types.ObjectId, ref: 'Inventory' }, // Legacy
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
    items: [{ // Legacy
        product: { type: Schema.Types.ObjectId, ref: 'Inventory' },
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

export default mongoose.model<IOrderDocument>('Order', OrderSchema);
