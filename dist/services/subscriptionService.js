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
exports.computeSubscriptionStatus = computeSubscriptionStatus;
exports.recordHospitalPayment = recordHospitalPayment;
exports.getSubscriptionSummary = getSubscriptionSummary;
const mongoose_1 = __importDefault(require("mongoose"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const HospitalSubscriptionPayment_1 = __importDefault(require("../models/HospitalSubscriptionPayment"));
const Notification_1 = __importDefault(require("../models/Notification"));
/**
 * Computes live subscription status based on current time and stored expiry dates.
 * Enforces server-side boundary rules without trusting stale statuses.
 */
function computeSubscriptionStatus(hospital) {
    const paymentStatus = hospital.paymentStatus === 'Paid' ? 'Paid' : 'Pending';
    const subscriptionStartDate = hospital.subscriptionStartDate ? new Date(hospital.subscriptionStartDate) : null;
    const subscriptionExpiryDate = hospital.subscriptionExpiryDate ? new Date(hospital.subscriptionExpiryDate) : null;
    const joiningDate = hospital.joiningDate ? new Date(hospital.joiningDate) : (hospital.createdAt ? new Date(hospital.createdAt) : null);
    const lastPaymentDate = hospital.lastPaymentDate ? new Date(hospital.lastPaymentDate) : null;
    // Case D / Initial: Payment not confirmed or dates missing
    if (paymentStatus !== 'Paid' || !subscriptionStartDate || !subscriptionExpiryDate) {
        return {
            status: 'Pending',
            daysRemaining: 0,
            isValid: false,
            canGenerateSlots: false,
            subscriptionStartDate,
            subscriptionExpiryDate,
            joiningDate,
            lastPaymentDate,
            paymentStatus: 'Pending'
        };
    }
    const now = Date.now();
    const expiryTime = subscriptionExpiryDate.getTime();
    const diffMs = expiryTime - now;
    // Expired: Current time has passed expiry date
    if (diffMs <= 0) {
        return {
            status: 'Expired',
            daysRemaining: 0,
            isValid: false,
            canGenerateSlots: false,
            subscriptionStartDate,
            subscriptionExpiryDate,
            joiningDate,
            lastPaymentDate,
            paymentStatus
        };
    }
    // Days remaining (rounded up to count partial days)
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    // Expiring soon: 5 days or fewer remaining
    if (daysRemaining <= 5) {
        return {
            status: 'Expiring Soon',
            daysRemaining,
            isValid: true,
            canGenerateSlots: true,
            subscriptionStartDate,
            subscriptionExpiryDate,
            joiningDate,
            lastPaymentDate,
            paymentStatus
        };
    }
    // Active
    return {
        status: 'Active',
        daysRemaining,
        isValid: true,
        canGenerateSlots: true,
        subscriptionStartDate,
        subscriptionExpiryDate,
        joiningDate,
        lastPaymentDate,
        paymentStatus
    };
}
/**
 * Records a hospital payment, automatically calculates 30-day cycle, and extends/renews.
 * Rules:
 *  - Case A (Initial): Start = paymentDate, Expiry = paymentDate + 30 days
 *  - Case B (Renewal before expiry): Preserve remaining days, Expiry = existingExpiry + 30 days
 *  - Case C (Renewal after expiry): Fresh cycle, Start = paymentDate, Expiry = paymentDate + 30 days
 */
function recordHospitalPayment(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { hospitalId, paymentDate = new Date(), amount, paymentMethod = 'UPI', transactionReference = '', adminNotes = '', recordedBy } = params;
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            throw new Error('Hospital not found');
        }
        const paymentDateObj = new Date(paymentDate);
        if (isNaN(paymentDateObj.getTime())) {
            throw new Error('Invalid payment date provided');
        }
        const now = Date.now();
        let startDate;
        let expiryDate;
        let paymentType;
        const existingExpiry = hospital.subscriptionExpiryDate ? new Date(hospital.subscriptionExpiryDate) : null;
        const isCurrentlyActive = existingExpiry && existingExpiry.getTime() > now && hospital.paymentStatus === 'Paid';
        if (isCurrentlyActive && existingExpiry) {
            // Case B: Renewal Before Expiry — extend from existing expiry, preserve remaining days
            startDate = hospital.subscriptionStartDate ? new Date(hospital.subscriptionStartDate) : paymentDateObj;
            expiryDate = new Date(existingExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
            paymentType = 'renewal';
        }
        else if (existingExpiry && existingExpiry.getTime() <= now) {
            // Case C: Renewal After Expiry — start fresh 30-day cycle from confirmed payment date
            startDate = new Date(paymentDateObj);
            expiryDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
            paymentType = 'renewal';
        }
        else {
            // Case A: Initial Payment
            startDate = new Date(paymentDateObj);
            expiryDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
            paymentType = 'initial';
        }
        // 1. Store payment history transaction (never overwrite previous transactions)
        const paymentRecord = yield HospitalSubscriptionPayment_1.default.create({
            hospital: hospital._id,
            paymentDate: paymentDateObj,
            amount: Number(amount) || 0,
            paymentMethod,
            transactionReference: transactionReference.trim(),
            adminNotes: adminNotes.trim(),
            subscriptionStartDate: startDate,
            subscriptionExpiryDate: expiryDate,
            recordedBy: recordedBy ? new mongoose_1.default.Types.ObjectId(recordedBy) : undefined,
            paymentType
        });
        // 2. Update Hospital master record
        hospital.paymentStatus = 'Paid';
        hospital.subscriptionStatus = 'Active';
        hospital.lastPaymentDate = paymentDateObj;
        hospital.subscriptionStartDate = startDate;
        hospital.subscriptionExpiryDate = expiryDate;
        hospital.lastPaymentAmount = Number(amount) || 0;
        hospital.lastPaymentMethod = paymentMethod;
        hospital.lastPaymentReference = transactionReference.trim();
        if (adminNotes) {
            hospital.adminNotes = adminNotes.trim();
        }
        yield hospital.save();
        // 3. Notify hospital user if account exists
        try {
            if (hospital.user) {
                const formattedExpiry = expiryDate.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
                yield Notification_1.default.create({
                    user: hospital.user,
                    message: `🎉 Your Pillora hospital subscription payment of ₹${amount} has been confirmed. Slot generation privileges are active through ${formattedExpiry}.`,
                    type: 'success',
                    relatedId: paymentRecord._id
                });
            }
        }
        catch (notifErr) {
            console.warn('[subscriptionService] Failed to create notification:', notifErr.message);
        }
        const computed = computeSubscriptionStatus(hospital);
        return {
            hospital,
            paymentRecord,
            computed
        };
    });
}
/**
 * Returns complete subscription summary statistics for the Admin Dashboard.
 */
function getSubscriptionSummary() {
    return __awaiter(this, void 0, void 0, function* () {
        const hospitals = yield Hospital_1.default.find();
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        let activeCount = 0;
        let pendingCount = 0;
        let expiringSoonCount = 0;
        let expiredCount = 0;
        for (const h of hospitals) {
            const comp = computeSubscriptionStatus(h);
            if (comp.status === 'Active')
                activeCount++;
            else if (comp.status === 'Expiring Soon')
                expiringSoonCount++;
            else if (comp.status === 'Expired')
                expiredCount++;
            else
                pendingCount++;
        }
        // Payments received this month from HospitalSubscriptionPayment
        const monthlyPayments = yield HospitalSubscriptionPayment_1.default.find({
            paymentDate: { $gte: startOfMonth }
        });
        const monthlyTotalAmount = monthlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const monthlyPaymentCount = monthlyPayments.length;
        return {
            totalRegisteredHospitals: hospitals.length,
            totalHospitals: hospitals.length,
            activeSubscriptions: activeCount,
            expiringWithin5Days: expiringSoonCount,
            expiredSubscriptions: expiredCount,
            pendingPayments: pendingCount,
            paymentsReceivedThisMonth: monthlyTotalAmount,
            paymentsThisMonth: {
                count: monthlyPaymentCount,
                totalAmount: monthlyTotalAmount
            }
        };
    });
}
