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
exports.disputeSettlementPayment = exports.confirmSettlementPayment = exports.getHospitalSettlementHistory = exports.getHospitalExpectedSettlement = exports.getHospitalSettlementsDashboard = exports.getAdminSettlementAnalytics = exports.getAdminSettlementHistory = exports.initiateManualSettlement = exports.getHospitalBankDetails = exports.updateHospitalBankDetails = exports.getAdminHospitalSettlementDetails = exports.getAdminSettlementsDashboard = void 0;
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Payment_1 = __importDefault(require("../models/Payment"));
const Settlement_1 = __importDefault(require("../models/Settlement"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Notification_1 = __importDefault(require("../models/Notification"));
const User_1 = __importDefault(require("../models/User"));
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
const cryptoHelper_1 = require("../utils/cryptoHelper");
// Helper: Get start and end date based on filter
const getDateRange = (filter, customStart, customEnd) => {
    const now = new Date();
    let start = new Date(0); // Beginning of time
    let end = new Date();
    if (filter === 'today') {
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
    }
    else if (filter === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        start = new Date(yesterday.setHours(0, 0, 0, 0));
        end = new Date(yesterday.setHours(23, 59, 59, 999));
    }
    else if (filter === 'week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Start of week is Monday
        start = new Date(now.setDate(diff));
        start.setHours(0, 0, 0, 0);
        end = new Date();
    }
    else if (filter === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date();
    }
    else if (filter === 'custom' && customStart && customEnd) {
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
    }
    return { start, end };
};
// @desc    Get Admin Settlements Dashboard
// @route   GET /api/settlements/admin/dashboard
// @access  Private/Admin
const getAdminSettlementsDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { dateFilter = 'month', customStart, customEnd, searchQuery } = req.query;
        const { start, end } = getDateRange(String(dateFilter), customStart ? String(customStart) : undefined, customEnd ? String(customEnd) : undefined);
        // Find hospitals
        let query = {};
        if (searchQuery) {
            query.name = { $regex: String(searchQuery), $options: 'i' };
        }
        const hospitals = yield Hospital_1.default.find(query).select('name bedCapacity trialEndDate createdAt user');
        const dashboardData = [];
        for (const hospital of hospitals) {
            // Find bookings/appointments today for this hospital
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);
            const todayBookingsCount = yield Appointment_1.default.countDocuments({
                hospital: hospital._id,
                createdAt: { $gte: startOfToday, $lte: endOfToday }
            });
            // Find all completed online payments for this hospital within the date range
            const payments = yield Payment_1.default.find({
                hospitalId: hospital._id,
                status: 'completed',
                createdAt: { $gte: start, $lte: end }
            });
            let totalAdvanceCollected = 0;
            for (const p of payments) {
                totalAdvanceCollected += (p.advanceFee || p.amount || 0);
            }
            const razorpayProcessingCharges = totalAdvanceCollected * 0.02;
            const gstOnRazorpayCharges = razorpayProcessingCharges * 0.18;
            const netAmountReceived = totalAdvanceCollected - razorpayProcessingCharges - gstOnRazorpayCharges;
            // Pending Settlement Amount: completed payments not yet linked to a completed settlement
            const pendingPayments = yield Payment_1.default.find({
                hospitalId: hospital._id,
                status: 'completed',
                settlementStatus: { $in: ['Waiting for Razorpay Settlement', 'Ready for Settlement'] }
            });
            let pendingSettlementAmount = 0;
            let earliestPendingDate = null;
            for (const p of pendingPayments) {
                const amt = p.advanceFee || p.amount || 0;
                const rz = amt * 0.02;
                const gst = rz * 0.18;
                pendingSettlementAmount += (amt - rz - gst);
                if (!earliestPendingDate || p.createdAt < earliestPendingDate) {
                    earliestPendingDate = p.createdAt;
                }
            }
            // Settlement Eligible Date: earliest pending payment date + 2 days
            let settlementEligibleDate = 'N/A';
            if (earliestPendingDate) {
                const eligible = new Date(earliestPendingDate);
                eligible.setDate(eligible.getDate() + 2); // T+2
                settlementEligibleDate = eligible.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            }
            // Current Settlement Status: Status of the latest settlement or current pending state
            let currentSettlementStatus = 'Ready for Settlement';
            const latestSettlement = yield Settlement_1.default.findOne({ hospitalId: hospital._id }).sort({ createdAt: -1 });
            if (latestSettlement) {
                currentSettlementStatus = latestSettlement.status;
            }
            else if (pendingPayments.length > 0) {
                // If there are pending payments, check if any is older than T+2 days
                const now = new Date();
                const readyPayment = pendingPayments.find(p => {
                    const eligible = new Date(p.createdAt);
                    eligible.setDate(eligible.getDate() + 2);
                    return eligible <= now;
                });
                currentSettlementStatus = readyPayment ? 'Ready for Settlement' : 'Waiting for Razorpay Settlement';
            }
            else {
                currentSettlementStatus = 'Settlement Completed';
            }
            dashboardData.push({
                hospitalId: hospital._id,
                hospitalName: hospital.name,
                todayBookings: todayBookingsCount,
                totalOnlineAdvanceCollected: totalAdvanceCollected,
                razorpayProcessingCharges,
                gstOnRazorpayCharges,
                netAmountReceived,
                pendingSettlementAmount,
                settlementEligibleDate,
                currentSettlementStatus
            });
        }
        res.json({ success: true, dashboardData });
    }
    catch (error) {
        console.error('[GetAdminDashboardError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getAdminSettlementsDashboard = getAdminSettlementsDashboard;
// @desc    Get Hospital Settlement Details (Admin view / Hospital detail page)
// @route   GET /api/settlements/admin/hospital/:hospitalId
// @access  Private/Admin
const getAdminHospitalSettlementDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { hospitalId } = req.params;
        const { dateFilter = 'month', customStart, customEnd } = req.query;
        const { start, end } = getDateRange(String(dateFilter), customStart ? String(customStart) : undefined, customEnd ? String(customEnd) : undefined);
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ success: false, message: 'Hospital not found' });
            return;
        }
        // Daily Summary logic within date filter range
        const payments = yield Payment_1.default.find({
            hospitalId,
            createdAt: { $gte: start, $lte: end }
        });
        const completedPayments = payments.filter(p => p.status === 'completed');
        const failedPayments = payments.filter(p => p.status === 'failed');
        let grossCollection = 0;
        for (const p of completedPayments) {
            grossCollection += (p.advanceFee || p.amount || 0);
        }
        const razorpayCharges = grossCollection * 0.02;
        const gst = razorpayCharges * 0.18;
        const netSettlementAmount = grossCollection - razorpayCharges - gst;
        // Earliest pending payment for eligibility date
        const pendingPayments = yield Payment_1.default.find({
            hospitalId,
            status: 'completed',
            settlementStatus: { $in: ['Waiting for Razorpay Settlement', 'Ready for Settlement'] }
        });
        let earliestPendingDate = null;
        for (const p of pendingPayments) {
            if (!earliestPendingDate || p.createdAt < earliestPendingDate) {
                earliestPendingDate = p.createdAt;
            }
        }
        let settlementEligibleDate = 'N/A';
        if (earliestPendingDate) {
            const eligible = new Date(earliestPendingDate);
            eligible.setDate(eligible.getDate() + 2);
            settlementEligibleDate = eligible.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        const dailySummary = {
            totalBookings: payments.length,
            successfulPayments: completedPayments.length,
            failedPayments: failedPayments.length,
            grossCollection,
            razorpayCharges,
            gst,
            netSettlementAmount,
            settlementEligibleDate
        };
        // Transaction Table (all completed payments, with details)
        const transactions = yield Payment_1.default.find({ hospitalId, status: 'completed' })
            .populate({
            path: 'appointmentId',
            populate: { path: 'patient doctor' }
        })
            .sort({ createdAt: -1 });
        const transactionTable = transactions.map(t => {
            var _a;
            const app = t.appointmentId;
            const gross = t.advanceFee || t.amount || 0;
            const rzFee = gross * 0.02;
            const gstFee = rzFee * 0.18;
            const net = gross - rzFee - gstFee;
            return {
                paymentId: t._id,
                bookingId: (app === null || app === void 0 ? void 0 : app._id) || t.appointmentId,
                patientName: (app === null || app === void 0 ? void 0 : app.patientName) || ((_a = app === null || app === void 0 ? void 0 : app.patient) === null || _a === void 0 ? void 0 : _a.name) || t.patientName || 'Patient',
                appointmentDate: (app === null || app === void 0 ? void 0 : app.slotTime) ? new Date(app.slotTime).toLocaleDateString('en-IN') : 'N/A',
                consultationFee: (app === null || app === void 0 ? void 0 : app.consultationFee) || t.consultationFee || 500,
                advancePaid: gross,
                razorpayFee: rzFee,
                gst: gstFee,
                netAmount: net,
                paymentStatus: t.status,
                settlementStatus: t.settlementStatus
            };
        });
        // Bank details (decrypted)
        let bankDetails = null;
        if (hospital.bankDetails) {
            bankDetails = {
                accountHolderName: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.accountHolderName || ''),
                bankName: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.bankName || ''),
                branchName: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.branchName || ''),
                accountNumber: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.accountNumber || ''),
                ifscCode: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.ifscCode || ''),
                upiId: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.upiId || '')
            };
        }
        // Recent Settlements History
        const settlements = yield Settlement_1.default.find({ hospitalId }).sort({ createdAt: -1 });
        res.json({
            success: true,
            hospitalName: hospital.name,
            dailySummary,
            transactionTable,
            bankDetails,
            settlements
        });
    }
    catch (error) {
        console.error('[GetHospitalDetailsError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getAdminHospitalSettlementDetails = getAdminHospitalSettlementDetails;
// @desc    Update Hospital Bank Details (Admin only)
// @route   PUT /api/settlements/admin/hospital/:hospitalId/bank-details
// @access  Private/Admin
const updateHospitalBankDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { hospitalId } = req.params;
        const { accountHolderName, bankName, branchName, accountNumber, ifscCode, upiId } = req.body;
        if (!accountHolderName || !bankName || !accountNumber || !ifscCode) {
            res.status(400).json({ success: false, message: 'Missing required bank fields.' });
            return;
        }
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ success: false, message: 'Hospital not found.' });
            return;
        }
        // Encrypt bank details
        hospital.bankDetails = {
            accountHolderName: (0, cryptoHelper_1.encrypt)(accountHolderName),
            bankName: (0, cryptoHelper_1.encrypt)(bankName),
            branchName: (0, cryptoHelper_1.encrypt)(branchName || ''),
            accountNumber: (0, cryptoHelper_1.encrypt)(accountNumber),
            ifscCode: (0, cryptoHelper_1.encrypt)(ifscCode),
            upiId: (0, cryptoHelper_1.encrypt)(upiId || '')
        };
        yield hospital.save();
        // Create an audit log entry
        yield AuditLog_1.default.create({
            action: 'UPDATE_HOSPITAL_BANK_DETAILS',
            adminId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id),
            email: (_c = req.user) === null || _c === void 0 ? void 0 : _c.email,
            ipAddress: req.ip || '127.0.0.1',
            details: { hospitalId, hospitalName: hospital.name },
            status: 'success'
        });
        res.json({ success: true, message: 'Bank details securely saved.' });
    }
    catch (error) {
        console.error('[UpdateBankDetailsError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.updateHospitalBankDetails = updateHospitalBankDetails;
// @desc    Get Hospital Bank Details (Admin Reveal)
// @route   GET /api/settlements/admin/hospital/:hospitalId/bank-details
// @access  Private/Admin
const getHospitalBankDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { hospitalId } = req.params;
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ success: false, message: 'Hospital not found.' });
            return;
        }
        let decryptedBank = null;
        if (hospital.bankDetails) {
            decryptedBank = {
                accountHolderName: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.accountHolderName || ''),
                bankName: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.bankName || ''),
                branchName: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.branchName || ''),
                accountNumber: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.accountNumber || ''),
                ifscCode: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.ifscCode || ''),
                upiId: (0, cryptoHelper_1.decrypt)(hospital.bankDetails.upiId || '')
            };
        }
        // Auditing access
        yield AuditLog_1.default.create({
            action: 'ACCESS_HOSPITAL_BANK_DETAILS',
            adminId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id),
            email: (_c = req.user) === null || _c === void 0 ? void 0 : _c.email,
            ipAddress: req.ip || '127.0.0.1',
            details: { hospitalId, hospitalName: hospital.name },
            status: 'success'
        });
        res.json({ success: true, bankDetails: decryptedBank });
    }
    catch (error) {
        console.error('[GetBankDetailsError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getHospitalBankDetails = getHospitalBankDetails;
// @desc    Initiate Manual Settlement (Transfer Payment)
// @route   POST /api/settlements/admin/transfer
// @access  Private/Admin
const initiateManualSettlement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const { hospitalId, transferMethod, utrNumber, notes, paymentIds } = req.body;
        if (!hospitalId || !transferMethod || !utrNumber || !paymentIds || paymentIds.length === 0) {
            res.status(400).json({ success: false, message: 'Missing required parameters: hospitalId, transferMethod, utrNumber, paymentIds' });
            return;
        }
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ success: false, message: 'Hospital not found' });
            return;
        }
        // Prevent duplicate settlements
        const activeCount = yield Payment_1.default.countDocuments({
            _id: { $in: paymentIds },
            settlementStatus: { $in: ['Awaiting Hospital Confirmation', 'Settlement Completed'] }
        });
        if (activeCount > 0) {
            res.status(400).json({ success: false, message: 'One or more of the selected payments have already been settled or are pending confirmation.' });
            return;
        }
        // Fetch payments
        const payments = yield Payment_1.default.find({ _id: { $in: paymentIds } });
        let grossCollection = 0;
        const appointmentIds = [];
        for (const p of payments) {
            grossCollection += (p.advanceFee || p.amount || 0);
            appointmentIds.push(p.appointmentId);
        }
        const razorpayCharges = grossCollection * 0.02;
        const gstCharges = razorpayCharges * 0.18;
        const netAmount = grossCollection - razorpayCharges - gstCharges;
        // Generate SET-YYYYMMDD-XXXX ID
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
        const countToday = yield Settlement_1.default.countDocuments({
            createdAt: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                $lte: new Date(new Date().setHours(23, 59, 59, 999))
            }
        });
        const seq = String(countToday + 1).padStart(4, '0');
        const settlementId = `SET-${todayStr}-${seq}`;
        // Timeline array
        const timeline = [
            { status: 'Payment Successful', timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), note: 'Patient advance payment captured' },
            { status: 'Waiting for Razorpay Settlement', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), note: 'Funds pending settlement (T+2)' },
            { status: 'Funds Received in Pillora', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), note: 'Razorpay settled funds to Pillora Bank' },
            { status: 'Ready for Settlement', timestamp: new Date(), note: 'Payments eligible for payout' },
            { status: 'Payment Transferred', timestamp: new Date(), note: `Payout initiated via ${transferMethod}` },
            { status: 'Awaiting Hospital Confirmation', timestamp: new Date(), note: `UTR Reference: ${utrNumber}` }
        ];
        // Audit log in the Settlement object
        const auditLogEntry = {
            performedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id),
            action: 'CREATE_SETTLEMENT',
            previousStatus: 'Ready for Settlement',
            newStatus: 'Awaiting Hospital Confirmation',
            notes: notes || 'Manual payout transfer initiated by Super Admin',
            timestamp: new Date()
        };
        const settlement = yield Settlement_1.default.create({
            settlementId,
            hospitalId,
            status: 'Awaiting Hospital Confirmation',
            grossCollection,
            razorpayCharges,
            gstCharges,
            netAmount,
            transferDate: new Date(),
            transferMethod,
            utrNumber,
            notes: notes || '',
            eligibleDate: new Date(),
            paymentIds,
            appointmentIds,
            timeline,
            auditLogs: [auditLogEntry]
        });
        // Update Payment settlement statuses
        yield Payment_1.default.updateMany({ _id: { $in: paymentIds } }, {
            settlementStatus: 'Awaiting Hospital Confirmation',
            settlementId: settlement._id
        });
        // Notify Hospital User
        if (hospital.user) {
            yield Notification_1.default.create({
                user: hospital.user,
                message: `You have received a settlement of ₹${netAmount.toFixed(2)}. Transfer Method: ${transferMethod}, UTR: ${utrNumber}. Please confirm whether you have received the payment.`,
                type: 'info',
                relatedId: settlement._id
            });
        }
        // Global admin audit logging
        yield AuditLog_1.default.create({
            action: 'INITIATE_SETTLEMENT',
            adminId: ((_c = req.user) === null || _c === void 0 ? void 0 : _c._id) || ((_d = req.user) === null || _d === void 0 ? void 0 : _d.id),
            email: (_e = req.user) === null || _e === void 0 ? void 0 : _e.email,
            ipAddress: req.ip || '127.0.0.1',
            details: { settlementId, hospitalName: hospital.name, netAmount },
            status: 'success'
        });
        res.json({ success: true, message: 'Settlement initiated successfully', settlement });
    }
    catch (error) {
        console.error('[InitiateSettlementError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.initiateManualSettlement = initiateManualSettlement;
// @desc    Get Permanent Settlement History (Admin view)
// @route   GET /api/settlements/admin/history
// @access  Private/Admin
const getAdminSettlementHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { dateFilter = 'month', customStart, customEnd, searchQuery } = req.query;
        const { start, end } = getDateRange(String(dateFilter), customStart ? String(customStart) : undefined, customEnd ? String(customEnd) : undefined);
        let query = {
            createdAt: { $gte: start, $lte: end }
        };
        if (searchQuery) {
            query.$or = [
                { settlementId: { $regex: String(searchQuery), $options: 'i' } },
                { utrNumber: { $regex: String(searchQuery), $options: 'i' } }
            ];
        }
        const settlements = yield Settlement_1.default.find(query)
            .populate('hospitalId', 'name')
            .sort({ createdAt: -1 });
        res.json({ success: true, settlements });
    }
    catch (error) {
        console.error('[GetAdminHistoryError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getAdminSettlementHistory = getAdminSettlementHistory;
// @desc    Get Admin Settlement Analytics
// @route   GET /api/settlements/admin/analytics
// @access  Private/Admin
const getAdminSettlementAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settlements = yield Settlement_1.default.find();
        let totalSettlementsCount = settlements.length;
        let pendingSettlementAmount = 0;
        let totalRazorpayCharges = 0;
        let totalSettledAmount = 0;
        const pendingPayments = yield Payment_1.default.find({
            status: 'completed',
            settlementStatus: { $in: ['Waiting for Razorpay Settlement', 'Ready for Settlement'] }
        });
        for (const p of pendingPayments) {
            const amt = p.advanceFee || p.amount || 0;
            const rz = amt * 0.02;
            const gst = rz * 0.18;
            pendingSettlementAmount += (amt - rz - gst);
        }
        const completedCount = settlements.filter(s => s.status === 'Settlement Completed').length;
        const settlementSuccessRate = totalSettlementsCount > 0 ? (completedCount / totalSettlementsCount) * 100 : 100;
        // Payout timings calculation (avg hours between creation and confirmation)
        let totalTimesMs = 0;
        let countConfirmed = 0;
        for (const s of settlements) {
            if (s.confirmationDate && s.createdAt) {
                totalTimesMs += (s.confirmationDate.getTime() - s.createdAt.getTime());
                countConfirmed++;
            }
            totalRazorpayCharges += (s.razorpayCharges + s.gstCharges);
            if (s.status === 'Settlement Completed') {
                totalSettledAmount += s.netAmount;
            }
        }
        const averageSettlementTimeHours = countConfirmed > 0 ? Math.round(totalTimesMs / (1000 * 60 * 60 * countConfirmed)) : 0;
        // Group by month
        const monthlyCollections = {};
        const monthlySettlements = {};
        for (const s of settlements) {
            const month = s.createdAt.toLocaleString('default', { month: 'short', year: '2-digit' });
            monthlyCollections[month] = (monthlyCollections[month] || 0) + s.grossCollection;
            monthlySettlements[month] = (monthlySettlements[month] || 0) + s.netAmount;
        }
        const analytics = {
            totalSettlementsCount,
            pendingSettlementAmount,
            totalRazorpayCharges,
            totalSettledAmount,
            settlementSuccessRate,
            averageSettlementTimeHours,
            monthlyCollections: Object.keys(monthlyCollections).map(month => ({ month, amount: monthlyCollections[month] })),
            monthlySettlements: Object.keys(monthlySettlements).map(month => ({ month, amount: monthlySettlements[month] }))
        };
        res.json({ success: true, analytics });
    }
    catch (error) {
        console.error('[GetAdminAnalyticsError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getAdminSettlementAnalytics = getAdminSettlementAnalytics;
// ==========================================
// HOSPITAL ENDPOINTS
// ==========================================
// @desc    Get Hospital Finance Dashboard Cards
// @route   GET /api/settlements/hospital/dashboard
// @access  Private/Hospital
const getHospitalSettlementsDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ success: false, message: 'Hospital context not found' });
            return;
        }
        // Today's Bookings
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const todayBookings = yield Appointment_1.default.countDocuments({
            hospital: hospital._id,
            createdAt: { $gte: startOfToday, $lte: endOfToday }
        });
        // Today's Online Collection
        const todayPayments = yield Payment_1.default.find({
            hospitalId: hospital._id,
            status: 'completed',
            createdAt: { $gte: startOfToday, $lte: endOfToday }
        });
        let todayOnlineCollection = 0;
        for (const p of todayPayments) {
            todayOnlineCollection += (p.advanceFee || p.amount || 0);
        }
        // Pending Settlement Amount
        const pendingPayments = yield Payment_1.default.find({
            hospitalId: hospital._id,
            status: 'completed',
            settlementStatus: { $in: ['Waiting for Razorpay Settlement', 'Ready for Settlement'] }
        });
        let pendingSettlementAmount = 0;
        let earliestPendingDate = null;
        for (const p of pendingPayments) {
            const amt = p.advanceFee || p.amount || 0;
            const rz = amt * 0.02;
            const gst = rz * 0.18;
            pendingSettlementAmount += (amt - rz - gst);
            if (!earliestPendingDate || p.createdAt < earliestPendingDate) {
                earliestPendingDate = p.createdAt;
            }
        }
        // Next Expected Settlement Date (earliest pending date + 2 days)
        let nextExpectedSettlementDate = 'N/A';
        if (earliestPendingDate) {
            const eligible = new Date(earliestPendingDate);
            eligible.setDate(eligible.getDate() + 2);
            nextExpectedSettlementDate = eligible.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        // Last Settlement
        const lastSettlement = yield Settlement_1.default.findOne({
            hospitalId: hospital._id,
            status: 'Settlement Completed'
        }).sort({ createdAt: -1 });
        const lastSettlementAmount = lastSettlement ? lastSettlement.netAmount : 0;
        const lastSettlementDate = lastSettlement && lastSettlement.confirmationDate
            ? lastSettlement.confirmationDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        res.json({
            success: true,
            dashboard: {
                todayBookings,
                todayOnlineCollection,
                pendingSettlementAmount,
                nextExpectedSettlementDate,
                lastSettlementAmount,
                lastSettlementDate
            }
        });
    }
    catch (error) {
        console.error('[GetHospitalDashboardError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getHospitalSettlementsDashboard = getHospitalSettlementsDashboard;
// @desc    Get Expected Payout Summary
// @route   GET /api/settlements/hospital/expected
// @access  Private/Hospital
const getHospitalExpectedSettlement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ success: false, message: 'Hospital context not found' });
            return;
        }
        const pendingPayments = yield Payment_1.default.find({
            hospitalId: hospital._id,
            status: 'completed',
            settlementStatus: { $in: ['Waiting for Razorpay Settlement', 'Ready for Settlement'] }
        });
        let grossCollection = 0;
        for (const p of pendingPayments) {
            grossCollection += (p.advanceFee || p.amount || 0);
        }
        const razorpayFee = grossCollection * 0.02;
        const gst = razorpayFee * 0.18;
        const expectedSettlementAmount = grossCollection - razorpayFee - gst;
        // Earliest date check
        let earliestDate = null;
        for (const p of pendingPayments) {
            if (!earliestDate || p.createdAt < earliestDate) {
                earliestDate = p.createdAt;
            }
        }
        let estimatedSettlementDate = 'N/A';
        let currentStatus = 'Waiting for Razorpay Settlement';
        if (earliestDate) {
            const eligible = new Date(earliestDate);
            eligible.setDate(eligible.getDate() + 2);
            estimatedSettlementDate = eligible.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const now = new Date();
            currentStatus = eligible <= now ? 'Ready for Settlement' : 'Waiting for Razorpay Settlement';
        }
        else {
            currentStatus = 'Settlement Completed';
        }
        res.json({
            success: true,
            expected: {
                grossCollection,
                expectedSettlementAmount,
                estimatedSettlementDate,
                currentStatus
            }
        });
    }
    catch (error) {
        console.error('[GetHospitalExpectedError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getHospitalExpectedSettlement = getHospitalExpectedSettlement;
// @desc    Get Hospital Payout History
// @route   GET /api/settlements/hospital/history
// @access  Private/Hospital
const getHospitalSettlementHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!hospital) {
            res.status(404).json({ success: false, message: 'Hospital context not found' });
            return;
        }
        const settlements = yield Settlement_1.default.find({ hospitalId: hospital._id })
            .sort({ createdAt: -1 });
        res.json({ success: true, settlements });
    }
    catch (error) {
        console.error('[GetHospitalHistoryError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.getHospitalSettlementHistory = getHospitalSettlementHistory;
// @desc    Confirm Settlement Payout received
// @route   POST /api/settlements/hospital/confirm/:id
// @access  Private/Hospital
const confirmSettlementPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const hospital = req.hospital;
        const settlement = yield Settlement_1.default.findOne({ _id: id, hospitalId: hospital._id });
        if (!settlement) {
            res.status(404).json({ success: false, message: 'Settlement record not found.' });
            return;
        }
        if (settlement.status === 'Settlement Completed') {
            res.status(400).json({ success: false, message: 'Settlement is already confirmed as completed.' });
            return;
        }
        const prevStatus = settlement.status;
        settlement.status = 'Settlement Completed';
        settlement.confirmationDate = new Date();
        // Push timeline
        settlement.timeline.push({
            status: 'Settlement Completed',
            timestamp: new Date(),
            note: 'Settlement received and confirmed by hospital'
        });
        // Audit log
        settlement.auditLogs.push({
            performedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id),
            action: 'CONFIRM_PAYMENT',
            previousStatus: prevStatus,
            newStatus: 'Settlement Completed',
            notes: 'Hospital confirmed NEFT/IMPS/UPI deposit receipt',
            timestamp: new Date()
        });
        yield settlement.save();
        // Update related payments
        yield Payment_1.default.updateMany({ _id: { $in: settlement.paymentIds } }, { settlementStatus: 'Settlement Completed' });
        // Notify System Admins
        const admins = yield User_1.default.find({ role: 'admin' });
        for (const admin of admins) {
            yield Notification_1.default.create({
                user: admin._id,
                message: `Hospital "${hospital.name}" confirmed receipt of settlement ${settlement.settlementId} (₹${settlement.netAmount}).`,
                type: 'success',
                relatedId: settlement._id
            });
        }
        res.json({ success: true, message: 'Settlement confirmed successfully.', settlement });
    }
    catch (error) {
        console.error('[ConfirmSettlementError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.confirmSettlementPayment = confirmSettlementPayment;
// @desc    Dispute Settlement Payout / Report issue
// @route   POST /api/settlements/hospital/dispute/:id
// @access  Private/Hospital
const disputeSettlementPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const hospital = req.hospital;
        if (!reason) {
            res.status(400).json({ success: false, message: 'Reason for dispute is required.' });
            return;
        }
        const settlement = yield Settlement_1.default.findOne({ _id: id, hospitalId: hospital._id });
        if (!settlement) {
            res.status(404).json({ success: false, message: 'Settlement record not found.' });
            return;
        }
        const prevStatus = settlement.status;
        settlement.status = 'Under Review'; // Map report an issue to Under Review
        // Push timeline
        settlement.timeline.push({
            status: 'Under Review',
            timestamp: new Date(),
            note: `Dispute reported: ${reason}`
        });
        // Audit log
        settlement.auditLogs.push({
            performedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id),
            action: 'DISPUTE_PAYMENT',
            previousStatus: prevStatus,
            newStatus: 'Under Review',
            notes: reason,
            timestamp: new Date()
        });
        yield settlement.save();
        // Update related payments
        yield Payment_1.default.updateMany({ _id: { $in: settlement.paymentIds } }, { settlementStatus: 'Under Review' });
        // Notify System Admins Immediately
        const admins = yield User_1.default.find({ role: 'admin' });
        for (const admin of admins) {
            yield Notification_1.default.create({
                user: admin._id,
                message: `DISPUTE: Hospital "${hospital.name}" reported an issue with settlement ${settlement.settlementId}. Reason: ${reason}`,
                type: 'error',
                relatedId: settlement._id
            });
        }
        res.json({ success: true, message: 'Issue has been reported and sent to the admin team.', settlement });
    }
    catch (error) {
        console.error('[DisputeSettlementError]', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});
exports.disputeSettlementPayment = disputeSettlementPayment;
