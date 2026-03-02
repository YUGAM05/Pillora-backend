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
exports.searchHospitals = exports.uploadHospitalImages = exports.deleteHospital = exports.updateHospital = exports.createHospital = exports.seedHospitals = exports.getHospitalById = exports.getHospitals = void 0;
const Hospital_1 = __importDefault(require("../models/Hospital"));
// @desc    Get all hospitals
// @route   GET /api/hospitals
// @access  Public
const getHospitals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { city } = req.query;
        let query = {};
        if (city) {
            query.city = { $regex: city, $options: 'i' };
        }
        const hospitals = yield Hospital_1.default.find(query);
        res.json(hospitals);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getHospitals = getHospitals;
// @desc    Get single hospital
// @route   GET /api/hospitals/:id
// @access  Public
const getHospitalById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = yield Hospital_1.default.findById(req.params.id);
        if (hospital) {
            res.json(hospital);
        }
        else {
            res.status(404).json({ message: 'Hospital not found' });
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getHospitalById = getHospitalById;
// @desc    Seed hospitals (Temporary for data population)
// @route   POST /api/hospitals/seed
// @access  Public (Should be private in prod)
const seedHospitals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield Hospital_1.default.deleteMany({});
        const placeholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" fill="%236b7280" font-size="24" text-anchor="middle" dominant-baseline="middle" font-family="Arial">Image unavailable</text></svg>';
        const hospitals = [
            {
                name: "City General Hospital",
                address: "123 Medical Drive, Downtown",
                city: "New York",
                image: placeholder,
                isOpen24Hours: true,
                consultationFee: 500,
                governmentSchemes: ["Ayushman Bharat", "CGHS"],
                isOnlinePaymentAvailable: true,
                ambulanceContact: "+91 911-123-4567",
                description: "A premier multi-specialty hospital providing world-class healthcare services.",
                rating: 4.5
            },
            {
                name: "Sunshine Care Center",
                address: "45 Green Avenue, Westside",
                city: "New York",
                image: placeholder,
                isOpen24Hours: true,
                consultationFee: 800,
                governmentSchemes: ["ECHS"],
                isOnlinePaymentAvailable: true,
                ambulanceContact: "+91 911-987-6543",
                description: "Specialized in cardiac and orthopedic care with state-of-the-art facilities.",
                rating: 4.8
            },
            {
                name: "Community Health Hub",
                address: "89 Local Lane, Suburbia",
                city: "New York",
                image: placeholder,
                isOpen24Hours: false,
                consultationFee: 200,
                governmentSchemes: ["Ayushman Bharat", "State Health Scheme"],
                isOnlinePaymentAvailable: false,
                ambulanceContact: "+91 888-888-8888",
                description: "Affordable healthcare for the community with a focus on primary care.",
                rating: 4.0
            }
        ];
        yield Hospital_1.default.insertMany(hospitals);
        res.json({ message: 'Hospitals seeded successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.seedHospitals = seedHospitals;
// @desc    Create hospital (Admin)
// @route   POST /api/hospitals
// @access  Private/Admin
const createHospital = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, address, city, image, images, isOpen24Hours, consultationFee, governmentSchemes, isOnlinePaymentAvailable, ambulanceContact, contactNumber, description, rating } = req.body;
        if (!name || !address || !city || (!image && (!images || images.length === 0)) || !consultationFee) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }
        let imagesArr = [];
        if (Array.isArray(images)) {
            imagesArr = images.filter(Boolean);
        }
        const hospital = yield Hospital_1.default.create({
            name,
            address,
            city,
            image,
            images: imagesArr,
            isOpen24Hours: Boolean(isOpen24Hours),
            consultationFee: Number(consultationFee),
            governmentSchemes: Array.isArray(governmentSchemes)
                ? governmentSchemes
                : typeof governmentSchemes === 'string'
                    ? governmentSchemes.split(',').map((s) => s.trim()).filter(Boolean)
                    : [],
            isOnlinePaymentAvailable: Boolean(isOnlinePaymentAvailable),
            ambulanceContact,
            contactNumber,
            description: description || '',
            rating: rating ? Number(rating) : 0
        });
        res.status(201).json(hospital);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
});
exports.createHospital = createHospital;
// @desc    Update hospital (Admin)
// @route   PUT /api/hospitals/:id
// @access  Private/Admin
const updateHospital = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const updateData = Object.assign({}, req.body);
        if (updateData.consultationFee !== undefined) {
            updateData.consultationFee = Number(updateData.consultationFee);
        }
        if (updateData.isOpen24Hours !== undefined) {
            updateData.isOpen24Hours = Boolean(updateData.isOpen24Hours);
        }
        if (updateData.isOnlinePaymentAvailable !== undefined) {
            updateData.isOnlinePaymentAvailable = Boolean(updateData.isOnlinePaymentAvailable);
        }
        if (updateData.governmentSchemes && typeof updateData.governmentSchemes === 'string') {
            updateData.governmentSchemes = updateData.governmentSchemes.split(',').map((s) => s.trim()).filter(Boolean);
        }
        if (updateData.images && typeof updateData.images === 'string') {
            updateData.images = updateData.images.split(',').map((s) => s.trim()).filter(Boolean);
        }
        const hospital = yield Hospital_1.default.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        res.json(hospital);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
});
exports.updateHospital = updateHospital;
// @desc    Delete hospital (Admin)
// @route   DELETE /api/hospitals/:id
// @access  Private/Admin
const deleteHospital = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = yield Hospital_1.default.findByIdAndDelete(req.params.id);
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        res.json({ message: 'Hospital deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
});
exports.deleteHospital = deleteHospital;
// @desc    Upload hospital images
// @route   POST /api/hospitals/upload-images
// @access  Private/Admin
const uploadHospitalImages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            res.status(400).json({ message: 'No files uploaded' });
            return;
        }
        const urls = files.map((f) => `/uploads/hospitals/${f.filename}`);
        res.json({ urls });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
});
exports.uploadHospitalImages = uploadHospitalImages;
// @desc    Search hospitals (Autocomplete)
// @route   GET /api/hospitals/search?q=query
// @access  Public
const searchHospitals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            res.json([]);
            return;
        }
        const hospitals = yield Hospital_1.default.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { city: { $regex: q, $options: 'i' } },
                { address: { $regex: q, $options: 'i' } }
            ]
        })
            .select('name city address image images rating')
            .limit(5);
        res.json(hospitals);
    }
    catch (error) {
        res.status(500).json({ message: 'Error searching hospitals', error });
    }
});
exports.searchHospitals = searchHospitals;
