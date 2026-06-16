const axios = require('axios');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, 'src', '.env') });
if (!process.env.MONGO_URI) {
    dotenv.config({ path: path.join(__dirname, '.env') });
}

const API_URL = 'http://localhost:5000/api';

async function verifyFlow() {
    console.log('Starting Full Delivery Flow Verification...');

    try {
        // 1. Setup - We need a User, a Seller, and a Delivery Partner
        // For simplicity, we'll assume they exist or create them if needed.
        // But better: use existing ones if possible.

        // Registration/Login helpers
        const register = async (data) => {
            try { return await axios.post(`${API_URL}/auth/register`, data); }
            catch (e) { return e.response; }
        };
        const login = async (data) => {
            try { return await axios.post(`${API_URL}/auth/login`, data); }
            catch (e) { return e.response; }
        };

        const timestamp = Date.now();
        const userEmail = `user${timestamp}@test.com`;
        const sellerEmail = `seller${timestamp}@test.com`;
        const deliveryEmail = `delivery${timestamp}@test.com`;

        console.log('Registering User...');
        await register({ name: 'Test User', email: userEmail, password: 'password123', role: 'customer', phone: '1234567890' });
        const userLogin = await login({ email: userEmail, password: 'password123' });
        const userToken = userLogin.data.token;

        console.log('Registering Seller...');
        await register({ name: 'Test Seller', email: sellerEmail, password: 'password123', role: 'seller', phone: '1234567891' });
        const sellerLogin = await login({ email: sellerEmail, password: 'password123' });
        const sellerToken = sellerLogin.data.token;

        console.log('Registering Delivery Partner...');
        await register({ name: 'Test Delivery', email: deliveryEmail, password: 'password123', role: 'delivery', phone: '1234567892' });
        const deliveryLogin = await login({ email: deliveryEmail, password: 'password123' });
        const deliveryToken = deliveryLogin.data.token;

        // Auto-approve via DB since we're testing
        await mongoose.connect(process.env.MONGO_URI);
        const User = mongoose.model('User', new mongoose.Schema({ email: String, status: String, role: String, location: Object }));
        await User.updateOne({ email: sellerEmail }, { status: 'approved', location: { lat: 23.0225, lng: 72.5714 } });
        await User.updateOne({ email: deliveryEmail }, { status: 'approved' });
        await User.updateOne({ email: userEmail }, { location: { lat: 23.0338, lng: 72.5850 } });

        // Need a product for the seller
        const Product = mongoose.model('Product', new mongoose.Schema({ name: String, seller: mongoose.Schema.Types.ObjectId, price: Number, stock: Number }));
        const sellerUser = await User.findOne({ email: sellerEmail });
        const product = await new Product({ name: 'Paracetamol', seller: sellerUser._id, price: 50, stock: 100 }).save();

        console.log('User Placing Order...');
        const orderRes = await axios.post(`${API_URL}/orders`, {
            items: [{ product: product._id, quantity: 2, price: 50 }],
            totalAmount: 100,
            shippingAddress: {
                fullName: 'Test User',
                phone: '1234567890',
                addressLine1: 'Test Address',
                city: 'Ahmedabad',
                state: 'Gujarat',
                pinCode: '380001'
            },
            paymentMethod: 'COD'
        }, { headers: { Authorization: `Bearer ${userToken}` } });
        const orderId = orderRes.data._id;
        console.log(`Order Created: ${orderId}`);

        console.log('Seller Confirming Order...');
        await axios.put(`${API_URL}/seller/orders/${orderId}/status`, { status: 'confirmed' }, { headers: { Authorization: `Bearer ${sellerToken}` } });

        console.log('Checking Available Deliveries...');
        const availableRes = await axios.get(`${API_URL}/delivery/available`, { headers: { Authorization: `Bearer ${deliveryToken}` } });
        const availableOrder = availableRes.data.find(o => o._id === orderId);
        if (!availableOrder) throw new Error('Order not found in available deliveries');
        console.log('Order is available for delivery!');

        console.log('Delivery Partner Accepting Order...');
        await axios.put(`${API_URL}/delivery/accept/${orderId}`, {}, { headers: { Authorization: `Bearer ${deliveryToken}` } });

        console.log('Confirming Pickup...');
        await axios.put(`${API_URL}/delivery/pickup/${orderId}`, {}, { headers: { Authorization: `Bearer ${deliveryToken}` } });

        console.log('Confirming Delivery...');
        await axios.put(`${API_URL}/delivery/deliver/${orderId}`, {}, { headers: { Authorization: `Bearer ${deliveryToken}` } });

        console.log('Flow Verified Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Flow Verification Failed:');
        console.error(error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

verifyFlow();
