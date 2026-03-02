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
exports.verifyRequestWithAI = exports.deleteDonor = exports.updateRequestStatus = exports.getAllRequestsAdmin = exports.getAllDonors = exports.getRequests = exports.getMyDonorProfile = exports.getMyRequests = exports.createRequest = exports.findMatches = exports.findDonors = exports.registerDonor = void 0;
const BloodDonor_1 = __importDefault(require("../models/BloodDonor"));
const Donor_1 = __importDefault(require("../models/Donor"));
const BloodRequest_1 = __importDefault(require("../models/BloodRequest"));
const bloodCompatibility_1 = require("../utils/bloodCompatibility");
const whatsappService_1 = require("../utils/whatsappService");
const aadhaarVerifier_1 = require("../utils/aadhaarVerifier");
// @desc    Register as a blood donor
// @route   POST /api/blood-bank/donors
// @access  Private
const registerDonor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { bloodGroup, location, age, phone, address, gender, area, city, name } = req.body;
        const ageNum = Number(age);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 60) {
            res.status(400).json({ message: 'Age must be between 18 and 60 to donate blood.' });
            return;
        }
        // Check if already registered by user ID
        const existingDonorByUser = yield BloodDonor_1.default.findOne({ user: req.user.id });
        if (existingDonorByUser) {
            res.status(400).json({ message: 'You are already registered as a donor' });
            return;
        }
        // Check if phone number already exists
        const existingDonorByPhone = yield BloodDonor_1.default.findOne({ phone });
        if (existingDonorByPhone) {
            res.status(400).json({ message: 'This phone number is already registered' });
            return;
        }
        const donor = yield BloodDonor_1.default.create({
            user: req.user.id,
            name,
            bloodGroup,
            gender,
            age,
            phone,
            address,
            area,
            city,
            source: 'user_panel',
            location: {
                type: 'Point',
                coordinates: location // [longitude, latitude]
            }
        });
        res.status(201).json(donor);
    }
    catch (error) {
        console.error("Blood Bank Registration Error:", error);
        if (error.code === 11000) {
            // Duplicate key error
            if ((_a = error.keyPattern) === null || _a === void 0 ? void 0 : _a.phone) {
                res.status(400).json({ message: 'This phone number is already registered' });
            }
            else if ((_b = error.keyPattern) === null || _b === void 0 ? void 0 : _b.user) {
                res.status(400).json({ message: 'You are already registered as a donor' });
            }
            else {
                res.status(400).json({ message: 'Duplicate entry detected' });
            }
            return;
        }
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
});
exports.registerDonor = registerDonor;
// @desc    Find donors by blood group and location (optional)
// @route   GET /api/blood-bank/donors
// @access  Public
const findDonors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { bloodGroup, lng, lat, distance } = req.query;
        let query = { isAvailable: true };
        if (bloodGroup) {
            query.bloodGroup = bloodGroup;
        }
        if (lng && lat) {
            query.location = {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: distance ? parseInt(distance) : 50000 // default 50km
                }
            };
        }
        const donors = yield BloodDonor_1.default.find(query).populate('user', 'name email phone');
        res.json(donors);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.findDonors = findDonors;
// @desc    Find compatible donors for a specific blood requirement
// @route   GET /api/blood-bank/matches
// @access  Public
const findMatches = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { bloodGroup, city, area } = req.query;
        if (!bloodGroup) {
            res.status(400).json({ message: 'Blood group is required' });
            return;
        }
        // Get all compatible blood groups
        const compatibleGroups = (0, bloodCompatibility_1.getCompatibleDonors)(bloodGroup);
        let query = {
            bloodGroup: { $in: compatibleGroups },
            isAvailable: true
        };
        // Filter by city if provided
        if (city) {
            query.city = new RegExp(city, 'i');
        }
        // Filter by area if provided
        if (area) {
            query.area = new RegExp(area, 'i');
        }
        // Find matches in both BloodDonor (old) and Donor (new) models
        const [donors1, donors2] = yield Promise.all([
            BloodDonor_1.default.find(query).populate('user', 'name email phone').sort({ lastDonationDate: 1 }),
            Donor_1.default.find({
                blood_group: { $in: compatibleGroups },
                city: query.city,
                area: query.area
            }).sort({ lastDonationDate: 1 })
        ]);
        // Merge and remove duplicates if any (based on phone/donor_phone)
        const allDonors = [
            ...donors1.map(d => ({ name: d.name, phone: d.phone, bloodGroup: d.bloodGroup })),
            ...donors2.map((d) => ({ name: d.donor_name, phone: d.donor_phone, bloodGroup: d.blood_group }))
        ];
        const uniqueDonors = Array.from(new Map(allDonors.map(d => [d.phone, d])).values());
        res.json(uniqueDonors);
    }
    catch (error) {
        console.error("Match Finding Error:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
exports.findMatches = findMatches;
// @desc    Create a blood request
// @route   POST /api/blood-bank/requests
// @access  Private
const createRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { patientName, age, bloodGroup, units, hospitalAddress, area, city, contactNumber, isUrgent, kycDocumentType, kycDocumentId, kycDocumentImage } = req.body;
        console.log(`[BloodRequest] Incoming request from ${req.user.id} for ${bloodGroup} in ${city}. KYC: ${kycDocumentType}`);
        const request = yield BloodRequest_1.default.create({
            user: req.user.id,
            patientName,
            age,
            bloodGroup,
            units,
            hospitalAddress,
            area,
            city,
            contactNumber,
            status: isUrgent ? 'Urgent' : 'Open',
            isUrgent,
            kycDocumentType,
            kycDocumentId,
            kycDocumentImage
        });
        // Trigger Matching & Notification Logic
        try {
            const compatibleGroups = (0, bloodCompatibility_1.getCompatibleDonors)(bloodGroup);
            console.log(`[BloodMatch] Finding donors for: ${bloodGroup} in ${city}, ${area}. Compatible groups: ${compatibleGroups}`);
            // Search for donors in the specific city/area across both models
            const [donors1, donors2] = yield Promise.all([
                Donor_1.default.find({
                    blood_group: { $in: compatibleGroups },
                    city: new RegExp(city, 'i'),
                    area: new RegExp(area, 'i'),
                    // isAvailable: true // Not in the schema provided by user, but let's assume availability isn't tracked in the simple schema
                }).limit(5),
                BloodDonor_1.default.find({
                    bloodGroup: { $in: compatibleGroups },
                    city: new RegExp(city, 'i'),
                    area: new RegExp(area, 'i'),
                    isAvailable: true
                }).limit(5)
            ]);
            console.log(`[BloodMatch] Found ${donors1.length} in Donor table and ${donors2.length} in BloodDonor table`);
            const allMatchedDonors = [
                ...donors1.map((d) => ({ name: d.donor_name, phone: d.donor_phone })),
                ...donors2.map(d => ({ name: d.name, phone: d.phone }))
            ];
            const matchedDonors = Array.from(new Map(allMatchedDonors.map(d => [d.phone, d])).values()).slice(0, 5);
            console.log(`[BloodMatch] Unique matched donors: ${matchedDonors.length}`);
            if (matchedDonors.length > 0) {
                // Get requester's phone
                const requesterPhone = contactNumber;
                console.log(`[BloodMatch] Notifying requester at: ${requesterPhone}`);
                let messageBody = `🚨 Apex Care Blood Match Found! 🚨\n\nFor your request (${bloodGroup} at ${hospitalAddress}), we found compatible donors:\n\n`;
                matchedDonors.forEach(donor => {
                    messageBody += `👤 ${donor.name}\n📞 ${donor.phone}\n\n`;
                });
                messageBody += `Please contact them immediately. Stay Safe!`;
                // Send WhatsApp to requester
                yield (0, whatsappService_1.sendWhatsAppMessage)(requesterPhone, messageBody);
                console.log(`[BloodMatch] WhatsApp trigger called for ${requesterPhone}`);
            }
            else {
                console.log(`[BloodMatch] No donors matched the criteria.`);
            }
        }
        catch (matchErr) {
            console.error("Auto-matching/Notification error:", matchErr);
            // Don't fail the request creation if notification fails
        }
        // Send response immediately
        res.status(201).json(request);
        // Run AI Verification automatically in background
        if (kycDocumentImage && kycDocumentType === 'Aadhar Card') {
            (() => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    console.log(`[AutoAI] Starting background verification for request ${request._id}`);
                    const result = yield (0, aadhaarVerifier_1.verifyAadhaarLocal)(kycDocumentImage, patientName);
                    request.aiVerificationStatus = result.status;
                    request.aiVerificationRemarks = result.remarks;
                    yield request.save();
                    console.log(`[AutoAI] background verification complete for ${request._id}: ${result.status}`);
                }
                catch (aiErr) {
                    console.error(`[AutoAI] background verification failed for ${request._id}:`, aiErr);
                }
            }))();
        }
    }
    catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ message: error.message || 'Server Error', error });
        }
        else {
            console.error("Error after response sent:", error);
        }
    }
});
exports.createRequest = createRequest;
// @desc    Get current user's blood requests
// @route   GET /api/blood-bank/my-requests
// @access  Private
const getMyRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requests = yield BloodRequest_1.default.find({ user: req.user.id })
            .sort({ createdAt: -1 });
        res.json(requests);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getMyRequests = getMyRequests;
// @desc    Get current user's donor profile
// @route   GET /api/blood-bank/my-donor
// @access  Private
const getMyDonorProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const donor = yield BloodDonor_1.default.findOne({ user: req.user.id });
        if (!donor) {
            res.status(404).json({ message: 'Donor profile not found' });
            return;
        }
        res.json(donor);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getMyDonorProfile = getMyDonorProfile;
// @desc    Get all blood requests
// @route   GET /api/blood-bank/requests
// @access  Public
const getRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requests = yield BloodRequest_1.default.find({ status: { $ne: 'Closed' } })
            .sort({ isUrgent: -1, createdAt: -1 }) // Urgent first
            .populate('user', 'name');
        res.json(requests);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getRequests = getRequests;
// @desc    Get all donors (Admin)
// @route   GET /api/blood-bank/admin/donors
// @access  Private/Admin
const getAllDonors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const donors = yield BloodDonor_1.default.find({}).sort({ createdAt: -1 }).populate('user', 'name email');
        res.json(donors);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getAllDonors = getAllDonors;
// @desc    Get all requests (Admin)
// @route   GET /api/blood-bank/admin/requests
// @access  Private/Admin
const getAllRequestsAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requests = yield BloodRequest_1.default.find({}).sort({ createdAt: -1 }).populate('user', 'name email');
        res.json(requests);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.getAllRequestsAdmin = getAllRequestsAdmin;
// @desc    Update blood request status
// @route   PATCH /api/blood-bank/admin/requests/:id/status
// @access  Private/Admin
const updateRequestStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status } = req.body;
        const request = yield BloodRequest_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }
        res.json(request);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.updateRequestStatus = updateRequestStatus;
// @desc    Delete a donor
// @route   DELETE /api/blood-bank/admin/donors/:id
// @access  Private/Admin
const deleteDonor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const donor = yield BloodDonor_1.default.findByIdAndDelete(req.params.id);
        if (!donor) {
            res.status(404).json({ message: 'Donor not found' });
            return;
        }
        res.json({ message: 'Donor removed successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.deleteDonor = deleteDonor;
// @desc    Verify blood request KYC with Local AI Agent
// @route   POST /api/blood-bank/admin/requests/:id/verify-ai
// @access  Private/Admin
const verifyRequestWithAI = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        console.log(`[Controller] AI Verification requested for ID: ${id}`);
        const request = yield BloodRequest_1.default.findById(id);
        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }
        if (!request.kycDocumentImage) {
            res.status(400).json({ message: 'No KYC image found for this request' });
            return;
        }
        // Prepare image data (Tesseract can handle base64 data URLs)
        const imageContent = request.kycDocumentImage;
        const patientName = request.patientName;
        const result = yield (0, aadhaarVerifier_1.verifyAadhaarLocal)(imageContent, patientName);
        console.log(`[Controller] Agent Result for ID ${id}:`, result);
        request.aiVerificationStatus = result.status;
        request.aiVerificationRemarks = result.remarks;
        console.log(`[Controller] Saving request with status: ${request.aiVerificationStatus}...`);
        const savedRequest = yield request.save();
        console.log(`[Controller] Request saved successfully. New status: ${savedRequest.aiVerificationStatus}`);
        res.json(savedRequest);
    }
    catch (error) {
        console.error("Agent Verification Error:", error);
        res.status(500).json({ message: 'Agent Verification Failed', error: error.message });
    }
});
exports.verifyRequestWithAI = verifyRequestWithAI;
