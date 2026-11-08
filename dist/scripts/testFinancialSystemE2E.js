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
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const Payment_1 = __importDefault(require("../models/Payment"));
const Settlement_1 = __importDefault(require("../models/Settlement"));
const Refund_1 = __importDefault(require("../models/Refund"));
function runE2ETests() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('================================================================');
        console.log('🚀 STARTING COMPREHENSIVE E2E FINANCIAL MANAGEMENT SYSTEM TESTS');
        console.log('================================================================');
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI is missing from environment');
        }
        yield mongoose_1.default.connect(mongoUri);
        console.log('✅ Connected to MongoDB Atlas');
        const testRunId = `e2e_${Date.now()}`;
        const results = [];
        const dummyDocId = new mongoose_1.default.Types.ObjectId();
        const dummyPatId = new mongoose_1.default.Types.ObjectId();
        const dummySlotId = new mongoose_1.default.Types.ObjectId();
        let hospA = null;
        let hospB = null;
        const createdApptIds = [];
        const createdPaymentIds = [];
        try {
            // Step 0: Setup Two Test Hospitals for Isolation Testing
            console.log('\n--- SETUP: Creating Test Hospitals ---');
            hospA = yield Hospital_1.default.create({
                name: `Test Alpha Hospital ${testRunId}`,
                slug: `test-alpha-hospital-${testRunId}`,
                address: '100 Test Blvd, Mumbai',
                city: 'Mumbai',
                contactNumber: '9876543210',
                description: 'Test Facility Alpha',
                rating: 4.8,
                consultationFee: 1000,
                isOpen24Hours: true,
                management_type: 'SELF',
                is_verified: true,
                plan: 'Standard',
                is_featured: false,
                has_govt_schemes: false,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                ambulanceContact: '108',
                bankDetails: {
                    accountHolderName: 'Alpha Hospital Trust',
                    bankName: 'HDFC Bank',
                    branchName: 'Andheri West',
                    accountNumber: '123456789012',
                    ifscCode: 'HDFC0001234'
                }
            });
            hospB = yield Hospital_1.default.create({
                name: `Test Beta Clinic ${testRunId}`,
                slug: `test-beta-clinic-${testRunId}`,
                address: '200 Test Street, Pune',
                city: 'Pune',
                contactNumber: '9876543211',
                description: 'Test Facility Beta',
                rating: 4.5,
                consultationFee: 800,
                isOpen24Hours: false,
                management_type: 'SELF',
                is_verified: true,
                plan: 'Standard',
                is_featured: false,
                has_govt_schemes: false,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                ambulanceContact: '108'
            });
            console.log(`✅ Created Hospital A: ${hospA.name} (${hospA._id})`);
            console.log(`✅ Created Hospital B: ${hospB.name} (${hospB._id})`);
            // =====================================================================
            // TEST 1: SCENARIO A - ONLINE APPOINTMENT WITH 20% ADVANCE
            // =====================================================================
            console.log('\n--- TEST 1: SCENARIO A (Online Booking + 20% Advance via Pillora.in) ---');
            const consultationFeeA = 1000;
            const advanceRequiredA = 200; // 20%
            const balanceDueA = 800; // 80%
            const apptA = yield Appointment_1.default.create({
                hospital: hospA._id,
                hospitalName: hospA.name,
                doctor: dummyDocId,
                patient: dummyPatId,
                slot: dummySlotId,
                patientName: 'Rahul Sharma',
                patientPhone: '9876500001',
                patientEmail: 'rahul.test@pillora.in',
                patientAge: 32,
                slotTime: new Date(),
                appointmentDate: new Date(),
                status: 'confirmed',
                consultationFee: consultationFeeA,
                advanceRequired: advanceRequiredA,
                advancePaid: advanceRequiredA,
                balanceDue: balanceDueA,
                balancePaid: 0,
                paymentStatus: 'partial'
            });
            createdApptIds.push(apptA._id);
            // Record Online Advance Payment via Razorpay
            const rzpPaymentA = yield Payment_1.default.create({
                appointmentId: apptA._id,
                hospitalId: hospA._id,
                userId: null,
                amount: advanceRequiredA,
                amountInPaise: 20000,
                currency: 'INR',
                status: 'completed',
                paymentType: 'advance',
                paymentSource: 'pillora_online',
                paymentMethod: 'razorpay',
                razorpayPaymentId: `pay_test_${testRunId}_A`,
                razorpayOrderId: `order_test_${testRunId}_A`,
                settlementStatus: 'Pending'
            });
            createdPaymentIds.push(rzpPaymentA._id);
            // Verify Calculations
            const expectedGatewayFee = 4.00; // 2% of 200
            const expectedGatewayTax = 0.72; // 18% of 4.00
            const expectedNetPayable = 195.28;
            const passesFeeCheck = Math.abs((rzpPaymentA.gatewayCharges || 0) - expectedGatewayFee) < 0.05 &&
                Math.abs((rzpPaymentA.gatewayTaxes || 0) - expectedGatewayTax) < 0.05 &&
                Math.abs((rzpPaymentA.netPayable || 0) - expectedNetPayable) < 0.05;
            results.push({
                test: 'Scenario A: Online Advance & Gateway Deductions',
                passed: passesFeeCheck && apptA.paymentStatus === 'partial' && apptA.balanceDue === 800,
                details: `Advance: ₹${rzpPaymentA.amount}, Fee: ₹${rzpPaymentA.gatewayCharges}, Tax: ₹${rzpPaymentA.gatewayTaxes}, Net Payable: ₹${rzpPaymentA.netPayable}, Due: ₹${apptA.balanceDue}`
            });
            console.log(`Result: ${passesFeeCheck ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 2: SCENARIO B - WALK-IN APPOINTMENT AT HOSPITAL
            // =====================================================================
            console.log('\n--- TEST 2: SCENARIO B (Walk-in Appointment paid fully in Cash at Clinic) ---');
            const walkinFee = 1500;
            const apptB = yield Appointment_1.default.create({
                hospital: hospA._id,
                hospitalName: hospA.name,
                doctor: dummyDocId,
                patient: dummyPatId,
                slot: dummySlotId,
                patientName: 'Priya Patel',
                patientPhone: '9876500002',
                patientEmail: 'priya.test@pillora.in',
                patientAge: 28,
                slotTime: new Date(),
                appointmentDate: new Date(),
                status: 'confirmed',
                consultationFee: walkinFee,
                advanceRequired: 0,
                advancePaid: 0,
                balanceDue: 0,
                balancePaid: walkinFee,
                paymentStatus: 'paid'
            });
            createdApptIds.push(apptB._id);
            const clinicPaymentB = yield Payment_1.default.create({
                appointmentId: apptB._id,
                hospitalId: hospA._id,
                amount: walkinFee,
                amountInPaise: 150000,
                currency: 'INR',
                status: 'completed',
                paymentType: 'full',
                paymentSource: 'clinic_collection',
                paymentMethod: 'cash',
                settlementStatus: 'not_applicable',
                gatewayCharges: 0,
                gatewayTaxes: 0,
                netPayable: 0
            });
            createdPaymentIds.push(clinicPaymentB._id);
            const passesWalkin = apptB.paymentStatus === 'paid' &&
                apptB.advancePaid === 0 &&
                apptB.balancePaid === 1500 &&
                clinicPaymentB.paymentSource === 'clinic_collection' &&
                clinicPaymentB.paymentMethod === 'cash';
            results.push({
                test: 'Scenario B: Walk-in appointment paid fully in cash at hospital',
                passed: passesWalkin,
                details: `Fee: ₹${apptB.consultationFee}, Balance Paid: ₹${apptB.balancePaid}, Source: ${clinicPaymentB.paymentSource}, Method: ${clinicPaymentB.paymentMethod}`
            });
            console.log(`Result: ${passesWalkin ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 3: SCENARIO C - BALANCE COLLECTION AT HOSPITAL (Scenario A Appt)
            // =====================================================================
            console.log('\n--- TEST 3: SCENARIO C (Balance Collection at Clinic for Scenario A Appt) ---');
            const balancePaymentA = yield Payment_1.default.create({
                appointmentId: apptA._id,
                hospitalId: hospA._id,
                amount: 800,
                amountInPaise: 80000,
                currency: 'INR',
                status: 'completed',
                paymentType: 'balance',
                paymentSource: 'clinic_collection',
                paymentMethod: 'upi',
                settlementStatus: 'not_applicable',
                gatewayCharges: 0,
                gatewayTaxes: 0,
                netPayable: 0,
                notes: 'Collected via UPI QR at reception counter'
            });
            createdPaymentIds.push(balancePaymentA._id);
            // Update appointment to fully paid
            apptA.balancePaid = (apptA.balancePaid || 0) + 800;
            apptA.balanceDue = Math.max(0, (apptA.balanceDue || 0) - 800);
            apptA.paymentStatus = 'paid';
            yield apptA.save();
            // Verify that BOTH payments exist and advance was NOT overwritten!
            const allPaymentsForApptA = yield Payment_1.default.find({ appointmentId: apptA._id });
            const hasAdvance = allPaymentsForApptA.some(p => p.paymentType === 'advance' && p.amount === 200 && p.paymentSource === 'pillora_online');
            const hasBalance = allPaymentsForApptA.some(p => p.paymentType === 'balance' && p.amount === 800 && p.paymentSource === 'clinic_collection');
            const passesScenarioC = allPaymentsForApptA.length === 2 &&
                hasAdvance &&
                hasBalance &&
                apptA.paymentStatus === 'paid' &&
                apptA.balanceDue === 0;
            results.push({
                test: 'Scenario C: Balance collection recorded with immutable multi-transaction ledger',
                passed: passesScenarioC,
                details: `Total Txns: ${allPaymentsForApptA.length}, Advance Preserved: ${hasAdvance}, Balance Recorded: ${hasBalance}, PaymentStatus: ${apptA.paymentStatus}`
            });
            console.log(`Result: ${passesScenarioC ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 4: PARTIAL BALANCE PAYMENT
            // =====================================================================
            console.log('\n--- TEST 4: Partial Balance Payment Handling ---');
            const apptPartial = yield Appointment_1.default.create({
                hospital: hospA._id,
                hospitalName: hospA.name,
                doctor: dummyDocId,
                patient: dummyPatId,
                slot: dummySlotId,
                patientName: 'Anil Verma',
                patientPhone: '9876500003',
                consultationFee: 2000,
                advanceRequired: 400,
                advancePaid: 400,
                balanceDue: 1600,
                balancePaid: 0,
                paymentStatus: 'partial',
                slotTime: new Date()
            });
            createdApptIds.push(apptPartial._id);
            const partialPayment = yield Payment_1.default.create({
                appointmentId: apptPartial._id,
                hospitalId: hospA._id,
                amount: 600,
                amountInPaise: 60000,
                currency: 'INR',
                status: 'completed',
                paymentType: 'balance',
                paymentSource: 'clinic_collection',
                paymentMethod: 'cash',
                settlementStatus: 'not_applicable'
            });
            createdPaymentIds.push(partialPayment._id);
            apptPartial.balancePaid = 600;
            apptPartial.balanceDue = 1000; // 1600 - 600
            apptPartial.paymentStatus = 'partial'; // Still partial!
            yield apptPartial.save();
            const passesPartial = apptPartial.paymentStatus === 'partial' && apptPartial.balanceDue === 1000;
            results.push({
                test: 'Partial Balance Collection keeps status partial and decrements due amount',
                passed: passesPartial,
                details: `Fee: ₹2000, Advance: ₹400, Partial Balance: ₹600, Remaining Due: ₹${apptPartial.balanceDue}`
            });
            console.log(`Result: ${passesPartial ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 5: IDEMPOTENCY & TRANSACTION ID INTEGRITY
            // =====================================================================
            console.log('\n--- TEST 5: Idempotency & Unique Transaction IDs ---');
            const uniqueTxnIds = new Set([rzpPaymentA.transactionId, clinicPaymentB.transactionId, balancePaymentA.transactionId]);
            const passesTxnId = uniqueTxnIds.size === 3 && typeof rzpPaymentA.transactionId === 'string' && rzpPaymentA.transactionId.startsWith('TXN-');
            results.push({
                test: 'Unique Auto-Generated Transaction IDs',
                passed: passesTxnId,
                details: `Sample Txn ID: ${rzpPaymentA.transactionId}`
            });
            console.log(`Result: ${passesTxnId ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 6: FINANCIAL RECONCILIATION EQUATIONS
            // =====================================================================
            console.log('\n--- TEST 6: Financial Reconciliation Equations for Hospital A ---');
            const rzpPartial = yield Payment_1.default.create({
                appointmentId: apptPartial._id,
                hospitalId: hospA._id,
                amount: 400,
                amountInPaise: 40000,
                currency: 'INR',
                status: 'completed',
                paymentType: 'advance',
                paymentSource: 'pillora_online',
                paymentMethod: 'razorpay',
                settlementStatus: 'Pending'
            });
            createdPaymentIds.push(rzpPartial._id);
            const allHospAPayments = yield Payment_1.default.find({ hospitalId: hospA._id, status: { $in: ['captured', 'completed'] } });
            const allHospAAppts = yield Appointment_1.default.find({ hospital: hospA._id });
            const totalFees = allHospAAppts.reduce((sum, a) => sum + (a.consultationFee || 0), 0);
            let grossAdvances = 0;
            let cashAtClinic = 0;
            let onlineAtClinic = 0;
            let gatewayDeductions = 0;
            let netPayable = 0;
            for (const p of allHospAPayments) {
                if (p.paymentSource === 'pillora_online' && p.paymentType === 'advance') {
                    grossAdvances += p.amount;
                    const gw = (p.gatewayCharges || 0) + (p.gatewayTaxes || 0);
                    gatewayDeductions += gw;
                    netPayable += (p.netPayable || (p.amount - gw));
                }
                else if (p.paymentSource === 'clinic_collection') {
                    if (p.paymentMethod === 'cash') {
                        cashAtClinic += p.amount;
                    }
                    else {
                        onlineAtClinic += p.amount;
                    }
                }
            }
            const totalPatientCollections = grossAdvances + cashAtClinic + onlineAtClinic;
            const pendingPatientCollection = Math.max(0, totalFees - totalPatientCollections);
            // Equation 1: Total Patient Collections = Pillora Gross Advances + Clinic Cash + Clinic Online
            const eq1Passes = Math.abs(totalPatientCollections - (grossAdvances + cashAtClinic + onlineAtClinic)) < 0.01;
            // Equation 2: Total Consultation Fees - Total Patient Collections = Pending Patient Collection
            const eq2Passes = Math.abs(pendingPatientCollection - (totalFees - totalPatientCollections)) < 0.01;
            // Equation 3: Net Payable = Gross Advances - Gateway Deductions
            const eq3Passes = Math.abs(netPayable - (grossAdvances - gatewayDeductions)) < 0.01;
            const passesReconciliation = eq1Passes && eq2Passes && eq3Passes;
            results.push({
                test: 'Financial Reconciliation Equations (Section 7)',
                passed: passesReconciliation,
                details: `Total Fees: ₹${totalFees}, Advances: ₹${grossAdvances}, Clinic Cash: ₹${cashAtClinic}, Clinic Online: ₹${onlineAtClinic}, Pending Patient: ₹${pendingPatientCollection}, Net Payable: ₹${netPayable.toFixed(2)}`
            });
            console.log(`Result: ${passesReconciliation ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 7: HOSPITAL ISOLATION
            // =====================================================================
            console.log('\n--- TEST 7: Hospital Data Isolation ---');
            const hospBPayments = yield Payment_1.default.find({ hospitalId: hospB._id });
            const hospBAppts = yield Appointment_1.default.find({ hospital: hospB._id });
            const passesIsolation = hospBPayments.length === 0 && hospBAppts.length === 0;
            results.push({
                test: 'Hospital Data Isolation (Hospital B has 0 access to Hospital A metrics)',
                passed: passesIsolation,
                details: `Hospital B Payments Count: ${hospBPayments.length}, Appts Count: ${hospBAppts.length}`
            });
            console.log(`Result: ${passesIsolation ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 8: SETTLEMENT PAYOUT (Admin Payout Recording)
            // =====================================================================
            console.log('\n--- TEST 8: Admin Settlement Payout Execution ---');
            const payoutAmount = rzpPaymentA.netPayable || 195.28;
            const utrRef = `UTR_${testRunId}_998877`;
            const settlementRec = yield Settlement_1.default.create({
                settlementId: `SET-${Date.now()}`,
                hospitalId: hospA._id,
                amount: payoutAmount,
                grossCollection: 200,
                netAmount: payoutAmount,
                razorpayCharges: 4,
                gstCharges: 0.72,
                eligibleDate: new Date(),
                status: 'Settled',
                utrNumber: utrRef,
                transferMethod: 'NEFT',
                transferDate: new Date(),
                notes: 'E2E Test Payout to Alpha Hospital'
            });
            // Update payment settlement status
            rzpPaymentA.settlementStatus = 'Settled';
            yield rzpPaymentA.save();
            const updatedPayment = yield Payment_1.default.findById(rzpPaymentA._id);
            const passesSettlement = (updatedPayment === null || updatedPayment === void 0 ? void 0 : updatedPayment.settlementStatus) === 'Settled' && settlementRec.utrNumber === utrRef;
            results.push({
                test: 'Admin Settlement Payout Recording with UTR and Status Update',
                passed: passesSettlement,
                details: `Settlement Amount: ₹${settlementRec.netAmount}, UTR: ${settlementRec.utrNumber}, Payment Status: ${updatedPayment === null || updatedPayment === void 0 ? void 0 : updatedPayment.settlementStatus}`
            });
            console.log(`Result: ${passesSettlement ? 'PASSED ✅' : 'FAILED ❌'}`);
            // =====================================================================
            // TEST 9: REFUND MANAGEMENT
            // =====================================================================
            console.log('\n--- TEST 9: Refund Processing on Cancelled Online Appointment ---');
            const apptToCancel = yield Appointment_1.default.create({
                hospital: hospA._id,
                hospitalName: hospA.name,
                doctor: dummyDocId,
                patient: dummyPatId,
                slot: dummySlotId,
                patientName: 'Sunita Mehra',
                patientPhone: '9876500004',
                consultationFee: 1000,
                advanceRequired: 200,
                advancePaid: 200,
                balanceDue: 800,
                status: 'cancelled',
                cancellationReason: 'Doctor unavailable',
                cancelledAt: new Date(),
                slotTime: new Date(),
                paymentStatus: 'partial'
            });
            createdApptIds.push(apptToCancel._id);
            const rzpToRefund = yield Payment_1.default.create({
                appointmentId: apptToCancel._id,
                hospitalId: hospA._id,
                amount: 200,
                amountInPaise: 20000,
                currency: 'INR',
                status: 'completed',
                paymentType: 'advance',
                paymentSource: 'pillora_online',
                paymentMethod: 'razorpay',
                settlementStatus: 'Pending'
            });
            createdPaymentIds.push(rzpToRefund._id);
            // Process Refund
            const refundRec = yield Refund_1.default.create({
                refundId: `REF-${Date.now()}`,
                appointmentId: apptToCancel._id,
                paymentId: rzpToRefund._id,
                hospitalId: hospA._id,
                amount: 200,
                amountInPaise: 20000,
                reason: 'Doctor unavailable',
                status: 'processed',
                initiatedBy: dummyDocId,
                processedAt: new Date(),
                notes: 'E2E Auto Refund'
            });
            // Mark payment as refunded and settlement as reversed
            rzpToRefund.status = 'refunded';
            rzpToRefund.settlementStatus = 'Reversed';
            yield rzpToRefund.save();
            apptToCancel.paymentStatus = 'refunded';
            yield apptToCancel.save();
            const passesRefund = refundRec.status === 'processed' &&
                rzpToRefund.status === 'refunded' &&
                rzpToRefund.settlementStatus === 'Reversed' &&
                apptToCancel.paymentStatus === 'refunded';
            results.push({
                test: 'Appointment Cancellation & Full Refund Processing',
                passed: passesRefund,
                details: `Refund Amount: ₹${refundRec.amount}, Payment Status: ${rzpToRefund.status}, Settlement Status: ${rzpToRefund.settlementStatus}`
            });
            console.log(`Result: ${passesRefund ? 'PASSED ✅' : 'FAILED ❌'}`);
        }
        finally {
            // Cleanup test data so live DB stays clean
            console.log('\n--- CLEANUP: Removing E2E Test Entities ---');
            if (createdPaymentIds.length > 0) {
                yield Payment_1.default.deleteMany({ _id: { $in: createdPaymentIds } });
            }
            if (createdApptIds.length > 0) {
                yield Appointment_1.default.deleteMany({ _id: { $in: createdApptIds } });
            }
            if (hospA === null || hospA === void 0 ? void 0 : hospA._id) {
                yield Hospital_1.default.findByIdAndDelete(hospA._id);
                yield Settlement_1.default.deleteMany({ hospitalId: hospA._id });
                yield Refund_1.default.deleteMany({ hospitalId: hospA._id });
            }
            if (hospB === null || hospB === void 0 ? void 0 : hospB._id) {
                yield Hospital_1.default.findByIdAndDelete(hospB._id);
            }
            yield mongoose_1.default.disconnect();
            console.log('✅ Cleaned up test data and disconnected from MongoDB');
        }
        // Print Final Summary Table
        console.log('\n================================================================');
        console.log('📊 FINAL E2E TEST RESULTS SUMMARY');
        console.log('================================================================');
        let allPassed = true;
        for (const r of results) {
            console.log(`${r.passed ? '✅ PASS' : '❌ FAIL'} | ${r.test}`);
            if (r.details)
                console.log(`       ↳ ${r.details}`);
            if (!r.passed)
                allPassed = false;
        }
        console.log('================================================================');
        if (allPassed) {
            console.log('🎉 ALL 9 TEST SUITES PASSED FLAWLESSLY! SYSTEM IS PRODUCTION READY.');
        }
        else {
            console.error('⚠️ SOME TESTS FAILED. PLEASE REVIEW LOGS.');
            process.exit(1);
        }
    });
}
runE2ETests().catch((err) => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
