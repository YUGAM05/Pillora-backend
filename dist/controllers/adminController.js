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
exports.verifyUserAadhaar = exports.getAdminTrends = exports.getAllOrders = exports.updateProduct = exports.getUserOrders = exports.toggleDealStatus = exports.deleteProduct = exports.updateProductStatus = exports.getAdminProducts = exports.updateUserStatus = exports.getUsers = exports.getSystemStats = void 0;
const User_1 = __importDefault(require("../models/User"));
const BloodDonor_1 = __importDefault(require("../models/BloodDonor"));
const Inventory_1 = __importDefault(require("../models/Inventory"));
const Order_1 = __importDefault(require("../models/Order"));
const Notification_1 = __importDefault(require("../models/Notification"));
const aadhaarVerifier_1 = require("../utils/aadhaarVerifier");
// @desc    Get system statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
const getSystemStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const totalUsers = yield User_1.default.countDocuments({ role: 'customer' });
        const totalSellers = yield User_1.default.countDocuments({ role: 'seller', status: 'approved' });
        const totalDonors = yield BloodDonor_1.default.countDocuments();
        const totalOrders = yield Order_1.default.countDocuments();
        const pendingProducts = yield Inventory_1.default.countDocuments({ status: 'pending' });
        // Calculate Revenue
        const revenueResult = yield Order_1.default.aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
        // Calculate Admin Profit
        const profitResult = yield Order_1.default.aggregate([
            { $match: { paymentStatus: 'paid' } },
            {
                $group: {
                    _id: null,
                    totalProfit: {
                        $sum: {
                            $add: [
                                "$platformFee",
                                "$sellerCommission",
                                { $ifNull: ["$adminDeliveryCommission", 0] }
                            ]
                        }
                    }
                }
            }
        ]);
        const totalProfit = profitResult.length > 0 ? profitResult[0].totalProfit : 0;
        const recentUsers = yield User_1.default.find().sort({ createdAt: -1 }).limit(10).select('-passwordHash');
        const activeSellers = yield User_1.default.find({ role: 'seller', status: 'approved' }).sort({ createdAt: -1 }).limit(5).select('-passwordHash');
        res.json({
            counts: {
                users: totalUsers,
                sellers: totalSellers,
                donors: totalDonors,
                orders: totalOrders,
                pendingProducts,
                revenue: totalRevenue,
                profit: totalProfit
            },
            recentUsers,
            activeSellers
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getSystemStats = getSystemStats;
// @desc    Get users by role/status
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { role, status } = req.query;
        let query = {};
        if (role)
            query.role = role;
        if (status)
            query.status = status;
        const users = yield User_1.default.find(query).select('-passwordHash').sort({ createdAt: -1 });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getUsers = getUsers;
// @desc    Update user status (Approve/Reject)
// @route   PUT /api/admin/users/:id/status
// @access  Private/Admin
const updateUserStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status } = req.body;
        const { id } = req.params;
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            res.status(400).json({ message: 'Invalid status' });
            return;
        }
        const user = yield User_1.default.findByIdAndUpdate(id, { status }, { new: true }).select('-passwordHash');
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.updateUserStatus = updateUserStatus;
// @desc    Get all products (admin view)
// @route   GET /api/admin/inventory
// @access  Private/Admin
const getAdminProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status } = req.query;
        let query = {};
        if (status)
            query.status = status;
        const products = yield Inventory_1.default.find(query).populate('seller', 'name email').sort({ createdAt: -1 });
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching inventory', error });
    }
});
exports.getAdminProducts = getAdminProducts;
// @desc    Approve/Reject Product
// @route   PUT /api/admin/inventory/:id/status
// @access  Private/Admin
const updateProductStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, adminComments } = req.body;
        const { id } = req.params;
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            res.status(400).json({ message: 'Invalid status' });
            return;
        }
        const product = yield Inventory_1.default.findByIdAndUpdate(id, { status, adminComments }, { new: true });
        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }
        // Notify Seller
        if (product.seller) {
            yield Notification_1.default.create({
                user: product.seller,
                message: `Your product "${product.name}" has been ${status} by the admin.${adminComments ? ` Comment: ${adminComments}` : ''}`,
                type: status === 'approved' ? 'success' : 'error',
                relatedId: product._id
            });
        }
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating product', error });
    }
});
exports.updateProductStatus = updateProductStatus;
// @desc    Delete Product (Hard Delete)
// @route   DELETE /api/admin/inventory/:id
// @access  Private/Admin
const deleteProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const product = yield Inventory_1.default.findByIdAndDelete(id);
        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }
        res.json({ message: 'Product deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting product', error });
    }
});
exports.deleteProduct = deleteProduct;
// @desc    Toggle Deal of the Day status
// @route   PUT /api/admin/inventory/:id/deal
// @access  Private/Admin
const toggleDealStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const product = yield Inventory_1.default.findById(id);
        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }
        // Only approved products can be deals
        if (product.status !== 'approved') {
            res.status(400).json({ message: 'Only approved products can be marked as deals' });
            return;
        }
        product.isDealOfDay = !product.isDealOfDay;
        yield product.save();
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: 'Error toggling deal status', error });
    }
});
exports.toggleDealStatus = toggleDealStatus;
// @desc    Get orders for a specific user
// @route   GET /api/admin/users/:id/orders
// @access  Private/Admin
const getUserOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const orders = yield Order_1.default.find({ user: id })
            .populate('items.product', 'name imageUrl')
            .sort({ createdAt: -1 });
        res.json(orders);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching user orders', error });
    }
});
exports.getUserOrders = getUserOrders;
// @desc    Update product details (Admin edit)
// @route   PUT /api/admin/inventory/:id
// @access  Private/Admin
const updateProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const product = yield Inventory_1.default.findByIdAndUpdate(id, updateData, { new: true });
        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating product', error });
    }
});
exports.updateProduct = updateProduct;
// @desc    Get all orders
// @route   GET /api/admin/orders
// @access  Private/Admin
const getAllOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield Order_1.default.find()
            .populate('user', 'name email')
            .populate('items.product', 'name imageUrl')
            .sort({ createdAt: -1 });
        res.json(orders);
    }
    catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: 'Error fetching all orders', error });
    }
});
exports.getAllOrders = getAllOrders;
// @desc    Get dashboard trend data (Revenue & Signups)
// @route   GET /api/admin/trends
// @access  Private/Admin
const getAdminTrends = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        // Revenue Trends (Paid Orders)
        const revenueTrends = yield Order_1.default.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    paymentStatus: 'paid'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$totalAmount" },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);
        // User Signup Trends
        const signupTrends = yield User_1.default.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);
        // Seller Signup Trends
        const sellerTrends = yield User_1.default.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    role: 'seller'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);
        res.json({
            revenue: revenueTrends,
            users: signupTrends,
            sellers: sellerTrends
        });
    }
    catch (error) {
        console.error("Trends Error:", error);
        res.status(500).json({ message: 'Error fetching trend data', error });
    }
});
exports.getAdminTrends = getAdminTrends;
// @desc    Verify user Aadhaar with AI
// @route   POST /api/admin/users/:id/verify-aadhaar
// @access  Private/Admin
const verifyUserAadhaar = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const user = yield User_1.default.findById(id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        if (!user.aadhaarCardUrl) {
            res.status(400).json({ message: 'No Aadhaar card found for this user' });
            return;
        }
        const result = yield (0, aadhaarVerifier_1.verifyAadhaarLocal)(user.aadhaarCardUrl, user.name);
        user.kyc_status = result.status;
        // In this case, we use the status to also update the main status if approved?
        // Or just update kyc_status.
        yield user.save();
        res.json({
            message: result.status === 'Verified' ? 'Aadhaar verified successfully' : result.remarks,
            kyc_status: user.kyc_status,
            remarks: result.remarks
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
});
exports.verifyUserAadhaar = verifyUserAadhaar;
