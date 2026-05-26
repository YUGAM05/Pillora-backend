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
const Donor_1 = __importDefault(require("../models/Donor"));
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
        const cityVal = request.city || '';
        const areaVal = request.area || '';
        const bloodGroupVal = request.bloodGroup;
        // Search donors matching blood group AND city AND area
        let donors = yield Donor_1.default.find({
            bloodGroup: bloodGroupVal,
            city: { $regex: cityVal, $options: 'i' },
            area: { $regex: areaVal, $options: 'i' },
            isAvailable: true
        });
        // If no exact area match found search by city and blood group only
        if (donors.length === 0) {
            donors = yield Donor_1.default.find({
                bloodGroup: bloodGroupVal,
                city: { $regex: cityVal, $options: 'i' },
                isAvailable: true
            });
        }
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
                    name: d.name || d.donor_name || 'Anonymous',
                    bloodGroup: d.bloodGroup || d.blood_group || bloodGroupVal,
                    phone: d.phone || d.donor_phone || 'N/A',
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
