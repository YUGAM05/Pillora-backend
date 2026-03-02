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
exports.searchProducts = exports.getProductById = exports.getDealProducts = exports.getPublicProducts = void 0;
const Inventory_1 = __importDefault(require("../models/Inventory"));
// @desc    Get all approved products for public view
// @route   GET /api/products?category=Medicine
// @access  Public
const getPublicProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { category } = req.query;
        // Build filter for approved or pending products (for visibility during dev/testing)
        const filter = { status: { $in: ['approved', 'pending'] } };
        // Add category filter if provided
        if (category && typeof category === 'string') {
            filter.category = category;
        }
        const products = yield Inventory_1.default.find(filter)
            .populate('seller', 'name')
            .sort({ createdAt: -1 });
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching products', error });
    }
});
exports.getPublicProducts = getPublicProducts;
// @desc    Get deals of the day
// @route   GET /api/products/deals
// @access  Public
const getDealProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const deals = yield Inventory_1.default.find({
            status: { $in: ['approved', 'pending'] },
            isDealOfDay: true
        })
            .populate('seller', 'name')
            .limit(8) // Max 8 deals
            .sort({ createdAt: -1 });
        res.json(deals);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching deals', error });
    }
});
exports.getDealProducts = getDealProducts;
// @desc    Get single product details
// @route   GET /api/products/:id
// @access  Public
const getProductById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const product = yield Inventory_1.default.findById(req.params.id)
            .populate('seller', 'name shopName address'); // minimal seller info
        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }
        if (product.status !== 'approved' && product.status !== 'pending') {
            res.status(404).json({ message: 'Product not available' });
            return;
        }
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching product', error });
    }
});
exports.getProductById = getProductById;
// @desc    Search products (Autocomplete)
// @route   GET /api/products/search?q=query
// @access  Public
const searchProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            res.json([]);
            return;
        }
        const products = yield Inventory_1.default.find({
            status: 'approved',
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { category: { $regex: q, $options: 'i' } }
            ]
        })
            .select('name category sellingPrice imageUrl images')
            .limit(10);
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ message: 'Error searching products', error });
    }
});
exports.searchProducts = searchProducts;
