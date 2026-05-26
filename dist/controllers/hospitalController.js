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
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djlttfqje',
    api_key: process.env.CLOUDINARY_API_KEY || '372769319742221',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'JZ88aoet4iKXegIT19PKqDoL2nU',
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
            const dbDoctors = yield Doctor_1.default.find({ hospital: hospital._id, is_active: { $ne: false } });
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
                        : 'Flexible timings',
                    isSpecialtyGroup: doc.isSpecialtyGroup,
                    department: doc.department,
                    maxAppointmentsPerSlot: doc.maxAppointmentsPerSlot,
                    doctorsCount: doc.doctorsCount,
                    description: doc.description
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
        // Clear both Hospital and Doctor collections for a clean, deterministic seeding state
        yield Hospital_1.default.deleteMany({});
        yield Doctor_1.default.deleteMany({});
        const hospitals = [
            {
                _id: new mongoose_1.default.Types.ObjectId("69e4a708fe1c90e1721baf78"),
                name: "Vrundavan Children Hospital",
                slug: "vrundavan-children-hospital",
                address: "2nd Floor, Ashirwad Avenue,Beside Dipak Petrol Pump, Opp. Kocharab Ashram, Pritamnagar, Ahmedabad",
                city: "Ahmedabad",
                image: "https://res.cloudinary.com/djlttfqje/image/upload/v1776592646/hospitals/smopdu5fgyaivcszsbog.jpg",
                images: [
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776592646/hospitals/smopdu5fgyaivcszsbog.jpg",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776591924/hospitals/mn7byimzu9lnrctxlxje.jpg",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776591924/hospitals/dfmqwsgxrmhutvw8cifq.jpg",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776591924/hospitals/xckxelhbfnt931f9eozt.jpg",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776591924/hospitals/klwhiregoc53wfkkscxt.jpg",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776591924/hospitals/woc17ilxgnq1rmh4r1ib.jpg",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776591924/hospitals/eutvwe5eufldnms7qndn.jpg"
                ],
                isOpen24Hours: false,
                consultationFee: 1000,
                governmentSchemes: [],
                isOnlinePaymentAvailable: true,
                ambulanceContact: "",
                contactNumber: "",
                phoneNumbers: ["94096 54006", "95589 51408"],
                description: "🏥  <b>Vrundavan Children Hospital</b>\n<br><div><b>Hospital Type : </b>Private \n\n<b>Departments &amp; Services</b>\n\n1).🩺 General Pediatrics\n2).💉 Vaccination\n3).🧠 Epilepsy in Children\n4).🦠 Infectious Disease\n5).🫁 Respiratory Disease<div><br></div><div><b>Charges</b></div><div><b>Charges for Old Case :</b> 500\n<b>Charges for New Case :</b> 1000</div><div><br></div><div>Emergency OPD is Available on Sunday </div><div> </div><div><b>Total beds :</b> 19 Beds\n\n<br><div><br></div></div></div>",
                rating: 4.4,
                doctors: [
                    {
                        name: "Dr. Hashmukh D Shah",
                        specialization: "M.D(Gold Medalist)",
                        daysAvailable: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                        timing: "10AM – 1PM"
                    },
                    {
                        name: "Dr. JIgnesh Modi",
                        specialization: "M.D.D.Ped.DNB",
                        daysAvailable: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                        timing: "10AM - 1PM and 5PM- 7.30PM"
                    }
                ],
                management_type: "SELF",
                is_verified: false,
                plan: "Standard",
                is_featured: false,
                has_govt_schemes: false,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                user: new mongoose_1.default.Types.ObjectId("6a06d7b6036cb833da973567")
            },
            {
                _id: new mongoose_1.default.Types.ObjectId("6a0dd6a76d74f8c578796822"),
                name: "Sahaj Clinic ",
                slug: "sahaj-clinic",
                address: " I, Block 240, TITANIUM CITY CENTER BUSINESS PARK, Mall, 100 Feet Anand Nagar Rd, Satellite, Ahmedabad, Gujarat 380015",
                city: "Ahmedabad",
                image: "https://res.cloudinary.com/djlttfqje/image/upload/v1779291416/pillora-seller/bhwjckvornjkfjzdzfp0.webp",
                images: [
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1779291658/pillora-seller/o7ri6k5tjz4dxi3zskbd.webp",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1779291658/pillora-seller/wijvfokghllnwkvnlig1.webp"
                ],
                isOpen24Hours: false,
                consultationFee: 700,
                governmentSchemes: [],
                isOnlinePaymentAvailable: true,
                ambulanceContact: " 63513 53722",
                phoneNumbers: [],
                description: "Sahaj Clinic Description(about their Clinic)\nDaily OPD Timings (Monday – Friday, excluding Wednesday evening alterations)\nMorning: 10:30 AM to 1:00 PM\nEvening: 5:00 PM to 7:30 PM\n\nWednesday \"Corporate Friendly\" Timings\nEvening: 5:00 PM to 8:30 PM (Extended for working professionals)\n\nSaturday Timings:\n   Morning: 10:30 AM to 3:00 PM\n   Evening: Closed (No Saturday evening OPD)\n\nEmergency charges apply for any patient requiring a consultation after 7:45 PM\n\nConsultation Fees & Diagnostic Charges\n(Effective from April 1, 2025)\nNew Case:* ₹700\nOld Case (Follow-up): ₹400 (Valid up to 3 months from the date of the new case registration)\n\nService Charges\nECG 350₹\n2D Echocardiography 2,000₹\nNeuropathy Check-up 800₹",
                rating: 4,
                doctors: [
                    {
                        name: "Dr Dhaivat Desai",
                        specialization: "M.D.MEDICINE",
                        daysAvailable: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                        timing: "10:30 AM to 1:00 PM and 5:00 PM to 7:30 PM"
                    }
                ],
                management_type: "SELF",
                is_verified: true,
                plan: "Standard",
                is_featured: false,
                has_govt_schemes: false,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                user: new mongoose_1.default.Types.ObjectId("6a0dd6a76d74f8c57879681f"),
                tempPassword: "2cce11e57859be5b"
            }
        ];
        // Seed Hospitals
        yield Hospital_1.default.insertMany(hospitals);
        // Seed separate Doctors in Doctor collection
        const doctorsToSeed = [
            {
                _id: new mongoose_1.default.Types.ObjectId("6a0e94371ab452da0a38e301"),
                hospital: new mongoose_1.default.Types.ObjectId("69e4a708fe1c90e1721baf78"), // Vrundavan
                name: "Dr. Hashmukh D Shah",
                specialty: "M.D(Gold Medalist)",
                fee: 1000,
                availability: [
                    { day: 'Monday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Tuesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Wednesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Thursday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Friday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Saturday', startTime: '10:00', endTime: '13:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 1,
                doctorsCount: 1
            },
            {
                _id: new mongoose_1.default.Types.ObjectId("6a0e94371ab452da0a38e302"),
                hospital: new mongoose_1.default.Types.ObjectId("69e4a708fe1c90e1721baf78"), // Vrundavan
                name: "Dr. JIgnesh Modi",
                specialty: "M.D.D.Ped.DNB",
                fee: 1000,
                availability: [
                    { day: 'Monday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Monday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Tuesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Tuesday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Wednesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Wednesday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Thursday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Thursday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Friday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Friday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Saturday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Saturday', startTime: '17:00', endTime: '19:30' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 1,
                doctorsCount: 1
            },
            {
                _id: new mongoose_1.default.Types.ObjectId("6a0e94371ab452da0a38e2f4"),
                hospital: new mongoose_1.default.Types.ObjectId("6a0dd6a76d74f8c578796822"), // Sahaj Clinic
                name: "Dr Dhaivat Desai",
                specialty: "M.D.MEDICINE",
                fee: 700,
                availability: [
                    { day: 'Monday', startTime: '10:30', endTime: '13:00' },
                    { day: 'Monday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Tuesday', startTime: '10:30', endTime: '13:00' },
                    { day: 'Tuesday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Wednesday', startTime: '10:30', endTime: '13:00' },
                    { day: 'Wednesday', startTime: '17:00', endTime: '20:30' },
                    { day: 'Thursday', startTime: '10:30', endTime: '13:00' },
                    { day: 'Thursday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Friday', startTime: '10:30', endTime: '13:00' },
                    { day: 'Friday', startTime: '17:00', endTime: '19:30' },
                    { day: 'Saturday', startTime: '10:30', endTime: '15:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 1,
                doctorsCount: 1
            }
        ];
        yield Doctor_1.default.insertMany(doctorsToSeed);
        res.json({ message: 'Hospitals and Doctors seeded successfully' });
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
