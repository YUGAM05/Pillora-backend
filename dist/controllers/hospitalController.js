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
const Doctor_1 = __importDefault(require("../models/Doctor")); // ✅ Added
const cloudinary_1 = require("cloudinary"); // ✅ Added
const slugify_1 = __importDefault(require("slugify"));
const mongoose_1 = __importDefault(require("mongoose"));
const activityLogger_1 = require("../utils/activityLogger");
// ✅ Cloudinary config
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
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
        const { id } = req.params;
        const querySlug = req.query.slug;
        const queryId = req.query.id;
        let hospital;
        if (querySlug) {
            hospital = yield Hospital_1.default.findOne({ slug: querySlug });
        }
        else if (queryId) {
            hospital = yield Hospital_1.default.findById(queryId);
        }
        else if (id) {
            if (mongoose_1.default.isValidObjectId(id)) {
                hospital = yield Hospital_1.default.findById(id);
            }
            else {
                hospital = yield Hospital_1.default.findOne({ slug: id });
            }
        }
        if (hospital) {
            // Fetch real doctors from Doctor model that are linked to this hospital
            const dbDoctors = yield Doctor_1.default.find({ hospital: hospital._id });
            // Convert Mongoose document to plain object to allow modifying
            const hospitalObj = hospital.toObject();
            // Map the Doctor collection fields to match the structure expected by the frontend
            hospitalObj.doctors = dbDoctors.map(doc => {
                var _a;
                return ({
                    _id: doc._id,
                    name: doc.name,
                    specialization: doc.specialty,
                    fee: doc.fee,
                    daysAvailable: ((_a = doc.availability) === null || _a === void 0 ? void 0 : _a.map(a => a.day)) || [],
                    timing: doc.availability && doc.availability.length > 0
                        ? `${doc.availability[0].startTime} - ${doc.availability[0].endTime}`
                        : 'Flexible timings'
                });
            });
            res.json(hospitalObj);
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
        const seededHospitals = [];
        for (const h of hospitals) {
            let baseSlug = (0, slugify_1.default)(h.name, { lower: true, strict: true, trim: true });
            let currentSlug = baseSlug;
            let counter = 2;
            while (seededHospitals.some((s) => s.slug === currentSlug)) {
                currentSlug = `${baseSlug}-${counter}`;
                counter++;
            }
            seededHospitals.push(Object.assign(Object.assign({}, h), { slug: currentSlug }));
        }
        yield Hospital_1.default.insertMany(seededHospitals);
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
        const { name, address, city, image, images, isOpen24Hours, consultationFee, governmentSchemes, isOnlinePaymentAvailable, ambulanceContact, contactNumber, phoneNumbers, description, rating, doctors } = req.body;
        if (!name || !address || !city || (!image && (!images || images.length === 0)) || !consultationFee) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }
        let imagesArr = [];
        if (Array.isArray(images)) {
            imagesArr = images.filter(Boolean);
        }
        // Build phoneNumbers array (prefer the array, fall back to single contactNumber)
        let phoneNumbersArr = [];
        if (Array.isArray(phoneNumbers)) {
            phoneNumbersArr = phoneNumbers.filter((p) => p && p.trim() !== '');
        }
        else if (typeof phoneNumbers === 'string' && phoneNumbers.trim()) {
            phoneNumbersArr = [phoneNumbers.trim()];
        }
        let baseSlug = (0, slugify_1.default)(name, { lower: true, strict: true, trim: true });
        let currentSlug = baseSlug;
        let counter = 2;
        while (yield Hospital_1.default.findOne({ slug: currentSlug })) {
            currentSlug = `${baseSlug}-${counter}`;
            counter++;
        }
        const hospital = yield Hospital_1.default.create({
            name,
            slug: currentSlug,
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
            phoneNumbers: phoneNumbersArr,
            description: description || '',
            rating: rating ? Number(rating) : 0,
            doctors: Array.isArray(doctors) ? doctors : []
        });
        res.status(201).json(hospital);
        // Log Platform Activity
        const io = req.app.get('io');
        (0, activityLogger_1.logActivity)(io, {
            title: 'New Hospital Registered',
            description: `${name} has been added to the network in ${city}.`,
            type: 'hospital'
        });
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
        // ✅ Upload each file buffer to Cloudinary
        const uploadPromises = files.map((file) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary_1.v2.uploader.upload_stream({ folder: 'hospitals' }, (error, result) => {
                    if (error)
                        reject(error);
                    else
                        resolve(result.secure_url); // ✅ Cloudinary URL
                });
                stream.end(file.buffer); // ✅ Push buffer to Cloudinary
            });
        });
        const urls = yield Promise.all(uploadPromises);
        res.json({ urls }); // ✅ Returns Cloudinary URLs
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
