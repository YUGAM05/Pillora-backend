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
exports.deleteMyRequest = exports.updateKycStatus = exports.verifyRequestWithAI = exports.deleteRequest = exports.deleteDonor = exports.updateRequestStatus = exports.getAllRequestsAdmin = exports.getAllDonors = exports.getRequests = exports.getMyDonorProfile = exports.getMyRequests = exports.createRequest = exports.findMatches = exports.findDonors = exports.registerDonor = void 0;
const BloodDonor_1 = __importDefault(require("../models/BloodDonor"));
const BloodRequest_1 = __importDefault(require("../models/BloodRequest"));
const bloodCompatibility_1 = require("../utils/bloodCompatibility");
const whatsappService_1 = require("../utils/whatsappService");
const aadhaarVerifier_1 = require("../utils/aadhaarVerifier");
const activityLogger_1 = require("../utils/activityLogger");
const bloodConnectService_1 = require("../services/bloodConnectService");
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
        // Check if phone number already used by a DIFFERENT user
        const existingDonorByPhone = yield BloodDonor_1.default.findOne({ phone, user: { $ne: req.user.id } });
        if (existingDonorByPhone) {
            res.status(400).json({ message: 'This phone number is already registered by another donor' });
            return;
        }
        // Upsert: update existing record by phone or create a new one
        const donor = yield BloodDonor_1.default.findOneAndUpdate({ phone: phone }, {
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
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        res.status(201).json(donor);
        // Log Platform Activity
        const io = req.app.get('io');
        (0, activityLogger_1.logActivity)(io, {
            title: 'New Blood Donor',
            description: `${name || 'A user'} registered as a ${bloodGroup} donor in ${area}, ${city}.`,
            type: 'blood_donor'
        });
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
        // Find matches in unified BloodDonor model
        const donors = yield BloodDonor_1.default.find(query).populate('user', 'name email phone').sort({ lastDonationDate: 1 });
        // Map and remove duplicates if any (based on phone)
        const allDonors = donors.map(d => ({ name: d.name, phone: d.phone, bloodGroup: d.bloodGroup }));
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
    var _a;
    try {
        const { patientName, age, bloodGroup, units, hospitalAddress, area, city, contactNumber, isUrgent, kycDocumentType, kycDocumentId, kycDocumentImage, email, unitsNeeded, coordinationNumber } = req.body;
        let finalKycDocumentId = kycDocumentId;
        let aiStatus = 'Pending';
        let aiRemarks = '';
        // Perform Fast Extract & Validate synchronously instantly natively
        if (kycDocumentType === 'Aadhar Card') {
            if (!kycDocumentId || kycDocumentId.trim() === '') {
                aiStatus = 'Rejected';
                aiRemarks = 'Aadhaar Document Number is mandatory';
            }
            else {
                const cleanNum = kycDocumentId.replace(/\s/g, '');
                if (cleanNum.length === 12 && (0, aadhaarVerifier_1.validateVerhoeff)(cleanNum)) {
                    aiStatus = 'Verified';
                    aiRemarks = 'Verified via fast mathematical pattern matching';
                    finalKycDocumentId = `**** **** **${cleanNum.slice(-2)}`;
                }
                else {
                    aiStatus = 'Rejected';
                    aiRemarks = 'Fake or Invalid Aadhaar Number';
                }
            }
        }
        else {
            // Manual verification fallback
            aiStatus = 'Verified';
            aiRemarks = 'Verified via manual details';
        }
        // 1. Instant Save: Create the request with exact verify status
        const request = yield BloodRequest_1.default.create({
            user: req.user.id,
            patientName, age, bloodGroup, units, hospitalAddress, area, city, contactNumber,
            status: isUrgent ? 'Urgent' : 'Open',
            isUrgent, kycDocumentType,
            kycDocumentId: finalKycDocumentId || 'Processing...',
            kycDocumentImage: kycDocumentImage, // Store image for Admin
            aiVerificationStatus: aiStatus,
            aiVerificationRemarks: aiRemarks,
            email: email || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.email),
            unitsNeeded: unitsNeeded || units,
            coordinationNumber: coordinationNumber || contactNumber
        });
        // 2. Instant Response: Return 201 Created to the frontend
        res.status(201).json(request);
        // Log Platform Activity
        const io = req.app.get('io');
        (0, activityLogger_1.logActivity)(io, {
            title: isUrgent ? 'Urgent Blood Request' : 'New Blood Request',
            description: `${patientName} needs ${units} units of ${bloodGroup} at ${hospitalAddress}.`,
            type: 'blood_request'
        });
        // 3. Background Processing: Matching & notifications safe out of flow
        (() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // Call automated KYC processing flow
                const kycPassed = aiStatus === 'Verified';
                yield (0, bloodConnectService_1.processKYCResult)(request._id.toString(), kycPassed);
                // Perform WhatsApp Matching & Notifications if verified
                if (aiStatus === 'Verified') {
                    const compatibleGroups = (0, bloodCompatibility_1.getCompatibleDonors)(bloodGroup);
                    const matchedDonorsRaw = yield BloodDonor_1.default.find({
                        bloodGroup: { $in: compatibleGroups },
                        city: new RegExp(city, 'i'),
                        area: new RegExp(area, 'i'),
                        isAvailable: true
                    }).limit(5);
                    const matchedDonors = matchedDonorsRaw.map(d => ({ name: d.name, phone: d.phone }));
                    if (matchedDonors.length > 0) {
                        let messageBody = `🚨 Pillora Blood Match Found! 🚨\n\nFor your request (${bloodGroup} at ${hospitalAddress}), we found compatible donors.\n\nPlease contact them immediately. Stay Safe!`;
                        yield (0, whatsappService_1.sendWhatsAppMessage)(contactNumber, messageBody);
                    }
                }
            }
            catch (bgErr) {
                console.error("[BackgroundMatching] Error occurred:", bgErr);
            }
        }))();
    }
    catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ message: error.message || 'Server Error' });
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
// @desc    Get all donors for admin
// @route   GET /api/blood-bank/admin/donors
// @access  Private/Admin
const getAllDonors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;
        const total = yield BloodDonor_1.default.countDocuments({});
        const donors = yield BloodDonor_1.default.find({})
            .sort({ createdAt: -1 })
            .populate('user', 'name email')
            .skip(skip)
            .limit(limit);
        console.log(`[AdminDonors] Total in DB: ${total}, Returning: ${donors.length}`);
        const standardizedDonors = donors.map(d => {
            var _a;
            return ({
                _id: d._id,
                name: d.name,
                email: d.email || ((_a = d.user) === null || _a === void 0 ? void 0 : _a.email) || 'N/A',
                bloodGroup: d.bloodGroup,
                age: d.age,
                gender: d.gender,
                phone: d.phone,
                city: d.city,
                area: d.area,
                address: d.address,
                isAvailable: d.isAvailable,
                source: d.source || 'user_panel',
                createdAt: d.createdAt
            });
        });
        res.status(200).json({
            donors: standardizedDonors,
            pagination: {
                total,
                page,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        console.error('Error fetching donors for admin:', error);
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
        const { id } = req.params;
        const donor = yield BloodDonor_1.default.findByIdAndDelete(id);
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
// @desc    Delete a request
// @route   DELETE /api/blood-bank/admin/requests/:id
// @access  Private/Admin
const deleteRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        console.log(`[BloodBankController] DELETE request received for ID: ${id}`);
        const request = yield BloodRequest_1.default.findByIdAndDelete(id);
        if (!request) {
            console.warn(`[BloodBankController] Request with ID ${id} NOT found for deletion.`);
            res.status(404).json({ message: 'Request document not found in database (404)' });
            return;
        }
        console.log(`[BloodBankController] Successfully deleted request ID: ${id}`);
        res.json({ message: 'Request removed successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.deleteRequest = deleteRequest;
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
        if (result.aadhaarNumber) {
            const cleanNum = result.aadhaarNumber.replace(/\s/g, '');
            request.kycDocumentId = `**** **** **${cleanNum.slice(-2)}`;
        }
        console.log(`[Controller] Saving request with status: ${request.aiVerificationStatus}...`);
        const savedRequest = yield request.save();
        console.log(`[Controller] Request saved successfully. New status: ${savedRequest.aiVerificationStatus}`);
        // Trigger automated KYC and notification flow
        const kycPassed = savedRequest.aiVerificationStatus === 'Verified';
        (0, bloodConnectService_1.processKYCResult)(savedRequest._id.toString(), kycPassed).catch(err => {
            console.error('[verifyRequestWithAI] Error running processKYCResult:', err);
        });
        res.json(savedRequest);
    }
    catch (error) {
        console.error("Agent Verification Error:", error);
        res.status(500).json({ message: 'Agent Verification Failed', error: error.message });
    }
});
exports.verifyRequestWithAI = verifyRequestWithAI;
// @desc    Update KYC verification status manually (Accept/Reject)
// @route   PATCH /api/blood-bank/admin/requests/:id/kyc
// @access  Private/Admin
const updateKycStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status } = req.body;
        if (!['Verified', 'Rejected'].includes(status)) {
            res.status(400).json({ message: 'Invalid KYC status' });
            return;
        }
        const request = yield BloodRequest_1.default.findByIdAndUpdate(req.params.id, {
            aiVerificationStatus: status,
            aiVerificationRemarks: `Manually ${status.toLowerCase()} by Admin.`
        }, { new: true });
        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }
        // Trigger automated KYC and notification flow
        const kycPassed = status === 'Verified';
        (0, bloodConnectService_1.processKYCResult)(request._id.toString(), kycPassed).catch(err => {
            console.error('[updateKycStatus] Error running processKYCResult:', err);
        });
        res.json(request);
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.updateKycStatus = updateKycStatus;
// @desc    Delete user's own request
// @route   DELETE /api/blood-bank/requests/:id
// @access  Private
const deleteMyRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const request = yield BloodRequest_1.default.findById(id);
        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }
        // Verify ownership
        if (request.user.toString() !== req.user.id) {
            res.status(401).json({ message: 'User not authorized to delete this request' });
            return;
        }
        yield request.deleteOne();
        res.json({ message: 'Request deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Server Error' });
    }
});
exports.deleteMyRequest = deleteMyRequest;
