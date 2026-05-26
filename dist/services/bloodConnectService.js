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
exports.processKYCResult = exports.searchAndNotifyDonors = void 0;
const BloodRequest_1 = __importDefault(require("../models/BloodRequest"));
const BloodDonor_1 = __importDefault(require("../models/BloodDonor"));
const emailService_1 = require("./emailService");
/**
 * Searches for matching blood donors and notifies the requester.
 * First queries by bloodGroup + city + area. If no match is found, fallback to city + bloodGroup.
 */
const searchAndNotifyDonors = (requestId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const request = yield BloodRequest_1.default.findById(requestId);
        if (!request) {
            console.error(`[searchAndNotifyDonors] BloodRequest not found for ID: ${requestId}`);
            return;
        }
        console.log('=== DONOR SEARCH START ===');
        console.log('Request ID:', requestId);
        console.log('Request blood group:', request.bloodGroup);
        console.log('Request city:', request.city);
        console.log('Request area:', request.area);
        // First check how many total donors exist
        const totalDonors = yield BloodDonor_1.default.countDocuments();
        console.log('Total donors in DB:', totalDonors);
        // Check all donors regardless of filters
        const allDonors = yield BloodDonor_1.default.find({});
        console.log('All donors:', JSON.stringify(allDonors.map(d => ({
            name: d.name,
            bloodGroup: d.bloodGroup,
            city: d.city,
            area: d.area,
            isAvailable: d.isAvailable
        })), null, 2));
        // Fix 4 — Check the exact field names in the Donor schema
        const firstDonor = yield BloodDonor_1.default.findOne({});
        if (firstDonor) {
            console.log('Donor document keys:', Object.keys(firstDonor.toObject()));
            console.log('Full donor document:', firstDonor.toObject());
        }
        else {
            console.log('No donor document in DB to extract keys from.');
        }
        // Fix 5 — Check the exact field names in the BloodRequest schema
        console.log('Request document keys:', Object.keys(request.toObject()));
        console.log('Full request document:', request.toObject());
        const cityVal = (request.city || '').trim();
        const areaVal = (request.area || '').trim();
        const bloodGroupVal = (request.bloodGroup || '').trim();
        const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const escapedBloodGroup = escapeRegex(bloodGroupVal);
        const escapedCity = escapeRegex(cityVal);
        const escapedArea = escapeRegex(areaVal);
        // Now search with filters
        // Fix 2 & 3: Use case-insensitive regex for bloodGroup, trim fields, and check isAvailable condition
        let donors = yield BloodDonor_1.default.find({
            bloodGroup: { $regex: `^${escapedBloodGroup}$`, $options: 'i' },
            city: { $regex: escapedCity, $options: 'i' },
            area: { $regex: escapedArea, $options: 'i' },
            $or: [
                { isAvailable: true },
                { isAvailable: { $exists: false } },
                { isAvailable: null }
            ]
        });
        console.log('Matching donors found (strict city + area):', donors.length);
        // If no exact area match found search by city and blood group only
        if (donors.length === 0) {
            console.log('No exact area match. Falling back to city + blood group search...');
            donors = yield BloodDonor_1.default.find({
                bloodGroup: { $regex: `^${escapedBloodGroup}$`, $options: 'i' },
                city: { $regex: escapedCity, $options: 'i' },
                $or: [
                    { isAvailable: true },
                    { isAvailable: { $exists: false } },
                    { isAvailable: null }
                ]
            });
            console.log('Matching donors found (city fallback):', donors.length);
        }
        console.log('=== DONOR SEARCH END ===');
        const emailToUse = request.email || '';
        if (donors.length === 0) {
            // NO DONORS FOUND
            yield request.updateOne({ status: 'no_donor_found' });
            if (emailToUse) {
                yield (0, emailService_1.sendNoDonorFoundEmail)({
                    toEmail: emailToUse,
                    patientName: request.patientName,
                    bloodGroup: bloodGroupVal,
                    city: cityVal,
                    area: areaVal
                });
            }
            else {
                console.log(`[searchAndNotifyDonors] No donor found, but no email address on file for request ${requestId}`);
            }
            return;
        }
        // DONORS FOUND — send email with donor details
        yield request.updateOne({ status: 'matched' });
        if (emailToUse) {
            yield (0, emailService_1.sendDonorFoundEmail)({
                toEmail: emailToUse,
                patientName: request.patientName,
                bloodGroup: bloodGroupVal,
                unitsNeeded: request.unitsNeeded || request.units || 1,
                donors: donors.map((d) => ({
                    name: d.name || 'Anonymous',
                    bloodGroup: d.bloodGroup || bloodGroupVal,
                    phone: d.phone || 'N/A',
                    area: d.area || '',
                    city: d.city || ''
                }))
            });
        }
        else {
            console.log(`[searchAndNotifyDonors] Matched ${donors.length} donors, but no email address on file for request ${requestId}`);
        }
    }
    catch (error) {
        console.error('[searchAndNotifyDonors] Error searching or notifying donors:', error);
    }
});
exports.searchAndNotifyDonors = searchAndNotifyDonors;
/**
 * Main entry point triggered when KYC verification completes.
 * Updates KYC status and kicks off donor search notifications if successful.
 */
const processKYCResult = (requestId, kycPassed) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const bloodRequest = yield BloodRequest_1.default.findById(requestId);
        if (!bloodRequest) {
            console.error(`[processKYCResult] BloodRequest not found for ID: ${requestId}`);
            return;
        }
        if (!kycPassed) {
            // KYC FAILED — send failure email and stop
            yield bloodRequest.updateOne({ kycStatus: 'failed' });
            const emailToUse = bloodRequest.email;
            if (emailToUse) {
                yield (0, emailService_1.sendKYCFailedEmail)({
                    toEmail: emailToUse,
                    patientName: bloodRequest.patientName
                });
            }
            else {
                console.log(`[processKYCResult] KYC failed, but no email address on file for request ${requestId}`);
            }
            return;
        }
        // KYC PASSED — update status and search for donors
        yield bloodRequest.updateOne({ kycStatus: 'verified', kycVerifiedAt: new Date() });
        yield (0, exports.searchAndNotifyDonors)(requestId);
    }
    catch (error) {
        console.error('[processKYCResult] Error processing KYC result:', error);
    }
});
exports.processKYCResult = processKYCResult;
