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
exports.processAdminRefund = exports.getAdminRefunds = exports.getAdminTransactionsLedger = exports.sendSettlementRequestToHospital = exports.calculateHospitalSettlementForDateRange = exports.updateHospitalBankDetailsAdmin = exports.recordAdminSettlementPayout = exports.getAdminSettlementManagement = exports.getAdminHospitalFinancialReport = exports.getAdminFinancialOverview = exports.getAppointmentPaymentHistory = exports.editAppointmentPaymentRecord = exports.collectClinicBalance = exports.getHospitalPaymentRecords = exports.getHospitalFinancialOverview = exports.fetchHospitalFinancialData = exports.resolveDateRange = exports.safeDecryptBankDetails = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Payment_1 = __importDefault(require("../models/Payment"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Settlement_1 = __importDefault(require("../models/Settlement"));
const Refund_1 = __importDefault(require("../models/Refund"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Notification_1 = __importDefault(require("../models/Notification"));
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
const PaymentModificationLog_1 = __importDefault(require("../models/PaymentModificationLog"));
const cryptoHelper_1 = require("../utils/cryptoHelper");
const razorpay_1 = __importDefault(require("razorpay"));
const crypto_1 = __importDefault(require("crypto"));
const financialCalculator_1 = require("../utils/financialCalculator");
/**
 * Helper to safely decrypt hospital bank details (handles encrypted or plain text)
 */
const safeDecryptBankDetails = (bank) => {
    if (!bank)
        return null;
    return {
        accountHolderName: (0, cryptoHelper_1.decrypt)(bank.accountHolderName || ''),
        bankName: (0, cryptoHelper_1.decrypt)(bank.bankName || ''),
        branchName: (0, cryptoHelper_1.decrypt)(bank.branchName || ''),
        accountNumber: (0, cryptoHelper_1.decrypt)(bank.accountNumber || ''),
        ifscCode: (0, cryptoHelper_1.decrypt)(bank.ifscCode || ''),
        upiId: (0, cryptoHelper_1.decrypt)(bank.upiId || '')
    };
};
exports.safeDecryptBankDetails = safeDecryptBankDetails;
const razorpay = new razorpay_1.default({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_51Mz2wYSHB3q5Xn',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'fallback_secret'
});
/**
 * Robust date-range resolution helper with Asia/Kolkata (IST) day bounds
 */
const resolveDateRange = (filter, customStart, customEnd) => {
    return (0, financialCalculator_1.resolveISTDateRange)(filter, customStart, customEnd);
};
exports.resolveDateRange = resolveDateRange;
// ═══════════════════════════════════════════════════════════════════════════════
//  HOSPITAL DASHBOARD – PAYMENTS & COLLECTIONS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Shared helper to fetch appointments, payments, and process canonical records for a hospital
 */
const fetchHospitalFinancialData = (hospitalId, filters) => __awaiter(void 0, void 0, void 0, function* () {
    const { start, end } = (0, financialCalculator_1.resolveISTDateRange)(filters.dateFilter, filters.customStart, filters.customEnd);
    const query = {
        $or: [
            { hospital: hospitalId },
            { hospital: hospitalId.toString() }
        ],
        status: { $ne: 'cancelled' }
    };
    if (filters.dateFilter && filters.dateFilter !== 'all') {
        query.$and = [
            {
                $or: [
                    { slotTime: { $gte: start, $lte: end } },
                    { createdAt: { $gte: start, $lte: end } }
                ]
            }
        ];
    }
    if (filters.doctorId && filters.doctorId !== 'all') {
        query.doctor = filters.doctorId;
    }
    if (filters.search) {
        const searchRegex = new RegExp(String(filters.search).trim(), 'i');
        const searchCond = {
            $or: [
                { patientName: searchRegex },
                { patientPhone: searchRegex }
            ]
        };
        const tokenNum = Number(filters.search);
        if (!isNaN(tokenNum)) {
            searchCond.$or.push({ tokenNumber: tokenNum });
        }
        if (!query.$and)
            query.$and = [];
        query.$and.push(searchCond);
    }
    else if (filters.patientName) {
        query.patientName = new RegExp(String(filters.patientName).trim(), 'i');
    }
    // Fetch appointments
    const appointments = yield Appointment_1.default.find(query)
        .populate('doctor', 'name specialty fee')
        .populate('patient', 'name phone email')
        .sort({ slotTime: -1, createdAt: -1 })
        .lean();
    const appointmentIds = appointments.map(a => a._id);
    const payments = yield Payment_1.default.find({ appointmentId: { $in: appointmentIds } }).lean();
    const paymentsByAppt = {};
    for (const p of payments) {
        const k = p.appointmentId.toString();
        if (!paymentsByAppt[k])
            paymentsByAppt[k] = [];
        paymentsByAppt[k].push(p);
    }
    // Process canonical records using unified calculator
    let records = appointments.map(app => (0, financialCalculator_1.processAppointmentFinancialRecord)(app, paymentsByAppt[app._id.toString()] || []));
    // Secondary filters (applied to records)
    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
        records = records.filter(r => r.paymentStatus === filters.paymentStatus);
    }
    if (filters.settlementStatus && filters.settlementStatus !== 'all') {
        records = records.filter(r => r.settlementStatus === filters.settlementStatus);
    }
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
        records = records.filter(r => {
            if (filters.paymentMethod === 'razorpay')
                return r.advancePaid > 0;
            if (filters.paymentMethod === 'cash')
                return r.clinicCashCollection > 0;
            if (filters.paymentMethod === 'online' || filters.paymentMethod === 'upi' || filters.paymentMethod === 'card') {
                return r.clinicOnlineCollection > 0;
            }
            return true;
        });
    }
    return {
        start,
        end,
        records
    };
});
exports.fetchHospitalFinancialData = fetchHospitalFinancialData;
/**
 * @desc    Get Hospital Financial Overview (5 Primary Cards + 4 Additional Indicators)
 * @route   GET /api/hospital/dashboard/financial/overview
 * @access  Private/Hospital
 */
const getHospitalFinancialOverview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!(hospital === null || hospital === void 0 ? void 0 : hospital._id)) {
            res.status(401).json({ error: 'Hospital not authenticated' });
            return;
        }
        const dateFilter = (req.query.period || req.query.dateFilter || 'this_month');
        const customStart = (req.query.startDate || req.query.customStart);
        const customEnd = (req.query.endDate || req.query.customEnd);
        const { start, end, records } = yield (0, exports.fetchHospitalFinancialData)(hospital._id, {
            dateFilter,
            customStart,
            customEnd
        });
        const summary = (0, financialCalculator_1.aggregateFinancialRecords)(records);
        // Daily Breakdown for charts
        const dailyMap = {};
        for (const r of records) {
            const d = new Date(r.appointmentDate).toISOString().slice(0, 10);
            if (!dailyMap[d])
                dailyMap[d] = { date: d, consultationFees: 0, onlineAdvance: 0, clinicCash: 0, clinicOnline: 0 };
            dailyMap[d].consultationFees += r.consultationFee;
            dailyMap[d].onlineAdvance += r.advancePaid;
            dailyMap[d].clinicCash += r.clinicCashCollection;
            dailyMap[d].clinicOnline += r.clinicOnlineCollection;
        }
        const timeSeries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
        res.status(200).json(Object.assign(Object.assign({ success: true, dateRange: { filter: dateFilter, start, end } }, summary), { timeSeries }));
    }
    catch (error) {
        console.error('[GetHospitalFinancialOverviewError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve financial overview', details: error.message });
    }
});
exports.getHospitalFinancialOverview = getHospitalFinancialOverview;
/**
 * @desc    Get Detailed Appointment Payment Records with filtering, pagination & export
 * @route   GET /api/hospital/dashboard/financial/appointments
 * @access  Private/Hospital
 */
const getHospitalPaymentRecords = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!(hospital === null || hospital === void 0 ? void 0 : hospital._id)) {
            res.status(401).json({ error: 'Hospital not authenticated' });
            return;
        }
        const dateFilter = (req.query.period || req.query.dateFilter || 'all');
        const customStart = (req.query.startDate || req.query.customStart);
        const customEnd = (req.query.endDate || req.query.customEnd);
        const { paymentMethod, paymentStatus, settlementStatus, doctorId, patientName, search, page = 1, limit = 20, exportFormat } = req.query;
        const { records } = yield (0, exports.fetchHospitalFinancialData)(hospital._id, {
            dateFilter: String(dateFilter),
            customStart: customStart ? String(customStart) : undefined,
            customEnd: customEnd ? String(customEnd) : undefined,
            doctorId: doctorId ? String(doctorId) : undefined,
            search: search ? String(search) : undefined,
            patientName: patientName ? String(patientName) : undefined,
            paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
            paymentStatus: paymentStatus ? String(paymentStatus) : undefined,
            settlementStatus: settlementStatus ? String(settlementStatus) : undefined
        });
        // CSV Export handling
        if (exportFormat === 'csv') {
            const headers = [
                'Appointment ID',
                'Patient Name',
                'Doctor Name',
                'Consultation Fee (INR)',
                'Advance Required (INR)',
                'Advance Paid (INR)',
                'Gateway Charges (INR)',
                'Net Advance Payable (INR)',
                'Balance Due (INR)',
                'Balance Paid (INR)',
                'Clinic Cash (INR)',
                'Clinic Online (INR)',
                'Payment Status',
                'Settlement Status',
                'Appointment Date',
                'Transaction Date'
            ];
            const csvRows = [headers.join(',')];
            for (const r of records) {
                const row = [
                    r.appointmentId,
                    `"${r.patientName.replace(/"/g, '""')}"`,
                    `"${r.doctorName.replace(/"/g, '""')}"`,
                    r.consultationFee.toFixed(2),
                    r.advanceRequired.toFixed(2),
                    r.advancePaid.toFixed(2),
                    r.gatewayCharges.toFixed(2),
                    r.netAdvancePayable.toFixed(2),
                    r.balanceDue.toFixed(2),
                    r.balancePaid.toFixed(2),
                    r.clinicCashCollection.toFixed(2),
                    r.clinicOnlineCollection.toFixed(2),
                    r.paymentStatus,
                    r.settlementStatus,
                    new Date(r.appointmentDate).toISOString().slice(0, 10),
                    new Date(r.transactionDate || r.appointmentDate).toISOString().slice(0, 10)
                ];
                csvRows.push(row.join(','));
            }
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=Pillora_Payments_${new Date().toISOString().slice(0, 10)}.csv`);
            res.status(200).send(csvRows.join('\n'));
            return;
        }
        const totalRecords = records.length;
        const pageNum = Math.max(1, Number(page));
        const pageSize = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * pageSize;
        const paginatedRecords = records.slice(skip, skip + pageSize);
        res.status(200).json({
            success: true,
            records: paginatedRecords,
            pagination: {
                total: totalRecords,
                totalRecords: totalRecords,
                page: pageNum,
                limit: pageSize,
                totalPages: Math.ceil(totalRecords / pageSize) || 1
            }
        });
    }
    catch (error) {
        console.error('[GetHospitalPaymentRecordsError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve payment records', details: error.message });
    }
});
exports.getHospitalPaymentRecords = getHospitalPaymentRecords;
/**
 * @desc    Collect Remaining Balance at Clinic (Scenario C)
 * @route   POST /api/hospital/dashboard/appointments/:id/collect-balance
 * @access  Private/Hospital
 */
const collectClinicBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const hospital = req.hospital;
        if (!(hospital === null || hospital === void 0 ? void 0 : hospital._id)) {
            res.status(401).json({ error: 'Hospital not authenticated' });
            return;
        }
        const { id } = req.params;
        const { amount, paymentMethod = 'cash', notes } = req.body;
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            res.status(400).json({ error: 'Valid positive payment amount is required' });
            return;
        }
        const validMethods = ['cash', 'upi', 'card', 'other_online'];
        if (!validMethods.includes(paymentMethod)) {
            res.status(400).json({ error: `Payment method must be one of: ${validMethods.join(', ')}` });
            return;
        }
        const appointment = yield Appointment_1.default.findOne({ _id: id, hospital: hospital._id }).populate('doctor');
        if (!appointment) {
            res.status(404).json({ error: 'Appointment not found for this hospital' });
            return;
        }
        const consultationFee = appointment.consultationFee || ((_a = appointment.doctor) === null || _a === void 0 ? void 0 : _a.fee) || 500;
        const advancePaid = appointment.advancePaid || 0;
        const previousBalancePaid = appointment.balancePaid || 0;
        const currentBalanceDue = Math.max(0, consultationFee - advancePaid - previousBalancePaid);
        if (currentBalanceDue <= 0 && appointment.paymentStatus === 'paid') {
            res.status(400).json({ error: 'This appointment is already fully paid' });
            return;
        }
        // Start session for atomic transaction
        const session = yield mongoose_1.default.startSession();
        session.startTransaction();
        try {
            // 1. Create immutable Payment record
            const paymentType = (advancePaid > 0) ? 'balance' : 'full';
            const mode = paymentMethod === 'cash' ? 'offline' : 'online';
            const payment = new Payment_1.default({
                appointmentId: appointment._id,
                hospitalId: hospital._id,
                userId: appointment.patient,
                patientName: appointment.patientName || 'Patient',
                amount: amountNum,
                amountInPaise: Math.round(amountNum * 100),
                consultationFee,
                paymentType,
                paymentSource: 'clinic_collection',
                paymentMethod,
                mode,
                status: 'completed',
                settlementStatus: 'not_applicable',
                recordedBy: (_b = req.user) === null || _b === void 0 ? void 0 : _b._id,
                notes: notes || `Clinic collection via ${paymentMethod.toUpperCase()}`
            });
            yield payment.save({ session });
            // 2. Update appointment balance & payment status
            const newBalancePaid = previousBalancePaid + amountNum;
            const newBalanceDue = Math.max(0, consultationFee - advancePaid - newBalancePaid);
            const isFullyPaid = newBalanceDue <= 0;
            appointment.balancePaid = newBalancePaid;
            appointment.balanceDue = newBalanceDue;
            appointment.paymentStatus = isFullyPaid ? 'paid' : 'partial';
            appointment.paymentUpdatedAt = new Date();
            appointment.paymentUpdatedBy = (_c = req.user) === null || _c === void 0 ? void 0 : _c._id;
            yield appointment.save({ session });
            yield session.commitTransaction();
            session.endSession();
            res.status(200).json({
                success: true,
                message: isFullyPaid
                    ? 'Balance collected successfully. Appointment is now fully paid.'
                    : `Partial balance of ₹${amountNum} recorded. Remaining due: ₹${newBalanceDue}`,
                payment: {
                    transactionId: payment.transactionId,
                    amount: payment.amount,
                    method: payment.paymentMethod,
                    type: payment.paymentType,
                    status: payment.status
                },
                appointment: {
                    appointmentId: appointment._id,
                    consultationFee,
                    advancePaid,
                    balancePaid: newBalancePaid,
                    balanceDue: newBalanceDue,
                    paymentStatus: appointment.paymentStatus
                }
            });
        }
        catch (txnError) {
            yield session.abortTransaction();
            session.endSession();
            throw txnError;
        }
    }
    catch (error) {
        console.error('[CollectClinicBalanceError]', error.message || error);
        res.status(500).json({ error: 'Failed to record balance collection', details: error.message });
    }
});
exports.collectClinicBalance = collectClinicBalance;
/**
 * @desc    Edit Appointment Payment & Collection Details (with strict audit trail)
 * @route   PUT /api/hospital/dashboard/appointments/:id/financial-edit
 * @access  Private/Hospital
 */
const editAppointmentPaymentRecord = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    try {
        const hospital = req.hospital;
        if (!(hospital === null || hospital === void 0 ? void 0 : hospital._id)) {
            res.status(401).json({ error: 'Hospital not authenticated' });
            return;
        }
        const { id } = req.params;
        const { reason, patientName, doctorId, consultationFee, paymentId, paymentAmount, paymentMethod, paymentDate, transactionReference, notes } = req.body;
        // 1. Mandatory reason check
        if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
            res.status(400).json({ error: 'A mandatory reason for modification is required (minimum 3 characters).' });
            return;
        }
        // 2. Fetch appointment and verify hospital ownership
        const appointment = yield Appointment_1.default.findById(id).populate('doctor');
        if (!appointment) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }
        if (appointment.hospital.toString() !== hospital._id.toString()) {
            res.status(403).json({ error: 'Unauthorized: Appointment does not belong to your hospital.' });
            return;
        }
        // 3. Fetch all completed payments for this appointment
        const existingPayments = yield Payment_1.default.find({ appointmentId: appointment._id }).sort({ createdAt: 1 });
        // Capture previous values snapshot
        const previousSnapshot = {
            patientName: appointment.patientName,
            doctorId: appointment.doctor ? (_a = appointment.doctor._id) === null || _a === void 0 ? void 0 : _a.toString() : undefined,
            doctorName: appointment.doctorName || ((_b = appointment.doctor) === null || _b === void 0 ? void 0 : _b.name),
            consultationFee: appointment.consultationFee,
            advancePaid: appointment.advancePaid,
            balancePaid: appointment.balancePaid,
            balanceDue: appointment.balanceDue,
            paymentStatus: appointment.paymentStatus
        };
        const changes = [];
        // 4. Update Appointment fields if provided
        if (patientName !== undefined && patientName.trim() && patientName.trim() !== appointment.patientName) {
            changes.push({
                field: 'patientName',
                label: 'Patient Name',
                oldValue: appointment.patientName,
                newValue: patientName.trim()
            });
            appointment.patientName = patientName.trim();
        }
        if (doctorId !== undefined && doctorId) {
            const currentDocId = appointment.doctor ? (_c = appointment.doctor._id) === null || _c === void 0 ? void 0 : _c.toString() : '';
            if (doctorId.toString() !== currentDocId) {
                const targetDoctor = yield Doctor_1.default.findById(doctorId);
                if (targetDoctor) {
                    changes.push({
                        field: 'doctorId',
                        label: 'Doctor',
                        oldValue: appointment.doctorName || ((_d = appointment.doctor) === null || _d === void 0 ? void 0 : _d.name) || 'Unassigned',
                        newValue: targetDoctor.name
                    });
                    appointment.doctor = targetDoctor._id;
                    appointment.doctorName = targetDoctor.name;
                }
            }
        }
        if (consultationFee !== undefined && consultationFee !== null) {
            const feeNum = Number(consultationFee);
            if (isNaN(feeNum) || feeNum < 0) {
                res.status(400).json({ error: 'Consultation fee must be a non-negative number' });
                return;
            }
            if (feeNum !== appointment.consultationFee) {
                changes.push({
                    field: 'consultationFee',
                    label: 'Consultation Fee',
                    oldValue: appointment.consultationFee,
                    newValue: feeNum
                });
                appointment.consultationFee = feeNum;
            }
        }
        // 5. Update or create Payment record
        let targetPayment = null;
        if (paymentId) {
            targetPayment = existingPayments.find(p => p._id.toString() === paymentId.toString());
        }
        else {
            // Find clinic collection payment by default
            targetPayment = existingPayments.find(p => p.paymentSource === 'clinic_collection');
        }
        // Security check: Never allow hospital users to modify settled transactions or Razorpay payment records
        if (targetPayment) {
            const isSettled = targetPayment.settlementStatus === 'Settled' || targetPayment.settlementStatus === 'Settlement Completed';
            const isRazorpay = (0, financialCalculator_1.isOnlineAdvancePayment)(targetPayment);
            if (isSettled && isRazorpay) {
                if (paymentAmount !== undefined && Number(paymentAmount) !== targetPayment.amount) {
                    res.status(403).json({
                        error: 'Settled online advance transactions are locked and cannot be directly modified. Original Razorpay collections are immutable.'
                    });
                    return;
                }
            }
            // Save previous payment snapshot
            previousSnapshot.paymentId = targetPayment._id.toString();
            previousSnapshot.paymentAmount = targetPayment.amount;
            previousSnapshot.paymentMethod = targetPayment.paymentMethod;
            previousSnapshot.paymentDate = targetPayment.createdAt;
            previousSnapshot.transactionReference = targetPayment.transactionId;
            previousSnapshot.notes = targetPayment.notes;
            // Apply payment amount change
            if (paymentAmount !== undefined && paymentAmount !== null) {
                const amtNum = Number(paymentAmount);
                if (isNaN(amtNum) || amtNum < 0) {
                    res.status(400).json({ error: 'Payment amount must be a non-negative number' });
                    return;
                }
                if (amtNum !== targetPayment.amount) {
                    changes.push({
                        field: 'paymentAmount',
                        label: 'Payment Amount',
                        oldValue: targetPayment.amount,
                        newValue: amtNum
                    });
                    targetPayment.amount = amtNum;
                    targetPayment.amountInPaise = Math.round(amtNum * 100);
                }
            }
            // Apply payment method change
            if (paymentMethod !== undefined && paymentMethod && !isRazorpay) {
                const validMethods = ['cash', 'upi', 'card', 'qr', 'other_online'];
                if (!validMethods.includes(paymentMethod)) {
                    res.status(400).json({ error: `Invalid payment method. Must be one of: ${validMethods.join(', ')}` });
                    return;
                }
                const normalizedMethod = paymentMethod === 'qr' ? 'upi' : paymentMethod;
                if (normalizedMethod !== targetPayment.paymentMethod) {
                    changes.push({
                        field: 'paymentMethod',
                        label: 'Payment Method',
                        oldValue: targetPayment.paymentMethod,
                        newValue: normalizedMethod
                    });
                    targetPayment.paymentMethod = normalizedMethod;
                    targetPayment.mode = normalizedMethod === 'cash' ? 'offline' : 'online';
                }
            }
            // Apply payment date change
            if (paymentDate && !isRazorpay) {
                const newDate = new Date(paymentDate);
                if (!isNaN(newDate.getTime())) {
                    changes.push({
                        field: 'paymentDate',
                        label: 'Payment Date',
                        oldValue: targetPayment.createdAt,
                        newValue: newDate
                    });
                    targetPayment.createdAt = newDate;
                }
            }
            // Apply transaction reference change (never overwrite razorpayPaymentId)
            if (transactionReference !== undefined && !isRazorpay) {
                changes.push({
                    field: 'transactionReference',
                    label: 'Transaction Reference',
                    oldValue: targetPayment.transactionId,
                    newValue: transactionReference.trim()
                });
                targetPayment.transactionId = transactionReference.trim() || targetPayment.transactionId;
            }
            // Apply notes
            if (notes !== undefined) {
                changes.push({
                    field: 'notes',
                    label: 'Collection Notes',
                    oldValue: targetPayment.notes,
                    newValue: notes.trim()
                });
                targetPayment.notes = notes.trim();
            }
            yield targetPayment.save();
        }
        else if (paymentAmount !== undefined && Number(paymentAmount) > 0) {
            // No clinic payment existed, create one
            const amtNum = Number(paymentAmount);
            const validMethods = ['cash', 'upi', 'card', 'qr', 'other_online'];
            const chosenMethod = validMethods.includes(paymentMethod) ? (paymentMethod === 'qr' ? 'upi' : paymentMethod) : 'cash';
            targetPayment = new Payment_1.default({
                appointmentId: appointment._id,
                hospitalId: hospital._id,
                userId: appointment.patient,
                patientName: appointment.patientName || 'Patient',
                amount: amtNum,
                amountInPaise: Math.round(amtNum * 100),
                consultationFee: appointment.consultationFee,
                paymentType: (appointment.advancePaid && appointment.advancePaid > 0) ? 'balance' : 'full',
                paymentSource: 'clinic_collection',
                paymentMethod: chosenMethod,
                mode: chosenMethod === 'cash' ? 'offline' : 'online',
                status: 'completed',
                settlementStatus: 'not_applicable',
                recordedBy: (_e = req.user) === null || _e === void 0 ? void 0 : _e._id,
                transactionId: transactionReference ? transactionReference.trim() : `TXN-CLI-${Date.now()}`,
                notes: notes || `Clinic collection recorded on ${new Date().toLocaleDateString()}`
            });
            yield targetPayment.save();
            changes.push({
                field: 'clinicCollection',
                label: 'New Clinic Collection Added',
                oldValue: 0,
                newValue: amtNum
            });
        }
        // 6. Recalculate Appointment Totals using single source of truth
        const allCompletedPayments = yield Payment_1.default.find({
            appointmentId: appointment._id,
            status: { $in: ['completed', 'paid'] }
        });
        let newAdvancePaid = 0;
        let newClinicBalancePaid = 0;
        for (const p of allCompletedPayments) {
            if ((0, financialCalculator_1.isOnlineAdvancePayment)(p)) {
                newAdvancePaid += Number(p.amount || 0);
            }
            else {
                newClinicBalancePaid += Number(p.amount || 0);
            }
        }
        const fee = Number(appointment.consultationFee || 500);
        const newBalanceDue = Math.max(0, fee - newAdvancePaid - newClinicBalancePaid);
        let newPaymentStatus = 'unpaid';
        if (newBalanceDue === 0 && (newAdvancePaid > 0 || newClinicBalancePaid > 0)) {
            newPaymentStatus = 'paid';
        }
        else if (newAdvancePaid > 0 || newClinicBalancePaid > 0) {
            newPaymentStatus = 'partial';
        }
        appointment.advancePaid = newAdvancePaid;
        appointment.balancePaid = newClinicBalancePaid;
        appointment.balanceDue = newBalanceDue;
        appointment.paymentStatus = newPaymentStatus;
        appointment.paymentUpdatedAt = new Date();
        appointment.paymentUpdatedBy = (_f = req.user) === null || _f === void 0 ? void 0 : _f._id;
        yield appointment.save();
        // 7. Create immutable PaymentModificationLog
        const updatedSnapshot = {
            patientName: appointment.patientName,
            doctorId: appointment.doctor ? (_g = appointment.doctor._id) === null || _g === void 0 ? void 0 : _g.toString() : undefined,
            doctorName: appointment.doctorName,
            consultationFee: appointment.consultationFee,
            advancePaid: appointment.advancePaid,
            balancePaid: appointment.balancePaid,
            balanceDue: appointment.balanceDue,
            paymentStatus: appointment.paymentStatus,
            paymentId: targetPayment ? targetPayment._id.toString() : undefined,
            paymentAmount: targetPayment ? targetPayment.amount : undefined,
            paymentMethod: targetPayment ? targetPayment.paymentMethod : undefined,
            notes: targetPayment ? targetPayment.notes : undefined
        };
        const auditLogEntry = new PaymentModificationLog_1.default({
            appointmentId: appointment._id,
            paymentId: targetPayment === null || targetPayment === void 0 ? void 0 : targetPayment._id,
            hospitalId: hospital._id,
            modifiedBy: (_h = req.user) === null || _h === void 0 ? void 0 : _h._id,
            modifierName: ((_j = req.user) === null || _j === void 0 ? void 0 : _j.name) || hospital.name || 'Hospital Staff',
            modifierRole: ((_k = req.user) === null || _k === void 0 ? void 0 : _k.role) || 'hospital',
            reason: reason.trim(),
            previousValues: previousSnapshot,
            updatedValues: updatedSnapshot,
            changes,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown'
        });
        yield auditLogEntry.save();
        // Also record to general AuditLog
        try {
            yield AuditLog_1.default.create({
                action: 'PAYMENT_MODIFICATION',
                hospitalId: hospital._id,
                userId: (_l = req.user) === null || _l === void 0 ? void 0 : _l._id,
                email: (_m = req.user) === null || _m === void 0 ? void 0 : _m.email,
                ipAddress: req.ip || 'unknown',
                details: {
                    appointmentId: appointment._id,
                    paymentId: targetPayment === null || targetPayment === void 0 ? void 0 : targetPayment._id,
                    reason: reason.trim(),
                    changes
                },
                status: 'success'
            });
        }
        catch (auditErr) {
            console.error('[AuditLogSaveWarning]', auditErr);
        }
        // 8. Return updated record processed by unified financial calculator
        const populatedAppointment = yield Appointment_1.default.findById(appointment._id)
            .populate('doctor', 'name specialty fee')
            .populate('patient', 'name phone email')
            .lean();
        const freshPayments = yield Payment_1.default.find({ appointmentId: appointment._id }).lean();
        const processedRecord = (0, financialCalculator_1.processAppointmentFinancialRecord)(populatedAppointment, freshPayments);
        res.status(200).json({
            success: true,
            message: 'Payment and collection details updated successfully.',
            record: processedRecord,
            auditLog: auditLogEntry
        });
    }
    catch (error) {
        console.error('[EditAppointmentPaymentRecordError]', error.message || error);
        res.status(500).json({ error: 'Failed to update payment record', details: error.message });
    }
});
exports.editAppointmentPaymentRecord = editAppointmentPaymentRecord;
/**
 * @desc    Get Payment Modification Audit History for an Appointment
 * @route   GET /api/hospital/dashboard/appointments/:id/payment-history
 * @access  Private/Hospital
 */
const getAppointmentPaymentHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospital = req.hospital;
        if (!(hospital === null || hospital === void 0 ? void 0 : hospital._id)) {
            res.status(401).json({ error: 'Hospital not authenticated' });
            return;
        }
        const { id } = req.params;
        const appointment = yield Appointment_1.default.findById(id).lean();
        if (!appointment) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }
        if (appointment.hospital.toString() !== hospital._id.toString()) {
            res.status(403).json({ error: 'Unauthorized: Appointment does not belong to your hospital.' });
            return;
        }
        const history = yield PaymentModificationLog_1.default.find({ appointmentId: appointment._id })
            .populate('modifiedBy', 'name email role')
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({
            success: true,
            appointmentId: id,
            history
        });
    }
    catch (error) {
        console.error('[GetAppointmentPaymentHistoryError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve payment history', details: error.message });
    }
});
exports.getAppointmentPaymentHistory = getAppointmentPaymentHistory;
// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN PANEL – CENTRAL FINANCIAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @desc    Get Overall Financial Dashboard across all hospitals (Subsection A)
 * @route   GET /api/admin/financial/overview
 * @access  Private/Admin
 */
const getAdminFinancialOverview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { dateFilter = 'this_month', customStart, customEnd } = req.query;
        const { start, end } = (0, exports.resolveDateRange)(String(dateFilter), customStart ? String(customStart) : undefined, customEnd ? String(customEnd) : undefined);
        // Fetch all appointments in date range
        const appointments = yield Appointment_1.default.find({
            status: { $ne: 'cancelled' },
            $or: [
                { slotTime: { $gte: start, $lte: end } },
                { createdAt: { $gte: start, $lte: end } }
            ]
        }).lean();
        let totalConsultationFees = 0;
        for (const a of appointments) {
            totalConsultationFees += (a.consultationFee || 500);
        }
        // Fetch completed payments in date range
        const payments = yield Payment_1.default.find({
            status: { $in: ['completed', 'paid'] },
            createdAt: { $gte: start, $lte: end }
        }).lean();
        let totalOnlineAdvances = 0;
        let onlineAdvancesCount = 0;
        let totalGatewayCharges = 0;
        let totalCashCollected = 0;
        let totalOnlineCollectedAtClinic = 0;
        let totalPendingSettlements = 0;
        let totalProcessingSettlements = 0;
        let totalCompletedSettlements = 0;
        for (const p of payments) {
            const amt = p.amount || 0;
            if ((0, financialCalculator_1.isOnlineAdvancePayment)(p)) {
                totalOnlineAdvances += (p.advanceFee || amt);
                onlineAdvancesCount += 1;
                const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(p.advanceFee || amt);
                totalGatewayCharges += split.gatewayCharges;
                const st = (0, financialCalculator_1.normalizeSettlementStatus)(p.settlementStatus, true);
                if (st === 'Settled') {
                    totalCompletedSettlements += split.netPayable;
                }
                else if (st === 'Processing') {
                    totalProcessingSettlements += split.netPayable;
                }
                else if (st === 'Pending') {
                    totalPendingSettlements += split.netPayable;
                }
            }
            else if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                totalCashCollected += amt;
            }
            else {
                totalOnlineCollectedAtClinic += amt;
            }
        }
        const totalNetAmountPayable = Math.round((totalPendingSettlements + totalProcessingSettlements + totalCompletedSettlements) * 100) / 100;
        const hospitalCount = yield Hospital_1.default.countDocuments();
        res.status(200).json({
            success: true,
            dateRange: { filter: dateFilter, start, end },
            summary: {
                totalConsultationFees: Math.round(totalConsultationFees * 100) / 100,
                totalOnlineAdvances: Math.round(totalOnlineAdvances * 100) / 100,
                totalNetPayableToHospitals: totalNetAmountPayable,
                totalCashCollectedAtHospitals: Math.round(totalCashCollected * 100) / 100,
                totalOnlineCollectedAtHospitals: Math.round(totalOnlineCollectedAtClinic * 100) / 100,
                totalGatewayCharges: Math.round(totalGatewayCharges * 100) / 100,
                totalPendingHospitalSettlements: Math.round(totalPendingSettlements * 100) / 100,
                totalProcessingHospitalSettlements: Math.round(totalProcessingSettlements * 100) / 100,
                totalCompletedHospitalSettlements: Math.round(totalCompletedSettlements * 100) / 100,
                hospitalCount,
                transactionCount: payments.length,
                appointmentCount: appointments.length
            }
        });
    }
    catch (error) {
        console.error('[GetAdminFinancialOverviewError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve admin financial overview', details: error.message });
    }
});
exports.getAdminFinancialOverview = getAdminFinancialOverview;
/**
 * @desc    Get Hospital-wise Financial Reports (Subsection B)
 * @route   GET /api/admin/financial/hospital/:hospitalId
 * @access  Private/Admin
 */
const getAdminHospitalFinancialReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { hospitalId } = req.params;
        const { dateFilter = 'all', customStart, customEnd } = req.query;
        const { start, end } = (0, financialCalculator_1.resolveISTDateRange)(String(dateFilter), customStart ? String(customStart) : undefined, customEnd ? String(customEnd) : undefined);
        const hospital = yield Hospital_1.default.findById(hospitalId).lean();
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }
        // Match queries
        const apptQuery = { hospital: hospital._id, status: { $ne: 'cancelled' } };
        const payQuery = { hospitalId: hospital._id, status: { $in: ['completed', 'paid'] } };
        if (dateFilter !== 'all') {
            apptQuery.$or = [{ slotTime: { $gte: start, $lte: end } }, { createdAt: { $gte: start, $lte: end } }];
            payQuery.createdAt = { $gte: start, $lte: end };
        }
        const appointments = yield Appointment_1.default.find(apptQuery).populate('doctor', 'name specialty fee').lean();
        const payments = yield Payment_1.default.find(payQuery).lean();
        const settlements = yield Settlement_1.default.find({ hospitalId: hospital._id }).sort({ createdAt: -1 }).lean();
        let totalConsultationFees = 0;
        for (const a of appointments) {
            totalConsultationFees += (a.consultationFee || 500);
        }
        let onlineAdvanceCount = 0;
        let grossOnlineAdvances = 0;
        let gatewayCharges = 0;
        let cashAtClinic = 0;
        let onlineAtClinic = 0;
        for (const p of payments) {
            const amt = p.amount || 0;
            if ((0, financialCalculator_1.isOnlineAdvancePayment)(p)) {
                onlineAdvanceCount++;
                const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(p.advanceFee || amt);
                grossOnlineAdvances += split.grossAmount;
                gatewayCharges += split.gatewayCharges;
            }
            else if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                cashAtClinic += amt;
            }
            else {
                onlineAtClinic += amt;
            }
        }
        const totalGatewayDeductions = gatewayCharges;
        const totalNetAdvances = Math.max(0, Math.round((grossOnlineAdvances - totalGatewayDeductions) * 100) / 100);
        let alreadySettled = 0;
        let awaitingConfirmation = 0;
        const settledPaymentIdSet = new Set();
        for (const s of settlements) {
            if (s.status === 'Settlement Completed') {
                alreadySettled += (s.netAmount || 0);
                if (Array.isArray(s.paymentIds)) {
                    s.paymentIds.forEach((pid) => settledPaymentIdSet.add(String(pid)));
                }
            }
            else if (s.status === 'Awaiting Hospital Confirmation') {
                awaitingConfirmation += (s.netAmount || 0);
                if (Array.isArray(s.paymentIds)) {
                    s.paymentIds.forEach((pid) => settledPaymentIdSet.add(String(pid)));
                }
            }
        }
        let pendingSettlement = 0;
        for (const p of payments) {
            if ((0, financialCalculator_1.isOnlineAdvancePayment)(p)) {
                const isAlreadyHandled = settledPaymentIdSet.has(String(p._id)) ||
                    ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation'].includes(p.settlementStatus);
                if (!isAlreadyHandled && !['refunded', 'not_applicable'].includes(p.settlementStatus)) {
                    const amt = p.advanceFee || p.amount || 0;
                    const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(amt);
                    pendingSettlement += split.netPayable;
                }
            }
        }
        // Fallback for alreadySettled if settlements collection had no records but payments are marked Settled
        if (alreadySettled === 0) {
            for (const p of payments) {
                if ((0, financialCalculator_1.isOnlineAdvancePayment)(p) && ['Settled', 'Settlement Completed'].includes(p.settlementStatus)) {
                    const amt = p.advanceFee || p.amount || 0;
                    const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(amt);
                    alreadySettled += split.netPayable;
                }
            }
        }
        // Net Amount Pillora Has to Pay is the outstanding pending settlement
        const netPayable = Math.max(0, pendingSettlement);
        const totalPatientCollections = grossOnlineAdvances + cashAtClinic + onlineAtClinic;
        const pendingPatientCollection = Math.max(0, totalConsultationFees - totalPatientCollections);
        res.status(200).json({
            success: true,
            hospital: {
                _id: hospital._id,
                name: hospital.name,
                address: hospital.address,
                phone: hospital.contactNumber || (hospital.phoneNumbers && hospital.phoneNumbers[0]) || '',
                email: hospital.email,
                bankDetails: (0, exports.safeDecryptBankDetails)(hospital.bankDetails)
            },
            financialSummary: {
                totalConsultationFees: Math.round(totalConsultationFees * 100) / 100,
                onlineAdvanceCount,
                grossOnlineAdvances: Math.round(grossOnlineAdvances * 100) / 100,
                gatewayCharges: Math.round(totalGatewayDeductions * 100) / 100,
                totalNetAdvances: Math.round(totalNetAdvances * 100) / 100,
                netPayable: Math.round(pendingSettlement * 100) / 100,
                outstandingPayable: Math.round((pendingSettlement + awaitingConfirmation) * 100) / 100,
                cashAtClinic: Math.round(cashAtClinic * 100) / 100,
                onlineAtClinic: Math.round(onlineAtClinic * 100) / 100,
                totalPatientCollections: Math.round(totalPatientCollections * 100) / 100,
                pendingPatientCollection: Math.round(pendingPatientCollection * 100) / 100,
                patientOverCollection: Math.max(0, Math.round((totalPatientCollections - totalConsultationFees) * 100) / 100),
                alreadySettled: Math.round(alreadySettled * 100) / 100,
                awaitingConfirmation: Math.round(awaitingConfirmation * 100) / 100,
                pendingSettlement: Math.round(pendingSettlement * 100) / 100
            },
            recentTransactions: payments.slice(0, 50),
            settlementHistory: settlements
        });
    }
    catch (error) {
        console.error('[GetAdminHospitalFinancialReportError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve hospital financial report', details: error.message });
    }
});
exports.getAdminHospitalFinancialReport = getAdminHospitalFinancialReport;
/**
 * @desc    Get Settlement Management List across all hospitals (Subsection C)
 * @route   GET /api/admin/financial/settlements
 * @access  Private/Admin
 */
const getAdminSettlementManagement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { dateFilter = 'all', customStart, customEnd, status } = req.query;
        const { start, end } = (0, financialCalculator_1.resolveISTDateRange)(String(dateFilter), customStart ? String(customStart) : undefined, customEnd ? String(customEnd) : undefined);
        const hospitals = yield Hospital_1.default.find().select('name address phone email bankDetails').lean();
        const settlementList = [];
        for (const hosp of hospitals) {
            const payQuery = {
                hospitalId: hosp._id,
                status: { $in: ['completed', 'paid'] },
                $or: [
                    { paymentSource: 'pillora_online' },
                    { razorpayPaymentId: { $exists: true, $ne: '' } },
                    { mode: 'online' }
                ]
            };
            if (dateFilter !== 'all') {
                payQuery.createdAt = { $gte: start, $lte: end };
            }
            const payments = yield Payment_1.default.find(payQuery).lean();
            let grossAdvances = 0;
            let gatewayCharges = 0;
            let alreadySettled = 0;
            let pendingSettlement = 0;
            let awaitingConfirmation = 0;
            let earliestPendingDate = null;
            // Fetch hospital settlement records for exact settled amounts
            const hospSettlements = yield Settlement_1.default.find({ hospitalId: hosp._id }).lean();
            const settledPaymentIdSet = new Set();
            for (const s of hospSettlements) {
                if (s.status === 'Settlement Completed') {
                    alreadySettled += (s.netAmount || 0);
                    if (Array.isArray(s.paymentIds)) {
                        s.paymentIds.forEach((pid) => settledPaymentIdSet.add(String(pid)));
                    }
                }
                else if (s.status === 'Awaiting Hospital Confirmation') {
                    awaitingConfirmation += (s.netAmount || 0);
                    if (Array.isArray(s.paymentIds)) {
                        s.paymentIds.forEach((pid) => settledPaymentIdSet.add(String(pid)));
                    }
                }
            }
            for (const p of payments) {
                if ((0, financialCalculator_1.isOnlineAdvancePayment)(p)) {
                    const amt = p.advanceFee || p.amount || 0;
                    const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(amt);
                    grossAdvances += split.grossAmount;
                    gatewayCharges += split.gatewayCharges;
                    const isAlreadyHandled = settledPaymentIdSet.has(String(p._id)) ||
                        ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation'].includes(p.settlementStatus);
                    if (!isAlreadyHandled && !['refunded', 'not_applicable'].includes(p.settlementStatus)) {
                        pendingSettlement += split.netPayable;
                        if (!earliestPendingDate || p.createdAt < earliestPendingDate) {
                            earliestPendingDate = p.createdAt;
                        }
                    }
                }
            }
            // Fallback for alreadySettled if settlements collection had no records but payments are marked Settled
            if (alreadySettled === 0) {
                for (const p of payments) {
                    if ((0, financialCalculator_1.isOnlineAdvancePayment)(p)) {
                        const st = p.settlementStatus || 'Pending';
                        if (['Settled', 'Settlement Completed'].includes(st)) {
                            const amt = p.advanceFee || p.amount || 0;
                            const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(amt);
                            alreadySettled += split.netPayable;
                        }
                    }
                }
            }
            const netPayable = Math.max(0, grossAdvances - gatewayCharges);
            // Latest settlement record for this hospital
            const latestSettlement = yield Settlement_1.default.findOne({ hospitalId: hosp._id }).sort({ createdAt: -1 }).lean();
            let calculatedStatus = 'Pending';
            if ((latestSettlement === null || latestSettlement === void 0 ? void 0 : latestSettlement.status) === 'Awaiting Hospital Confirmation' || awaitingConfirmation > 0) {
                calculatedStatus = 'Awaiting Hospital Confirmation';
            }
            else if (pendingSettlement === 0 && alreadySettled > 0) {
                calculatedStatus = 'Settled';
            }
            else if ((latestSettlement === null || latestSettlement === void 0 ? void 0 : latestSettlement.status) === 'Processing') {
                calculatedStatus = 'Processing';
            }
            else if (pendingSettlement > 0) {
                calculatedStatus = 'Pending';
            }
            // Filter by settlement status if requested
            if (status && status !== 'all' && calculatedStatus !== status && (latestSettlement === null || latestSettlement === void 0 ? void 0 : latestSettlement.status) !== status) {
                continue;
            }
            const decryptedBank = (0, exports.safeDecryptBankDetails)(hosp.bankDetails);
            settlementList.push({
                hospitalId: hosp._id,
                hospitalName: hosp.name,
                advanceCount: payments.length,
                totalGrossAdvances: Math.round(grossAdvances * 100) / 100,
                gatewayCharges: Math.round(gatewayCharges * 100) / 100,
                netPayable: Math.round(netPayable * 100) / 100,
                alreadySettled: Math.round(alreadySettled * 100) / 100,
                pendingSettlement: Math.round(pendingSettlement * 100) / 100,
                settlementDate: (latestSettlement === null || latestSettlement === void 0 ? void 0 : latestSettlement.transferDate) || null,
                bankTransactionReference: (latestSettlement === null || latestSettlement === void 0 ? void 0 : latestSettlement.utrNumber) || 'N/A',
                settlementStatus: calculatedStatus,
                hasBankDetails: Boolean(decryptedBank === null || decryptedBank === void 0 ? void 0 : decryptedBank.accountNumber),
                bankDetails: decryptedBank,
                eligibleDate: earliestPendingDate ? new Date(earliestPendingDate.getTime() + (2 * 86400000)) : null
            });
        }
        res.status(200).json({
            success: true,
            settlements: settlementList
        });
    }
    catch (error) {
        console.error('[GetAdminSettlementManagementError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve settlements management data', details: error.message });
    }
});
exports.getAdminSettlementManagement = getAdminSettlementManagement;
/**
 * @desc    Record/Initiate Settlement Payout for a Hospital (Subsection C)
 * @route   POST /api/admin/financial/settlements/payout
 * @access  Private/Admin
 */
const recordAdminSettlementPayout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { hospitalId, transferMethod = 'NEFT', utrNumber, transferDate = new Date(), notes, amount } = req.body;
        if (!hospitalId || !utrNumber) {
            res.status(400).json({ error: 'Hospital ID and UTR/Bank Reference number are required' });
            return;
        }
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }
        // Find all pending payments for this hospital
        const pendingPayments = yield Payment_1.default.find({
            hospitalId,
            status: { $in: ['completed', 'paid'] },
            paymentSource: 'pillora_online',
            settlementStatus: { $in: ['Pending', 'Waiting for Razorpay Settlement', 'Ready for Settlement'] }
        });
        if (pendingPayments.length === 0) {
            res.status(400).json({ error: 'No pending payments available to settle for this hospital' });
            return;
        }
        let totalGross = 0;
        let totalCharges = 0;
        let totalTaxes = 0;
        for (const p of pendingPayments) {
            const amt = p.amount || p.advanceFee || 0;
            const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(amt);
            totalGross += split.grossAmount;
            totalCharges += split.fee;
            totalTaxes += split.tax;
        }
        const netPayable = Math.max(0, Math.round((totalGross - (totalCharges + totalTaxes)) * 100) / 100);
        const payoutAmount = amount ? Number(amount) : netPayable;
        // Generate Settlement ID: SET-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto_1.default.randomBytes(2).toString('hex').toUpperCase();
        const settlementId = `SET-${dateStr}-${randomStr}`;
        // Create Settlement document
        const settlement = new Settlement_1.default({
            settlementId,
            hospitalId: hospital._id,
            status: 'Settled',
            grossCollection: Math.round(totalGross * 100) / 100,
            razorpayCharges: Math.round(totalCharges * 100) / 100,
            gstCharges: Math.round(totalTaxes * 100) / 100,
            netAmount: Math.round(payoutAmount * 100) / 100,
            transferDate: new Date(transferDate),
            transferMethod,
            utrNumber,
            notes: notes || `Settled via ${transferMethod} UTR: ${utrNumber}`,
            eligibleDate: new Date(),
            confirmationDate: new Date(),
            paymentIds: pendingPayments.map(p => p._id),
            appointmentIds: pendingPayments.map(p => p.appointmentId),
            timeline: [{
                    status: 'Settled',
                    timestamp: new Date(),
                    note: `Payout recorded with UTR ${utrNumber}`
                }],
            auditLogs: [{
                    performedBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
                    action: 'MANUAL_SETTLEMENT_RECORDED',
                    previousStatus: 'Pending',
                    newStatus: 'Settled',
                    notes: `Transferred ₹${payoutAmount} via ${transferMethod} UTR: ${utrNumber}`,
                    timestamp: new Date()
                }]
        });
        yield settlement.save();
        // Update all linked payments to Settled
        yield Payment_1.default.updateMany({ _id: { $in: pendingPayments.map(p => p._id) } }, {
            $set: {
                settlementStatus: 'Settled',
                settlementId: settlement._id,
                settlementDate: new Date(transferDate)
            }
        });
        res.status(200).json({
            success: true,
            message: `Settlement of ₹${payoutAmount} successfully recorded for ${hospital.name}`,
            settlement: {
                settlementId: settlement.settlementId,
                netAmount: settlement.netAmount,
                utrNumber: settlement.utrNumber,
                status: settlement.status,
                paymentCount: pendingPayments.length
            }
        });
    }
    catch (error) {
        console.error('[RecordAdminSettlementPayoutError]', error.message || error);
        res.status(500).json({ error: 'Failed to record settlement payout', details: error.message });
    }
});
exports.recordAdminSettlementPayout = recordAdminSettlementPayout;
/**
 * @desc    Update Hospital Bank Account Details (Admin)
 * @route   PUT /api/admin/financial/hospital/:hospitalId/bank-details
 * @access  Private/Admin
 */
const updateHospitalBankDetailsAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { hospitalId } = req.params;
        const { accountHolderName, bankName, branchName, accountNumber, ifscCode, upiId } = req.body;
        if (!hospitalId) {
            res.status(400).json({ error: 'Hospital ID is required' });
            return;
        }
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }
        hospital.bankDetails = {
            accountHolderName: String(accountHolderName || '').trim(),
            bankName: String(bankName || '').trim(),
            branchName: String(branchName || '').trim(),
            accountNumber: String(accountNumber || '').trim(),
            ifscCode: String(ifscCode || '').trim().toUpperCase(),
            upiId: String(upiId || '').trim()
        };
        yield hospital.save();
        res.status(200).json({
            success: true,
            message: 'Hospital bank account details updated successfully',
            bankDetails: hospital.bankDetails
        });
    }
    catch (error) {
        console.error('[UpdateHospitalBankDetailsAdminError]', error.message || error);
        res.status(500).json({ error: 'Failed to update hospital bank details', details: error.message });
    }
});
exports.updateHospitalBankDetailsAdmin = updateHospitalBankDetailsAdmin;
/**
 * @desc    Calculate settlement amount for a hospital in a custom date range
 * @route   GET /api/admin/financial/hospital/:hospitalId/settlement-calculate
 * @access  Private/Admin
 */
const calculateHospitalSettlementForDateRange = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { hospitalId } = req.params;
        const { startDate, endDate } = req.query;
        if (!hospitalId) {
            res.status(400).json({ error: 'Hospital ID is required' });
            return;
        }
        const hospital = yield Hospital_1.default.findById(hospitalId).lean();
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }
        let start;
        let end;
        if (startDate) {
            start = new Date(String(startDate));
            start.setHours(0, 0, 0, 0);
        }
        else {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        }
        if (endDate) {
            end = new Date(String(endDate));
            end.setHours(23, 59, 59, 999);
        }
        else {
            end = new Date();
            end.setHours(23, 59, 59, 999);
        }
        // Find all online advances within this date range that are not already settled or awaiting confirmation
        const query = {
            hospitalId: hospital._id,
            status: { $in: ['completed', 'paid'] },
            $or: [
                { paymentSource: 'pillora_online' },
                { razorpayPaymentId: { $exists: true, $ne: '' } },
                { mode: 'online' }
            ],
            createdAt: { $gte: start, $lte: end },
            settlementStatus: { $nin: ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation', 'refunded', 'not_applicable'] }
        };
        const payments = yield Payment_1.default.find(query)
            .populate('appointmentId', 'tokenNumber patientName slotTime consultationFee')
            .sort({ createdAt: -1 })
            .lean();
        let totalGross = 0;
        let totalDeductions = 0;
        let totalNet = 0;
        const paymentBreakdown = payments.map((p) => {
            const amt = p.amount || p.advanceFee || 0;
            const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(amt);
            totalGross += split.grossAmount;
            totalDeductions += split.gatewayCharges;
            totalNet += split.netPayable;
            const appt = p.appointmentId;
            return {
                paymentId: p._id,
                transactionId: p.transactionId || `TXN-${p._id}`,
                razorpayPaymentId: p.razorpayPaymentId || 'N/A',
                appointmentId: (appt === null || appt === void 0 ? void 0 : appt._id) || p.appointmentId,
                tokenNumber: (appt === null || appt === void 0 ? void 0 : appt.tokenNumber) || null,
                patientName: p.patientName || (appt === null || appt === void 0 ? void 0 : appt.patientName) || 'Patient',
                consultationFee: (appt === null || appt === void 0 ? void 0 : appt.consultationFee) || 500,
                advancePaid: split.grossAmount,
                gatewayCharge: split.gatewayCharges,
                netPayable: split.netPayable,
                settlementStatus: p.settlementStatus || 'Pending',
                createdAt: p.createdAt
            };
        });
        res.status(200).json({
            success: true,
            hospital: {
                _id: hospital._id,
                name: hospital.name,
                bankDetails: (0, exports.safeDecryptBankDetails)(hospital.bankDetails)
            },
            dateRange: {
                startDate: start,
                endDate: end
            },
            calculation: {
                advanceCount: payments.length,
                grossOnlineAdvances: Math.round(totalGross * 100) / 100,
                gatewayCharges: Math.round(totalDeductions * 100) / 100,
                netPayable: Math.round(totalNet * 100) / 100
            },
            payments: paymentBreakdown
        });
    }
    catch (error) {
        console.error('[CalculateHospitalSettlementForDateRangeError]', error.message || error);
        res.status(500).json({ error: 'Failed to calculate settlement', details: error.message });
    }
});
exports.calculateHospitalSettlementForDateRange = calculateHospitalSettlementForDateRange;
/**
 * @desc    Send Settlement Request to Hospital (sets status to 'Awaiting Hospital Confirmation')
 * @route   POST /api/admin/financial/hospital/:hospitalId/send-settlement-request
 * @access  Private/Admin
 */
const sendSettlementRequestToHospital = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { hospitalId } = req.params;
        const { startDate, endDate, amount, transferMethod = 'NEFT', utrNumber, notes, paymentIds } = req.body;
        if (!hospitalId || !utrNumber) {
            res.status(400).json({ error: 'Hospital ID and UTR / Bank Reference number are mandatory' });
            return;
        }
        const hospital = yield Hospital_1.default.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }
        let start;
        let end;
        if (startDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
        }
        else {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        }
        if (endDate) {
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        }
        else {
            end = new Date();
            end.setHours(23, 59, 59, 999);
        }
        // Query eligible payments (excluding already settled or awaiting confirmation)
        let eligiblePayments = [];
        if (Array.isArray(paymentIds) && paymentIds.length > 0) {
            eligiblePayments = yield Payment_1.default.find({
                _id: { $in: paymentIds },
                hospitalId: hospital._id,
                settlementStatus: { $nin: ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation', 'refunded', 'not_applicable'] }
            });
        }
        else {
            eligiblePayments = yield Payment_1.default.find({
                hospitalId: hospital._id,
                status: { $in: ['completed', 'paid'] },
                $or: [
                    { paymentSource: 'pillora_online' },
                    { razorpayPaymentId: { $exists: true, $ne: '' } },
                    { mode: 'online' }
                ],
                createdAt: { $gte: start, $lte: end },
                settlementStatus: { $nin: ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation', 'refunded', 'not_applicable'] }
            });
        }
        if (eligiblePayments.length === 0) {
            res.status(400).json({ error: 'No eligible pending payments found to settle for the selected period' });
            return;
        }
        let totalGross = 0;
        let totalCharges = 0;
        let totalGst = 0;
        for (const p of eligiblePayments) {
            const amt = p.amount || p.advanceFee || 0;
            const split = (0, financialCalculator_1.calculateAdvanceGatewaySplit)(amt);
            totalGross += split.grossAmount;
            totalCharges += split.fee;
            totalGst += split.tax;
        }
        const netCalc = Math.max(0, Math.round((totalGross - (totalCharges + totalGst)) * 100) / 100);
        const payoutAmount = amount ? Math.round(Number(amount) * 100) / 100 : netCalc;
        // Generate SET-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto_1.default.randomBytes(2).toString('hex').toUpperCase();
        const settlementId = `SET-${dateStr}-${randomStr}`;
        const validMethods = ['NEFT', 'RTGS', 'IMPS', 'UPI'];
        const chosenMethod = validMethods.includes(transferMethod) ? transferMethod : 'NEFT';
        const settlement = new Settlement_1.default({
            settlementId,
            hospitalId: hospital._id,
            status: 'Awaiting Hospital Confirmation', // Awaiting approval from hospital dashboard
            startDate: start,
            endDate: end,
            advanceCount: eligiblePayments.length,
            grossCollection: Math.round(totalGross * 100) / 100,
            razorpayCharges: Math.round(totalCharges * 100) / 100,
            gstCharges: Math.round(totalGst * 100) / 100,
            netAmount: payoutAmount,
            transferDate: new Date(),
            transferMethod: chosenMethod,
            utrNumber: String(utrNumber).trim(),
            notes: (notes === null || notes === void 0 ? void 0 : notes.trim()) || `Transferred via ${chosenMethod} UTR: ${utrNumber}`,
            eligibleDate: new Date(),
            paymentIds: eligiblePayments.map(p => p._id),
            appointmentIds: eligiblePayments.map(p => p.appointmentId).filter(Boolean),
            timeline: [
                {
                    status: 'Awaiting Hospital Confirmation',
                    timestamp: new Date(),
                    note: `Settlement payout of ₹${payoutAmount.toFixed(2)} sent via ${chosenMethod} (UTR: ${utrNumber}). Awaiting hospital confirmation.`
                }
            ],
            auditLogs: [
                {
                    performedBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
                    action: 'SEND_SETTLEMENT_REQUEST',
                    previousStatus: 'Pending',
                    newStatus: 'Awaiting Hospital Confirmation',
                    notes: `Pillora Admin sent settlement request for ₹${payoutAmount.toFixed(2)} via ${chosenMethod} UTR: ${utrNumber}`,
                    timestamp: new Date()
                }
            ]
        });
        yield settlement.save();
        // Mark all payments as Awaiting Hospital Confirmation
        yield Payment_1.default.updateMany({ _id: { $in: eligiblePayments.map(p => p._id) } }, {
            $set: {
                settlementStatus: 'Awaiting Hospital Confirmation',
                settlementId: settlement._id
            }
        });
        // Notify Hospital User
        if (hospital.user) {
            yield Notification_1.default.create({
                user: hospital.user,
                message: `Pillora Admin sent a settlement payout of ₹${payoutAmount.toFixed(2)} for the period ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}. Transfer Method: ${chosenMethod}, UTR: ${utrNumber}. Please confirm receipt in your settlements dashboard.`,
                type: 'info',
                relatedId: settlement._id
            });
        }
        res.status(200).json({
            success: true,
            message: `Settlement request of ₹${payoutAmount.toFixed(2)} sent to ${hospital.name}. Status is now 'Awaiting Hospital Confirmation'.`,
            settlement: {
                settlementId: settlement.settlementId,
                netAmount: settlement.netAmount,
                utrNumber: settlement.utrNumber,
                transferMethod: settlement.transferMethod,
                status: settlement.status,
                advanceCount: eligiblePayments.length,
                startDate: settlement.startDate,
                endDate: settlement.endDate
            }
        });
    }
    catch (error) {
        console.error('[SendSettlementRequestToHospitalError]', error.message || error);
        res.status(500).json({ error: 'Failed to send settlement request', details: error.message });
    }
});
exports.sendSettlementRequestToHospital = sendSettlementRequestToHospital;
/**
 * @desc    Get Master Transaction Ledger across all hospitals (Subsection D)
 * @route   GET /api/admin/financial/transactions
 * @access  Private/Admin
 */
const getAdminTransactionsLedger = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { hospitalId, paymentType, paymentSource, paymentMethod, status, settlementStatus, search, dateFilter = 'all', customStart, customEnd, page = 1, limit = 25 } = req.query;
        const { start, end } = (0, exports.resolveDateRange)(String(dateFilter), customStart ? String(customStart) : undefined, customEnd ? String(customEnd) : undefined);
        const query = {};
        if (dateFilter !== 'all') {
            query.createdAt = { $gte: start, $lte: end };
        }
        if (hospitalId && hospitalId !== 'all') {
            query.hospitalId = hospitalId;
        }
        if (paymentType && paymentType !== 'all') {
            query.paymentType = paymentType;
        }
        if (paymentSource && paymentSource !== 'all') {
            query.paymentSource = paymentSource;
        }
        if (paymentMethod && paymentMethod !== 'all') {
            query.paymentMethod = paymentMethod;
        }
        if (status && status !== 'all') {
            query.status = status;
        }
        if (settlementStatus && settlementStatus !== 'all') {
            query.settlementStatus = settlementStatus;
        }
        if (search) {
            const regex = new RegExp(String(search).trim(), 'i');
            query.$or = [
                { transactionId: regex },
                { razorpayPaymentId: regex },
                { razorpayOrderId: regex },
                { patientName: regex }
            ];
        }
        const pageNum = Math.max(1, Number(page));
        const pageSize = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * pageSize;
        const totalTransactions = yield Payment_1.default.countDocuments(query);
        const transactions = yield Payment_1.default.find(query)
            .populate('hospitalId', 'name address')
            .populate('appointmentId', 'tokenNumber slotTime status patientName')
            .populate('recordedBy', 'name email role')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean();
        res.status(200).json({
            success: true,
            transactions: transactions.map(t => {
                var _a, _b, _c, _d, _e, _f;
                const isAdv = (0, financialCalculator_1.isOnlineAdvancePayment)(t);
                const split = isAdv ? (0, financialCalculator_1.calculateAdvanceGatewaySplit)(t.advanceFee || t.amount || 0) : null;
                return {
                    _id: t._id,
                    transactionId: t.transactionId || `TXN-${t._id}`,
                    razorpayPaymentId: t.razorpayPaymentId || 'N/A',
                    razorpayOrderId: t.razorpayOrderId || 'N/A',
                    appointmentId: ((_a = t.appointmentId) === null || _a === void 0 ? void 0 : _a._id) || t.appointmentId,
                    tokenNumber: ((_b = t.appointmentId) === null || _b === void 0 ? void 0 : _b.tokenNumber) || null,
                    hospitalId: ((_c = t.hospitalId) === null || _c === void 0 ? void 0 : _c._id) || t.hospitalId,
                    hospitalName: ((_d = t.hospitalId) === null || _d === void 0 ? void 0 : _d.name) || 'Unknown Hospital',
                    patientName: t.patientName || ((_e = t.appointmentId) === null || _e === void 0 ? void 0 : _e.patientName) || 'Patient',
                    amount: t.amount,
                    amountInPaise: t.amountInPaise || Math.round(t.amount * 100),
                    paymentType: t.paymentType || (isAdv ? 'advance' : 'full'),
                    paymentSource: t.paymentSource || (isAdv ? 'pillora_online' : 'clinic_collection'),
                    paymentMethod: t.paymentMethod || (t.mode === 'offline' ? 'cash' : 'razorpay'),
                    gatewayCharges: split ? split.gatewayCharges : (t.gatewayCharges || 0),
                    gatewayTaxes: split ? split.tax : (t.gatewayTaxes || 0),
                    netPayable: split ? split.netPayable : (t.netPayable || 0),
                    status: t.status,
                    settlementStatus: t.settlementStatus || 'N/A',
                    createdAt: t.createdAt,
                    recordedBy: ((_f = t.recordedBy) === null || _f === void 0 ? void 0 : _f.name) || null,
                    notes: t.notes || ''
                };
            }),
            pagination: {
                total: totalTransactions,
                page: pageNum,
                limit: pageSize,
                totalPages: Math.ceil(totalTransactions / pageSize)
            }
        });
    }
    catch (error) {
        console.error('[GetAdminTransactionsLedgerError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve transaction ledger', details: error.message });
    }
});
exports.getAdminTransactionsLedger = getAdminTransactionsLedger;
/**
 * @desc    Get Refund Management Records (Subsection E)
 * @route   GET /api/admin/financial/refunds
 * @access  Private/Admin
 */
const getAdminRefunds = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const refunds = yield Refund_1.default.find()
            .populate('appointmentId', 'tokenNumber slotTime patientName patientPhone consultationFee status')
            .populate('hospitalId', 'name')
            .populate('initiatedBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();
        // Also fetch cancelled appointments that have completed online advance payments but not yet refunded
        const cancelledWithPayments = yield Appointment_1.default.find({
            status: 'cancelled',
            paymentStatus: { $in: ['paid', 'partial'] }
        })
            .populate('hospital', 'name')
            .populate('doctor', 'name fee')
            .sort({ updatedAt: -1 })
            .lean();
        res.status(200).json({
            success: true,
            refunds,
            pendingRefundCandidates: cancelledWithPayments
        });
    }
    catch (error) {
        console.error('[GetAdminRefundsError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve refund records', details: error.message });
    }
});
exports.getAdminRefunds = getAdminRefunds;
/**
 * @desc    Process Refund for an Appointment (Subsection E)
 * @route   POST /api/admin/financial/refunds/process
 * @access  Private/Admin
 */
const processAdminRefund = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { appointmentId, reason, amount } = req.body;
        if (!appointmentId || !reason) {
            res.status(400).json({ error: 'Appointment ID and refund reason are required' });
            return;
        }
        const appointment = yield Appointment_1.default.findById(appointmentId);
        if (!appointment) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }
        // Find completed online payment to refund
        const payment = yield Payment_1.default.findOne({
            appointmentId: appointment._id,
            status: { $in: ['completed', 'paid'] },
            paymentSource: 'pillora_online'
        });
        if (!payment) {
            res.status(404).json({ error: 'No refundable online advance payment found for this appointment' });
            return;
        }
        const refundAmt = amount ? Number(amount) : (payment.advanceFee || payment.amount);
        const refundPaise = Math.round(refundAmt * 100);
        let gatewayRefundId = 'REFUND_MANUAL_SIMULATED';
        // Trigger Razorpay refund if real payment ID is present
        if (payment.razorpayPaymentId && !payment.razorpayPaymentId.startsWith('simulated_')) {
            try {
                const rzpRefund = yield razorpay.payments.refund(payment.razorpayPaymentId, {
                    amount: refundPaise,
                    notes: {
                        reason,
                        appointmentId: appointment._id.toString()
                    }
                });
                gatewayRefundId = rzpRefund.id;
            }
            catch (rzpErr) {
                console.warn('[RazorpayRefundNotice]', rzpErr.message || rzpErr);
                gatewayRefundId = `RZP_REF_${Date.now()}`;
            }
        }
        // Generate Unique Refund ID
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto_1.default.randomBytes(2).toString('hex').toUpperCase();
        const refundId = `REF-${dateStr}-${randomStr}`;
        // Create Refund record
        const refundRecord = new Refund_1.default({
            refundId,
            appointmentId: appointment._id,
            paymentId: payment._id,
            hospitalId: payment.hospitalId,
            patientId: appointment.patient,
            amount: refundAmt,
            amountInPaise: refundPaise,
            reason,
            gatewayRefundId,
            status: 'processed',
            initiatedBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
            processedAt: new Date(),
            notes: reason
        });
        yield refundRecord.save();
        // Update Payment record
        payment.status = 'refunded';
        payment.settlementStatus = 'refunded';
        payment.refundDetails = {
            refundId,
            reason,
            amount: refundAmt,
            refundedAt: new Date()
        };
        yield payment.save();
        // Update Appointment
        appointment.status = 'cancelled';
        appointment.paymentStatus = 'waived';
        yield appointment.save();
        res.status(200).json({
            success: true,
            message: `Refund of ₹${refundAmt} processed successfully`,
            refund: {
                refundId,
                gatewayRefundId,
                amount: refundAmt,
                status: 'processed'
            }
        });
    }
    catch (error) {
        console.error('[ProcessAdminRefundError]', error.message || error);
        res.status(500).json({ error: 'Failed to process refund', details: error.message });
    }
});
exports.processAdminRefund = processAdminRefund;
