import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Appointment from '../models/Appointment';
import Payment from '../models/Payment';
import Hospital from '../models/Hospital';
import Settlement from '../models/Settlement';
import Refund from '../models/Refund';
import Doctor from '../models/Doctor';
import User from '../models/User';
import Notification from '../models/Notification';
import { decrypt, encrypt } from '../utils/cryptoHelper';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/authMiddleware';

/**
 * Helper to safely decrypt hospital bank details (handles encrypted or plain text)
 */
export const safeDecryptBankDetails = (bank: any) => {
    if (!bank) return null;
    return {
        accountHolderName: decrypt(bank.accountHolderName || ''),
        bankName: decrypt(bank.bankName || ''),
        branchName: decrypt(bank.branchName || ''),
        accountNumber: decrypt(bank.accountNumber || ''),
        ifscCode: decrypt(bank.ifscCode || ''),
        upiId: decrypt(bank.upiId || '')
    };
};

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_51Mz2wYSHB3q5Xn',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'fallback_secret'
});

/**
 * Robust date-range resolution helper with Asia/Kolkata (IST) day bounds
 */
export const resolveDateRange = (filter?: string, customStart?: string, customEnd?: string) => {
    const now = new Date();
    // Default to beginning of time if no filter
    let start = new Date(0);
    let end = new Date(now.getTime() + 86400000); // end of current day/future bounds

    if (!filter || filter === 'all') {
        return { start, end };
    }

    // Helper for IST midnight
    const getISTDate = (d: Date) => {
        const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
        return new Date(utc + (3600000 * 5.5)); // UTC + 5:30
    };

    if (filter === 'today') {
        const ist = getISTDate(now);
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
    } else if (filter === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        start = new Date(yesterday);
        start.setHours(0, 0, 0, 0);
        end = new Date(yesterday);
        end.setHours(23, 59, 59, 999);
    } else if (filter === 'week' || filter === 'this_week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
        start = new Date(now);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
    } else if (filter === 'month' || filter === 'this_month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
    } else if (filter === 'last_month') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (filter === 'custom' && customStart) {
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        if (customEnd) {
            end = new Date(customEnd);
            end.setHours(23, 59, 59, 999);
        } else {
            end = new Date(now);
            end.setHours(23, 59, 59, 999);
        }
    }

    return { start, end };
};

// ═══════════════════════════════════════════════════════════════════════════════
//  HOSPITAL DASHBOARD – PAYMENTS & COLLECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get Hospital Financial Overview (5 Primary Cards + 4 Additional Indicators)
 * @route   GET /api/hospital/dashboard/financial/overview
 * @access  Private/Hospital
 */
export const getHospitalFinancialOverview = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        if (!hospital?._id) {
            res.status(401).json({ error: 'Hospital not authenticated' });
            return;
        }

        const dateFilter = (req.query.period || req.query.dateFilter || 'this_month') as string;
        const customStart = (req.query.startDate || req.query.customStart) as string;
        const customEnd = (req.query.endDate || req.query.customEnd) as string;

        const { start, end } = resolveDateRange(
            String(dateFilter), 
            customStart ? String(customStart) : undefined, 
            customEnd ? String(customEnd) : undefined
        );

        const hospitalId = hospital._id;

        // 1. Fetch appointments for this hospital in date range (using slotTime or createdAt)
        const appointmentMatch: any = {
            $or: [
                { hospital: hospitalId },
                { hospital: hospitalId.toString() }
            ],
            status: { $ne: 'cancelled' },
            $and: [
                {
                    $or: [
                        { slotTime: { $gte: start, $lte: end } },
                        { createdAt: { $gte: start, $lte: end } }
                    ]
                }
            ]
        };

        const appointments = await Appointment.find(appointmentMatch).lean();

        // 2. Fetch completed payments for this hospital within date range
        const paymentMatch: any = {
            $or: [
                { hospitalId },
                { hospitalId: hospitalId.toString() }
            ],
            status: { $in: ['completed', 'paid'] },
            createdAt: { $gte: start, $lte: end }
        };

        const payments = await Payment.find(paymentMatch).lean();

        // ── Card 1: Total Consultation Fees ──────────────────────────────────────
        let totalConsultationFees = 0;
        for (const app of appointments) {
            totalConsultationFees += (app.consultationFee || 500);
        }

        // ── Card 2: Online Advance via Pillora ────────────────────────────────────
        let onlineAdvanceGross = 0;
        let onlineAdvanceCount = 0;
        let totalGatewayCharges = 0;
        let totalGatewayTaxes = 0;

        // ── Card 4 & 5: Clinic Collections ───────────────────────────────────────
        let clinicCashCollections = 0;
        let clinicCashCount = 0;
        let clinicOnlineCollections = 0;
        let clinicOnlineCount = 0;

        for (const p of payments) {
            const amt = p.amount || 0;
            const isOnlineAdvance = 
                p.paymentSource === 'pillora_online' || 
                p.paymentType === 'advance' || 
                (p.paymentType as any) === 'advance_20' ||
                Boolean(p.razorpayPaymentId || p.razorpayOrderId) ||
                p.mode === 'online';

            if (isOnlineAdvance) {
                onlineAdvanceGross += (p.advanceFee || amt);
                onlineAdvanceCount += 1;
                // Gateway charges (2% fee + 18% GST on fee = 2.36%)
                const charges = p.gatewayCharges || (amt * 0.02);
                const taxes = p.gatewayTaxes || (charges * 0.18);
                totalGatewayCharges += charges;
                totalGatewayTaxes += taxes;
            } else {
                if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                    clinicCashCollections += amt;
                    clinicCashCount += 1;
                } else {
                    clinicOnlineCollections += amt;
                    clinicOnlineCount += 1;
                }
            }
        }

        // Safety fallback: If online advance is 0 from payments but appointments record online advance
        if (onlineAdvanceGross === 0 && appointments.length > 0) {
            for (const app of appointments) {
                if (app.advancePaid && app.advancePaid > 0) {
                    onlineAdvanceGross += app.advancePaid;
                    onlineAdvanceCount += 1;
                    const charges = app.advancePaid * 0.02;
                    const taxes = charges * 0.18;
                    totalGatewayCharges += charges;
                    totalGatewayTaxes += taxes;
                }
            }
        }

        // ── Card 3: Payable from Pillora ─────────────────────────────────────────
        // Net Payable = Successful Online Advances - Applicable Gateway Charges - Applicable Gateway Taxes
        const totalGatewayDeductions = totalGatewayCharges + totalGatewayTaxes;
        const totalNetPayableFromPillora = Math.max(0, onlineAdvanceGross - totalGatewayDeductions);

        // Calculate settlement status breakdown for all online advances of this hospital
        const allOnlineAdvances = await Payment.find({
            $or: [
                { hospitalId },
                { hospitalId: hospitalId.toString() }
            ],
            status: { $in: ['completed', 'paid'] },
            $and: [
                {
                    $or: [
                        { paymentSource: 'pillora_online' },
                        { paymentType: { $in: ['advance', 'advance_20'] } },
                        { razorpayPaymentId: { $exists: true, $ne: '' } },
                        { razorpayOrderId: { $exists: true, $ne: '' } },
                        { mode: 'online' }
                    ]
                }
            ],
            createdAt: { $gte: start, $lte: end }
        }).lean();

        let pendingSettlement = 0;
        let processingSettlement = 0;
        let alreadySettled = 0;

        for (const p of allOnlineAdvances) {
            const amt = p.advanceFee || p.amount || 0;
            const fee = p.gatewayCharges || (amt * 0.02);
            const tax = p.gatewayTaxes || (fee * 0.18);
            const net = Math.max(0, amt - fee - tax);

            const st = p.settlementStatus || 'Pending';
            if (['Pending', 'Waiting for Razorpay Settlement', 'Ready for Settlement'].includes(st)) {
                pendingSettlement += net;
            } else if (['Processing', 'Payment Initiated', 'Awaiting Hospital Confirmation'].includes(st)) {
                processingSettlement += net;
            } else if (['Settled', 'Settlement Completed'].includes(st)) {
                alreadySettled += net;
            }
        }

        // Fallback for pending settlement if payments list is empty but gross advance exists
        if (pendingSettlement === 0 && processingSettlement === 0 && alreadySettled === 0 && totalNetPayableFromPillora > 0) {
            pendingSettlement = totalNetPayableFromPillora;
        }

        // ── Additional Indicators ───────────────────────────────────────────────
        // Total Patient Collections = Pillora Gross Advances + Clinic Cash Collections + Clinic Online Collections
        const totalPatientCollections = onlineAdvanceGross + clinicCashCollections + clinicOnlineCollections;

        // 1. Pending Patient Collection = Total Consultation Fees - Total Patient Collections
        const pendingPatientCollection = Math.max(0, totalConsultationFees - totalPatientCollections);

        // 2. Pillora Settlement Pending = net amount not yet transferred
        const pilloraSettlementPending = pendingSettlement;

        // 3. Total Successfully Settled = already transferred
        const totalSuccessfullySettled = alreadySettled;

        // 4. Total Gateway Charges = charges + applicable taxes
        const totalGatewayChargesSummary = totalGatewayDeductions;

        // ── Daily Breakdown for charts ──────────────────────────────────────────
        const dailyMap: { [date: string]: { date: string; consultationFees: number; onlineAdvance: number; clinicCash: number; clinicOnline: number } } = {};

        for (const app of appointments) {
            const d = new Date(app.slotTime || app.createdAt).toISOString().slice(0, 10);
            if (!dailyMap[d]) dailyMap[d] = { date: d, consultationFees: 0, onlineAdvance: 0, clinicCash: 0, clinicOnline: 0 };
            dailyMap[d].consultationFees += (app.consultationFee || 500);
        }

        for (const p of payments) {
            const d = new Date(p.createdAt).toISOString().slice(0, 10);
            if (!dailyMap[d]) dailyMap[d] = { date: d, consultationFees: 0, onlineAdvance: 0, clinicCash: 0, clinicOnline: 0 };
            const amt = p.amount || 0;
            const isOnline = 
                p.paymentSource === 'pillora_online' || 
                p.paymentType === 'advance' || 
                (p.paymentType as any) === 'advance_20' ||
                Boolean(p.razorpayPaymentId || p.razorpayOrderId) ||
                p.mode === 'online';

            if (isOnline) {
                dailyMap[d].onlineAdvance += amt;
            } else if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                dailyMap[d].clinicCash += amt;
            } else {
                dailyMap[d].clinicOnline += amt;
            }
        }

        const timeSeries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        const responsePayload = {
            success: true,
            dateRange: { filter: dateFilter, start, end },
            cards: {
                totalConsultationFees: Math.round(totalConsultationFees * 100) / 100,
                grossOnlineAdvances: Math.round(onlineAdvanceGross * 100) / 100,
                payableFromPillora: {
                    netPayable: Math.round(totalNetPayableFromPillora * 100) / 100,
                    pendingSettlement: Math.round(pendingSettlement * 100) / 100,
                    processing: Math.round(processingSettlement * 100) / 100,
                    alreadySettled: Math.round(alreadySettled * 100) / 100
                },
                cashAtClinic: Math.round(clinicCashCollections * 100) / 100,
                onlineAtClinic: Math.round(clinicOnlineCollections * 100) / 100
            },
            primaryCards: {
                totalConsultationFees: Math.round(totalConsultationFees * 100) / 100,
                onlineAdvanceViaPillora: {
                    grossAmount: Math.round(onlineAdvanceGross * 100) / 100,
                    transactionCount: onlineAdvanceCount
                },
                payableFromPillora: {
                    netAmount: Math.round(totalNetPayableFromPillora * 100) / 100,
                    breakdown: {
                        pendingSettlement: Math.round(pendingSettlement * 100) / 100,
                        processing: Math.round(processingSettlement * 100) / 100,
                        alreadySettled: Math.round(alreadySettled * 100) / 100
                    }
                },
                collectedAtClinicCash: {
                    amount: Math.round(clinicCashCollections * 100) / 100,
                    transactionCount: clinicCashCount
                },
                collectedAtClinicOnline: {
                    amount: Math.round(clinicOnlineCollections * 100) / 100,
                    transactionCount: clinicOnlineCount
                }
            },
            additionalIndicators: {
                pendingPatientCollection: Math.round(pendingPatientCollection * 100) / 100,
                pilloraSettlementPending: Math.round(pilloraSettlementPending * 100) / 100,
                totalSuccessfullySettled: Math.round(totalSuccessfullySettled * 100) / 100,
                totalGatewayCharges: Math.round(totalGatewayChargesSummary * 100) / 100
            },
            reconciliation: {
                totalConsultationFees: Math.round(totalConsultationFees * 100) / 100,
                totalPatientCollections: Math.round(totalPatientCollections * 100) / 100,
                equationHolds: Math.abs((totalPatientCollections + pendingPatientCollection) - totalConsultationFees) < 1
            },
            timeSeries
        };

        res.status(200).json(responsePayload);
    } catch (error: any) {
        console.error('[GetHospitalFinancialOverviewError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve financial overview', details: error.message });
    }
};

/**
 * @desc    Get Detailed Appointment Payment Records with filtering, pagination & export
 * @route   GET /api/hospital/dashboard/financial/appointments
 * @access  Private/Hospital
 */
export const getHospitalPaymentRecords = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        if (!hospital?._id) {
            res.status(401).json({ error: 'Hospital not authenticated' });
            return;
        }

        const hospitalId = hospital._id;
        const dateFilter = (req.query.period || req.query.dateFilter || 'all') as string;
        const customStart = (req.query.startDate || req.query.customStart) as string;
        const customEnd = (req.query.endDate || req.query.customEnd) as string;
        const {
            paymentMethod,
            paymentStatus,
            settlementStatus,
            doctorId,
            patientName,
            search,
            page = 1,
            limit = 20,
            exportFormat
        } = req.query;

        const { start, end } = resolveDateRange(
            String(dateFilter),
            customStart ? String(customStart) : undefined,
            customEnd ? String(customEnd) : undefined
        );

        // Build appointment match filter
        const query: any = {
            $or: [
                { hospital: hospitalId },
                { hospital: hospitalId.toString() }
            ]
        };

        if (dateFilter !== 'all') {
            query.$or = [
                { slotTime: { $gte: start, $lte: end } },
                { createdAt: { $gte: start, $lte: end } }
            ];
        }

        if (doctorId && doctorId !== 'all') {
            query.doctor = doctorId;
        }

        if (paymentStatus && paymentStatus !== 'all') {
            query.paymentStatus = paymentStatus;
        }

        if (search) {
            const searchRegex = new RegExp(String(search).trim(), 'i');
            query.$or = [
                { patientName: searchRegex },
                { patientPhone: searchRegex },
                { tokenNumber: isNaN(Number(search)) ? undefined : Number(search) }
            ].filter(Boolean);
        } else if (patientName) {
            query.patientName = new RegExp(String(patientName).trim(), 'i');
        }

        // Fetch appointments matching criteria
        const totalAppointments = await Appointment.countDocuments(query);
        const pageNum = Math.max(1, Number(page));
        const pageSize = exportFormat === 'csv' ? 5000 : Math.max(1, Number(limit));
        const skip = (pageNum - 1) * pageSize;

        const appointments = await Appointment.find(query)
            .populate('doctor', 'name specialty fee')
            .populate('patient', 'name phone email')
            .sort({ slotTime: -1, createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean();

        const appointmentIds = appointments.map(a => a._id);
        const payments = await Payment.find({ appointmentId: { $in: appointmentIds } }).lean();

        // Group payments by appointmentId
        const paymentsByAppt: { [id: string]: any[] } = {};
        for (const p of payments) {
            const k = p.appointmentId.toString();
            if (!paymentsByAppt[k]) paymentsByAppt[k] = [];
            paymentsByAppt[k].push(p);
        }

        // Construct detailed records
        const records = appointments.map(app => {
            const apptPayments = paymentsByAppt[app._id.toString()] || [];
            
            const consultationFee = app.consultationFee || (app.doctor as any)?.fee || 500;
            const isOnlineBooking = app.paymentSource === 'gateway' || apptPayments.some(p => p.paymentSource === 'pillora_online');
            const advanceRequired = isOnlineBooking ? Math.round(consultationFee * 0.20) : 0;

            let advancePaid = 0;
            let gatewayCharges = 0;
            let gatewayTaxes = 0;
            let clinicCashCollection = 0;
            let clinicOnlineCollection = 0;
            let settlementStatusVal = 'N/A';
            let transactionDate: Date | null = null;

            for (const p of apptPayments) {
                if (p.status !== 'completed' && p.status !== 'paid') continue;
                
                if (p.createdAt && (!transactionDate || p.createdAt > transactionDate)) {
                    transactionDate = p.createdAt;
                }

                if (p.paymentSource === 'pillora_online' || p.paymentType === 'advance') {
                    advancePaid += (p.advanceFee || p.amount || 0);
                    const fee = p.gatewayCharges || (p.amount * 0.02);
                    const tax = p.gatewayTaxes || (fee * 0.18);
                    gatewayCharges += fee;
                    gatewayTaxes += tax;
                    settlementStatusVal = p.settlementStatus || 'Pending';
                } else if (p.paymentSource === 'clinic_collection' || !p.razorpayPaymentId) {
                    if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                        clinicCashCollection += (p.amount || 0);
                    } else {
                        clinicOnlineCollection += (p.amount || 0);
                    }
                }
            }

            // Fallback from appointment fields if direct payment records missing (legacy compat)
            if (advancePaid === 0 && app.advancePaid) advancePaid = app.advancePaid;
            if (advancePaid > 0 && gatewayCharges === 0) {
                gatewayCharges = advancePaid * 0.02;
                gatewayTaxes = gatewayCharges * 0.18;
            }

            const netAdvancePayable = Math.max(0, advancePaid - (gatewayCharges + gatewayTaxes));
            const balancePaid = (app.balancePaid || 0) + (clinicCashCollection + clinicOnlineCollection);
            const balanceDue = Math.max(0, consultationFee - advancePaid - balancePaid);

            // Canonical payment status
            let canonicalStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
            if (balanceDue === 0 && (advancePaid > 0 || balancePaid > 0)) {
                canonicalStatus = 'paid';
            } else if (advancePaid > 0 || balancePaid > 0) {
                canonicalStatus = 'partial';
            }

            return {
                appointmentId: app._id.toString(),
                tokenNumber: app.tokenNumber || null,
                patientName: app.patientName || (app.patient as any)?.name || 'Guest Patient',
                patientPhone: app.patientPhone || (app.patient as any)?.phone || 'N/A',
                patientEmail: app.patientEmail || (app.patient as any)?.email || 'N/A',
                doctorName: (app.doctor as any)?.name ? `Dr. ${(app.doctor as any).name}` : (app.doctorName || 'Doctor'),
                consultationFee: Math.round(consultationFee * 100) / 100,
                advanceRequired: Math.round(advanceRequired * 100) / 100,
                advancePaid: Math.round(advancePaid * 100) / 100,
                gatewayCharges: Math.round((gatewayCharges + gatewayTaxes) * 100) / 100,
                netAdvancePayable: Math.round(netAdvancePayable * 100) / 100,
                balanceDue: Math.round(balanceDue * 100) / 100,
                balancePaid: Math.round(balancePaid * 100) / 100,
                clinicCashCollection: Math.round(clinicCashCollection * 100) / 100,
                clinicOnlineCollection: Math.round(clinicOnlineCollection * 100) / 100,
                paymentStatus: canonicalStatus,
                settlementStatus: settlementStatusVal,
                appointmentDate: app.slotTime || app.appointmentDate || app.createdAt,
                transactionDate: transactionDate || app.createdAt,
                transactions: apptPayments.map(p => ({
                    transactionId: p.transactionId,
                    amount: p.amount,
                    type: p.paymentType,
                    source: p.paymentSource,
                    method: p.paymentMethod,
                    status: p.status,
                    date: p.createdAt
                }))
            };
        });

        // Apply secondary filter for payment method or settlement status if requested
        let filteredRecords = records;
        if (paymentMethod && paymentMethod !== 'all') {
            filteredRecords = filteredRecords.filter(r => {
                if (paymentMethod === 'razorpay') return r.advancePaid > 0;
                if (paymentMethod === 'cash') return r.clinicCashCollection > 0;
                if (paymentMethod === 'online' || paymentMethod === 'upi' || paymentMethod === 'card') return r.clinicOnlineCollection > 0;
                return true;
            });
        }
        if (settlementStatus && settlementStatus !== 'all') {
            filteredRecords = filteredRecords.filter(r => r.settlementStatus === settlementStatus);
        }

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
            for (const r of filteredRecords) {
                const row = [
                    r.appointmentId,
                    `"${r.patientName.replace(/"/g, '""')}"`,
                    `"${r.doctorName.replace(/"/g, '""')}"`,
                    r.consultationFee,
                    r.advanceRequired,
                    r.advancePaid,
                    r.gatewayCharges,
                    r.netAdvancePayable,
                    r.balanceDue,
                    r.balancePaid,
                    r.clinicCashCollection,
                    r.clinicOnlineCollection,
                    r.paymentStatus,
                    r.settlementStatus,
                    new Date(r.appointmentDate).toISOString().slice(0, 10),
                    new Date(r.transactionDate).toISOString().slice(0, 10)
                ];
                csvRows.push(row.join(','));
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=Pillora_Payments_${new Date().toISOString().slice(0, 10)}.csv`);
            res.status(200).send(csvRows.join('\n'));
            return;
        }

        res.status(200).json({
            success: true,
            records: filteredRecords,
            pagination: {
                total: totalAppointments,
                page: pageNum,
                limit: pageSize,
                totalPages: Math.ceil(totalAppointments / pageSize)
            }
        });
    } catch (error: any) {
        console.error('[GetHospitalPaymentRecordsError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve payment records', details: error.message });
    }
};

/**
 * @desc    Collect Remaining Balance at Clinic (Scenario C)
 * @route   POST /api/hospital/dashboard/appointments/:id/collect-balance
 * @access  Private/Hospital
 */
export const collectClinicBalance = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = (req as any).hospital;
        if (!hospital?._id) {
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

        const appointment = await Appointment.findOne({ _id: id, hospital: hospital._id }).populate('doctor');
        if (!appointment) {
            res.status(404).json({ error: 'Appointment not found for this hospital' });
            return;
        }

        const consultationFee = appointment.consultationFee || (appointment.doctor as any)?.fee || 500;
        const advancePaid = appointment.advancePaid || 0;
        const previousBalancePaid = appointment.balancePaid || 0;
        const currentBalanceDue = Math.max(0, consultationFee - advancePaid - previousBalancePaid);

        if (currentBalanceDue <= 0 && appointment.paymentStatus === 'paid') {
            res.status(400).json({ error: 'This appointment is already fully paid' });
            return;
        }

        // Start session for atomic transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Create immutable Payment record
            const paymentType = (advancePaid > 0) ? 'balance' : 'full';
            const mode = paymentMethod === 'cash' ? 'offline' : 'online';

            const payment = new Payment({
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
                recordedBy: req.user?._id,
                notes: notes || `Clinic collection via ${paymentMethod.toUpperCase()}`
            });

            await payment.save({ session });

            // 2. Update appointment balance & payment status
            const newBalancePaid = previousBalancePaid + amountNum;
            const newBalanceDue = Math.max(0, consultationFee - advancePaid - newBalancePaid);
            const isFullyPaid = newBalanceDue <= 0;

            appointment.balancePaid = newBalancePaid;
            appointment.balanceDue = newBalanceDue;
            appointment.paymentStatus = isFullyPaid ? 'paid' : 'partial';
            appointment.paymentUpdatedAt = new Date();
            appointment.paymentUpdatedBy = req.user?._id;

            await appointment.save({ session });

            await session.commitTransaction();
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
        } catch (txnError: any) {
            await session.abortTransaction();
            session.endSession();
            throw txnError;
        }
    } catch (error: any) {
        console.error('[CollectClinicBalanceError]', error.message || error);
        res.status(500).json({ error: 'Failed to record balance collection', details: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN PANEL – CENTRAL FINANCIAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get Overall Financial Dashboard across all hospitals (Subsection A)
 * @route   GET /api/admin/financial/overview
 * @access  Private/Admin
 */
export const getAdminFinancialOverview = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { dateFilter = 'this_month', customStart, customEnd } = req.query;
        const { start, end } = resolveDateRange(
            String(dateFilter),
            customStart ? String(customStart) : undefined,
            customEnd ? String(customEnd) : undefined
        );

        // Fetch all appointments in date range
        const appointments = await Appointment.find({
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
        const payments = await Payment.find({
            status: { $in: ['completed', 'paid'] },
            createdAt: { $gte: start, $lte: end }
        }).lean();

        let totalOnlineAdvances = 0;
        let onlineAdvancesCount = 0;
        let totalGatewayCharges = 0;
        let totalGatewayTaxes = 0;
        let totalCashCollected = 0;
        let totalOnlineCollectedAtClinic = 0;

        for (const p of payments) {
            const amt = p.amount || 0;
            if (p.paymentSource === 'pillora_online' || (p.razorpayPaymentId && p.paymentType === 'advance')) {
                totalOnlineAdvances += (p.advanceFee || amt);
                onlineAdvancesCount += 1;
                const charge = p.gatewayCharges || (amt * 0.02);
                const tax = p.gatewayTaxes || (charge * 0.18);
                totalGatewayCharges += charge;
                totalGatewayTaxes += tax;
            } else if (p.paymentSource === 'clinic_collection' || !p.razorpayPaymentId) {
                if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                    totalCashCollected += amt;
                } else {
                    totalOnlineCollectedAtClinic += amt;
                }
            }
        }

        const totalGatewayDeductions = totalGatewayCharges + totalGatewayTaxes;
        const totalNetAmountPayable = Math.max(0, totalOnlineAdvances - totalGatewayDeductions);

        // Settlements tracking across all hospitals
        const allOnlineAdvances = await Payment.find({
            status: { $in: ['completed', 'paid'] },
            paymentSource: 'pillora_online',
            createdAt: { $gte: start, $lte: end }
        }).lean();

        let totalPendingSettlements = 0;
        let totalCompletedSettlements = 0;

        for (const p of allOnlineAdvances) {
            const amt = p.advanceFee || p.amount || 0;
            const fee = p.gatewayCharges || (amt * 0.02);
            const tax = p.gatewayTaxes || (fee * 0.18);
            const net = Math.max(0, amt - fee - tax);

            const st = p.settlementStatus || 'Pending';
            if (['Pending', 'Waiting for Razorpay Settlement', 'Ready for Settlement', 'Processing', 'Payment Initiated', 'Awaiting Hospital Confirmation'].includes(st)) {
                totalPendingSettlements += net;
            } else if (['Settled', 'Settlement Completed'].includes(st)) {
                totalCompletedSettlements += net;
            }
        }

        const hospitalCount = await Hospital.countDocuments();

        res.status(200).json({
            success: true,
            dateRange: { filter: dateFilter, start, end },
            summary: {
                totalConsultationFees: Math.round(totalConsultationFees * 100) / 100,
                totalOnlineAdvances: Math.round(totalOnlineAdvances * 100) / 100,
                totalNetPayableToHospitals: Math.round(totalNetAmountPayable * 100) / 100,
                totalCashCollectedAtHospitals: Math.round(totalCashCollected * 100) / 100,
                totalOnlineCollectedAtHospitals: Math.round(totalOnlineCollectedAtClinic * 100) / 100,
                totalGatewayCharges: Math.round(totalGatewayDeductions * 100) / 100,
                totalPendingHospitalSettlements: Math.round(totalPendingSettlements * 100) / 100,
                totalCompletedHospitalSettlements: Math.round(totalCompletedSettlements * 100) / 100,
                hospitalCount,
                transactionCount: payments.length,
                appointmentCount: appointments.length
            }
        });
    } catch (error: any) {
        console.error('[GetAdminFinancialOverviewError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve admin financial overview', details: error.message });
    }
};

/**
 * @desc    Get Hospital-wise Financial Reports (Subsection B)
 * @route   GET /api/admin/financial/hospital/:hospitalId
 * @access  Private/Admin
 */
export const getAdminHospitalFinancialReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { hospitalId } = req.params;
        const { dateFilter = 'all', customStart, customEnd } = req.query;
        const { start, end } = resolveDateRange(
            String(dateFilter),
            customStart ? String(customStart) : undefined,
            customEnd ? String(customEnd) : undefined
        );

        const hospital = await Hospital.findById(hospitalId).lean();
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }

        // Match queries
        const apptQuery: any = { hospital: hospital._id, status: { $ne: 'cancelled' } };
        const payQuery: any = { hospitalId: hospital._id, status: { $in: ['completed', 'paid'] } };

        if (dateFilter !== 'all') {
            apptQuery.$or = [{ slotTime: { $gte: start, $lte: end } }, { createdAt: { $gte: start, $lte: end } }];
            payQuery.createdAt = { $gte: start, $lte: end };
        }

        const appointments = await Appointment.find(apptQuery).populate('doctor', 'name specialty fee').lean();
        const payments = await Payment.find(payQuery).lean();
        const settlements = await Settlement.find({ hospitalId: hospital._id }).sort({ createdAt: -1 }).lean();

        let totalConsultationFees = 0;
        for (const a of appointments) {
            totalConsultationFees += (a.consultationFee || 500);
        }

        let onlineAdvanceCount = 0;
        let grossOnlineAdvances = 0;
        let gatewayCharges = 0;
        let gatewayTaxes = 0;
        let cashAtClinic = 0;
        let onlineAtClinic = 0;

        for (const p of payments) {
            const amt = p.amount || 0;
            const isOnlineAdvance = p.paymentSource === 'pillora_online' || 
                                    (p.razorpayPaymentId && (p.paymentType === 'advance' || (p.paymentType as any) === 'advance_20')) || 
                                    p.mode === 'online';

            if (isOnlineAdvance) {
                onlineAdvanceCount++;
                grossOnlineAdvances += amt;
                const c = p.gatewayCharges || Math.round(amt * 0.02 * 100) / 100;
                const t = p.gatewayTaxes || Math.round(c * 0.18 * 100) / 100;
                gatewayCharges += c;
                gatewayTaxes += t;
            } else if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                cashAtClinic += amt;
            } else {
                onlineAtClinic += amt;
            }
        }

        const totalGatewayDeductions = gatewayCharges + gatewayTaxes;
        const totalNetAdvances = Math.max(0, grossOnlineAdvances - totalGatewayDeductions);

        let alreadySettled = 0;
        let awaitingConfirmation = 0;
        const settledPaymentIdSet = new Set<string>();

        for (const s of settlements) {
            if (s.status === 'Settlement Completed') {
                alreadySettled += (s.netAmount || 0);
                if (Array.isArray(s.paymentIds)) {
                    s.paymentIds.forEach((pid: any) => settledPaymentIdSet.add(String(pid)));
                }
            } else if (s.status === 'Awaiting Hospital Confirmation') {
                awaitingConfirmation += (s.netAmount || 0);
                if (Array.isArray(s.paymentIds)) {
                    s.paymentIds.forEach((pid: any) => settledPaymentIdSet.add(String(pid)));
                }
            }
        }

        let pendingSettlement = 0;

        for (const p of payments) {
            const isOnlineAdvance = p.paymentSource === 'pillora_online' || 
                                    (p.razorpayPaymentId && (p.paymentType === 'advance' || (p.paymentType as any) === 'advance_20')) || 
                                    p.mode === 'online';

            if (isOnlineAdvance) {
                const isAlreadyHandled = settledPaymentIdSet.has(String(p._id)) || 
                                         ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation'].includes(p.settlementStatus);

                if (!isAlreadyHandled && !['refunded', 'not_applicable'].includes(p.settlementStatus)) {
                    const amt = p.amount || 0;
                    const c = p.gatewayCharges || Math.round(amt * 0.02 * 100) / 100;
                    const t = p.gatewayTaxes || Math.round(c * 0.18 * 100) / 100;
                    const net = Math.max(0, amt - (c + t));
                    pendingSettlement += net;
                }
            }
        }

        // Fallback for alreadySettled if settlements collection had no records but payments are marked Settled
        if (alreadySettled === 0) {
            for (const p of payments) {
                const isOnlineAdvance = p.paymentSource === 'pillora_online' || 
                                        (p.razorpayPaymentId && (p.paymentType === 'advance' || (p.paymentType as any) === 'advance_20')) || 
                                        p.mode === 'online';
                if (isOnlineAdvance && ['Settled', 'Settlement Completed'].includes(p.settlementStatus)) {
                    const amt = p.amount || 0;
                    const c = p.gatewayCharges || Math.round(amt * 0.02 * 100) / 100;
                    const t = p.gatewayTaxes || Math.round(c * 0.18 * 100) / 100;
                    alreadySettled += Math.max(0, amt - (c + t));
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
                bankDetails: safeDecryptBankDetails(hospital.bankDetails)
            },
            financialSummary: {
                totalConsultationFees: Math.round(totalConsultationFees * 100) / 100,
                onlineAdvanceCount,
                grossOnlineAdvances: Math.round(grossOnlineAdvances * 100) / 100,
                gatewayCharges: Math.round(totalGatewayDeductions * 100) / 100,
                totalNetAdvances: Math.round(totalNetAdvances * 100) / 100,
                netPayable: Math.round(netPayable * 100) / 100,
                cashAtClinic: Math.round(cashAtClinic * 100) / 100,
                onlineAtClinic: Math.round(onlineAtClinic * 100) / 100,
                totalPatientCollections: Math.round(totalPatientCollections * 100) / 100,
                pendingPatientCollection: Math.round(pendingPatientCollection * 100) / 100,
                alreadySettled: Math.round(alreadySettled * 100) / 100,
                awaitingConfirmation: Math.round(awaitingConfirmation * 100) / 100,
                pendingSettlement: Math.round(pendingSettlement * 100) / 100
            },
            recentTransactions: payments.slice(0, 50),
            settlementHistory: settlements
        });
    } catch (error: any) {
        console.error('[GetAdminHospitalFinancialReportError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve hospital financial report', details: error.message });
    }
};

/**
 * @desc    Get Settlement Management List across all hospitals (Subsection C)
 * @route   GET /api/admin/financial/settlements
 * @access  Private/Admin
 */
export const getAdminSettlementManagement = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { dateFilter = 'all', customStart, customEnd, status } = req.query;
        const { start, end } = resolveDateRange(
            String(dateFilter),
            customStart ? String(customStart) : undefined,
            customEnd ? String(customEnd) : undefined
        );

        const hospitals = await Hospital.find().select('name address phone email bankDetails').lean();

        const settlementList = [];

        for (const hosp of hospitals) {
            const payQuery: any = {
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

            const payments = await Payment.find(payQuery).lean();

            let grossAdvances = 0;
            let gatewayCharges = 0;
            let alreadySettled = 0;
            let pendingSettlement = 0;
            let awaitingConfirmation = 0;
            let earliestPendingDate: Date | null = null;

            // Fetch hospital settlement records for exact settled amounts
            const hospSettlements = await Settlement.find({ hospitalId: hosp._id }).lean();
            const settledPaymentIdSet = new Set<string>();

            for (const s of hospSettlements) {
                if (s.status === 'Settlement Completed') {
                    alreadySettled += (s.netAmount || 0);
                    if (Array.isArray(s.paymentIds)) {
                        s.paymentIds.forEach((pid: any) => settledPaymentIdSet.add(String(pid)));
                    }
                } else if (s.status === 'Awaiting Hospital Confirmation') {
                    awaitingConfirmation += (s.netAmount || 0);
                    if (Array.isArray(s.paymentIds)) {
                        s.paymentIds.forEach((pid: any) => settledPaymentIdSet.add(String(pid)));
                    }
                }
            }

            for (const p of payments) {
                const amt = p.amount || 0;
                grossAdvances += amt;
                const charge = p.gatewayCharges || Math.round(amt * 0.02 * 100) / 100;
                const tax = p.gatewayTaxes || Math.round(charge * 0.18 * 100) / 100;
                const totalDeduction = charge + tax;
                gatewayCharges += totalDeduction;

                const net = Math.max(0, amt - totalDeduction);
                const st = p.settlementStatus || 'Pending';

                const isAlreadyHandled = settledPaymentIdSet.has(String(p._id)) || 
                                         ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation'].includes(st);

                if (!isAlreadyHandled && !['refunded', 'not_applicable'].includes(st)) {
                    pendingSettlement += net;
                    if (!earliestPendingDate || p.createdAt < earliestPendingDate) {
                        earliestPendingDate = p.createdAt;
                    }
                }
            }

            // Fallback for alreadySettled if settlements collection had no records but payments are marked Settled
            if (alreadySettled === 0) {
                for (const p of payments) {
                    const st = p.settlementStatus || 'Pending';
                    if (['Settled', 'Settlement Completed'].includes(st)) {
                        const amt = p.amount || 0;
                        const charge = p.gatewayCharges || Math.round(amt * 0.02 * 100) / 100;
                        const tax = p.gatewayTaxes || Math.round(charge * 0.18 * 100) / 100;
                        alreadySettled += Math.max(0, amt - (charge + tax));
                    }
                }
            }

            const netPayable = Math.max(0, grossAdvances - gatewayCharges);

            // Latest settlement record for this hospital
            const latestSettlement = await Settlement.findOne({ hospitalId: hosp._id }).sort({ createdAt: -1 }).lean();

            let calculatedStatus = 'Pending';
            if (latestSettlement?.status === 'Awaiting Hospital Confirmation' || awaitingConfirmation > 0) {
                calculatedStatus = 'Awaiting Hospital Confirmation';
            } else if (pendingSettlement === 0 && alreadySettled > 0) {
                calculatedStatus = 'Settled';
            } else if (latestSettlement?.status === 'Processing') {
                calculatedStatus = 'Processing';
            } else if (pendingSettlement > 0) {
                calculatedStatus = 'Pending';
            }

            // Filter by settlement status if requested
            if (status && status !== 'all' && calculatedStatus !== status && latestSettlement?.status !== status) {
                continue;
            }

            const decryptedBank = safeDecryptBankDetails(hosp.bankDetails);

            settlementList.push({
                hospitalId: hosp._id,
                hospitalName: hosp.name,
                advanceCount: payments.length,
                totalGrossAdvances: Math.round(grossAdvances * 100) / 100,
                gatewayCharges: Math.round(gatewayCharges * 100) / 100,
                netPayable: Math.round(netPayable * 100) / 100,
                alreadySettled: Math.round(alreadySettled * 100) / 100,
                pendingSettlement: Math.round(pendingSettlement * 100) / 100,
                settlementDate: latestSettlement?.transferDate || null,
                bankTransactionReference: latestSettlement?.utrNumber || 'N/A',
                settlementStatus: calculatedStatus,
                hasBankDetails: Boolean(decryptedBank?.accountNumber),
                bankDetails: decryptedBank,
                eligibleDate: earliestPendingDate ? new Date(earliestPendingDate.getTime() + (2 * 86400000)) : null
            });
        }

        res.status(200).json({
            success: true,
            settlements: settlementList
        });
    } catch (error: any) {
        console.error('[GetAdminSettlementManagementError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve settlements management data', details: error.message });
    }
};

/**
 * @desc    Record/Initiate Settlement Payout for a Hospital (Subsection C)
 * @route   POST /api/admin/financial/settlements/payout
 * @access  Private/Admin
 */
export const recordAdminSettlementPayout = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const {
            hospitalId,
            transferMethod = 'NEFT',
            utrNumber,
            transferDate = new Date(),
            notes,
            amount
        } = req.body;

        if (!hospitalId || !utrNumber) {
            res.status(400).json({ error: 'Hospital ID and UTR/Bank Reference number are required' });
            return;
        }

        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }

        // Find all pending payments for this hospital
        const pendingPayments = await Payment.find({
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
            const amt = p.amount || 0;
            totalGross += amt;
            const c = p.gatewayCharges || (amt * 0.02);
            const t = p.gatewayTaxes || (c * 0.18);
            totalCharges += c;
            totalTaxes += t;
        }

        const netPayable = Math.max(0, totalGross - (totalCharges + totalTaxes));
        const payoutAmount = amount ? Number(amount) : netPayable;

        // Generate Settlement ID: SET-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase();
        const settlementId = `SET-${dateStr}-${randomStr}`;

        // Create Settlement document
        const settlement = new Settlement({
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
                performedBy: req.user?._id,
                action: 'MANUAL_SETTLEMENT_RECORDED',
                previousStatus: 'Pending',
                newStatus: 'Settled',
                notes: `Transferred ₹${payoutAmount} via ${transferMethod} UTR: ${utrNumber}`,
                timestamp: new Date()
            }]
        });

        await settlement.save();

        // Update all linked payments to Settled
        await Payment.updateMany(
            { _id: { $in: pendingPayments.map(p => p._id) } },
            {
                $set: {
                    settlementStatus: 'Settled',
                    settlementId: settlement._id,
                    settlementDate: new Date(transferDate)
                }
            }
        );

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
    } catch (error: any) {
        console.error('[RecordAdminSettlementPayoutError]', error.message || error);
        res.status(500).json({ error: 'Failed to record settlement payout', details: error.message });
    }
};

/**
 * @desc    Update Hospital Bank Account Details (Admin)
 * @route   PUT /api/admin/financial/hospital/:hospitalId/bank-details
 * @access  Private/Admin
 */
export const updateHospitalBankDetailsAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { hospitalId } = req.params;
        const { accountHolderName, bankName, branchName, accountNumber, ifscCode, upiId } = req.body;

        if (!hospitalId) {
            res.status(400).json({ error: 'Hospital ID is required' });
            return;
        }

        const hospital = await Hospital.findById(hospitalId);
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

        await hospital.save();

        res.status(200).json({
            success: true,
            message: 'Hospital bank account details updated successfully',
            bankDetails: hospital.bankDetails
        });
    } catch (error: any) {
        console.error('[UpdateHospitalBankDetailsAdminError]', error.message || error);
        res.status(500).json({ error: 'Failed to update hospital bank details', details: error.message });
    }
};

/**
 * @desc    Calculate settlement amount for a hospital in a custom date range
 * @route   GET /api/admin/financial/hospital/:hospitalId/settlement-calculate
 * @access  Private/Admin
 */
export const calculateHospitalSettlementForDateRange = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { hospitalId } = req.params;
        const { startDate, endDate } = req.query;

        if (!hospitalId) {
            res.status(400).json({ error: 'Hospital ID is required' });
            return;
        }

        const hospital = await Hospital.findById(hospitalId).lean();
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }

        let start: Date;
        let end: Date;

        if (startDate) {
            start = new Date(String(startDate));
            start.setHours(0, 0, 0, 0);
        } else {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        }

        if (endDate) {
            end = new Date(String(endDate));
            end.setHours(23, 59, 59, 999);
        } else {
            end = new Date();
            end.setHours(23, 59, 59, 999);
        }

        // Find all online advances within this date range that are not already settled or awaiting confirmation
        const query: any = {
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

        const payments = await Payment.find(query)
            .populate('appointmentId', 'tokenNumber patientName slotTime consultationFee')
            .sort({ createdAt: -1 })
            .lean();

        let totalGross = 0;
        let totalDeductions = 0;
        let totalNet = 0;

        const paymentBreakdown = payments.map((p) => {
            const amt = p.amount || p.advanceFee || 0;
            const charge = Math.round(amt * 0.02 * 100) / 100;
            const gst = Math.round(charge * 0.18 * 100) / 100;
            const deduction = Math.round((charge + gst) * 100) / 100; // 2.36%
            const net = Math.max(0, Math.round((amt - deduction) * 100) / 100);

            totalGross += amt;
            totalDeductions += deduction;
            totalNet += net;

            const appt = p.appointmentId as any;
            return {
                paymentId: p._id,
                transactionId: p.transactionId || `TXN-${p._id}`,
                razorpayPaymentId: p.razorpayPaymentId || 'N/A',
                appointmentId: appt?._id || p.appointmentId,
                tokenNumber: appt?.tokenNumber || null,
                patientName: p.patientName || appt?.patientName || 'Patient',
                consultationFee: appt?.consultationFee || 500,
                advancePaid: amt,
                gatewayCharge: deduction,
                netPayable: net,
                settlementStatus: p.settlementStatus || 'Pending',
                createdAt: p.createdAt
            };
        });

        res.status(200).json({
            success: true,
            hospital: {
                _id: hospital._id,
                name: hospital.name,
                bankDetails: safeDecryptBankDetails(hospital.bankDetails)
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
    } catch (error: any) {
        console.error('[CalculateHospitalSettlementForDateRangeError]', error.message || error);
        res.status(500).json({ error: 'Failed to calculate settlement', details: error.message });
    }
};

/**
 * @desc    Send Settlement Request to Hospital (sets status to 'Awaiting Hospital Confirmation')
 * @route   POST /api/admin/financial/hospital/:hospitalId/send-settlement-request
 * @access  Private/Admin
 */
export const sendSettlementRequestToHospital = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { hospitalId } = req.params;
        const {
            startDate,
            endDate,
            amount,
            transferMethod = 'NEFT',
            utrNumber,
            notes,
            paymentIds
        } = req.body;

        if (!hospitalId || !utrNumber) {
            res.status(400).json({ error: 'Hospital ID and UTR / Bank Reference number are mandatory' });
            return;
        }

        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            res.status(404).json({ error: 'Hospital not found' });
            return;
        }

        let start: Date;
        let end: Date;

        if (startDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
        } else {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        }

        if (endDate) {
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            end = new Date();
            end.setHours(23, 59, 59, 999);
        }

        // Query eligible payments (excluding already settled or awaiting confirmation)
        let eligiblePayments: any[] = [];
        if (Array.isArray(paymentIds) && paymentIds.length > 0) {
            eligiblePayments = await Payment.find({
                _id: { $in: paymentIds },
                hospitalId: hospital._id,
                settlementStatus: { $nin: ['Settled', 'Settlement Completed', 'Awaiting Hospital Confirmation', 'refunded', 'not_applicable'] }
            });
        } else {
            eligiblePayments = await Payment.find({
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
            totalGross += amt;
            const c = Math.round(amt * 0.02 * 100) / 100;
            const t = Math.round(c * 0.18 * 100) / 100;
            totalCharges += c;
            totalGst += t;
        }

        const netCalc = Math.max(0, Math.round((totalGross - (totalCharges + totalGst)) * 100) / 100);
        const payoutAmount = amount ? Math.round(Number(amount) * 100) / 100 : netCalc;

        // Generate SET-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase();
        const settlementId = `SET-${dateStr}-${randomStr}`;

        const validMethods = ['NEFT', 'RTGS', 'IMPS', 'UPI'];
        const chosenMethod = validMethods.includes(transferMethod) ? transferMethod : 'NEFT';

        const settlement = new Settlement({
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
            notes: notes?.trim() || `Transferred via ${chosenMethod} UTR: ${utrNumber}`,
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
                    performedBy: req.user?._id,
                    action: 'SEND_SETTLEMENT_REQUEST',
                    previousStatus: 'Pending',
                    newStatus: 'Awaiting Hospital Confirmation',
                    notes: `Pillora Admin sent settlement request for ₹${payoutAmount.toFixed(2)} via ${chosenMethod} UTR: ${utrNumber}`,
                    timestamp: new Date()
                }
            ]
        });

        await settlement.save();

        // Mark all payments as Awaiting Hospital Confirmation
        await Payment.updateMany(
            { _id: { $in: eligiblePayments.map(p => p._id) } },
            {
                $set: {
                    settlementStatus: 'Awaiting Hospital Confirmation',
                    settlementId: settlement._id
                }
            }
        );

        // Notify Hospital User
        if (hospital.user) {
            await Notification.create({
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
    } catch (error: any) {
        console.error('[SendSettlementRequestToHospitalError]', error.message || error);
        res.status(500).json({ error: 'Failed to send settlement request', details: error.message });
    }
};

/**
 * @desc    Get Master Transaction Ledger across all hospitals (Subsection D)
 * @route   GET /api/admin/financial/transactions
 * @access  Private/Admin
 */
export const getAdminTransactionsLedger = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const {
            hospitalId,
            paymentType,
            paymentSource,
            paymentMethod,
            status,
            settlementStatus,
            search,
            dateFilter = 'all',
            customStart,
            customEnd,
            page = 1,
            limit = 25
        } = req.query;

        const { start, end } = resolveDateRange(
            String(dateFilter),
            customStart ? String(customStart) : undefined,
            customEnd ? String(customEnd) : undefined
        );

        const query: any = {};

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

        const totalTransactions = await Payment.countDocuments(query);

        const transactions = await Payment.find(query)
            .populate('hospitalId', 'name address')
            .populate('appointmentId', 'tokenNumber slotTime status patientName')
            .populate('recordedBy', 'name email role')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean();

        res.status(200).json({
            success: true,
            transactions: transactions.map(t => ({
                _id: t._id,
                transactionId: t.transactionId || `TXN-${t._id}`,
                razorpayPaymentId: t.razorpayPaymentId || 'N/A',
                razorpayOrderId: t.razorpayOrderId || 'N/A',
                appointmentId: (t.appointmentId as any)?._id || t.appointmentId,
                tokenNumber: (t.appointmentId as any)?.tokenNumber || null,
                hospitalId: (t.hospitalId as any)?._id || t.hospitalId,
                hospitalName: (t.hospitalId as any)?.name || 'Unknown Hospital',
                patientName: t.patientName || (t.appointmentId as any)?.patientName || 'Patient',
                amount: t.amount,
                amountInPaise: t.amountInPaise || Math.round(t.amount * 100),
                paymentType: t.paymentType || (t.paymentSource === 'pillora_online' ? 'advance' : 'full'),
                paymentSource: t.paymentSource || (t.razorpayPaymentId ? 'pillora_online' : 'clinic_collection'),
                paymentMethod: t.paymentMethod || (t.mode === 'offline' ? 'cash' : 'razorpay'),
                gatewayCharges: t.gatewayCharges || 0,
                gatewayTaxes: t.gatewayTaxes || 0,
                netPayable: t.netPayable || 0,
                status: t.status,
                settlementStatus: t.settlementStatus || 'N/A',
                createdAt: t.createdAt,
                recordedBy: (t.recordedBy as any)?.name || null,
                notes: t.notes || ''
            })),
            pagination: {
                total: totalTransactions,
                page: pageNum,
                limit: pageSize,
                totalPages: Math.ceil(totalTransactions / pageSize)
            }
        });
    } catch (error: any) {
        console.error('[GetAdminTransactionsLedgerError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve transaction ledger', details: error.message });
    }
};

/**
 * @desc    Get Refund Management Records (Subsection E)
 * @route   GET /api/admin/financial/refunds
 * @access  Private/Admin
 */
export const getAdminRefunds = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const refunds = await Refund.find()
            .populate('appointmentId', 'tokenNumber slotTime patientName patientPhone consultationFee status')
            .populate('hospitalId', 'name')
            .populate('initiatedBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        // Also fetch cancelled appointments that have completed online advance payments but not yet refunded
        const cancelledWithPayments = await Appointment.find({
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
    } catch (error: any) {
        console.error('[GetAdminRefundsError]', error.message || error);
        res.status(500).json({ error: 'Failed to retrieve refund records', details: error.message });
    }
};

/**
 * @desc    Process Refund for an Appointment (Subsection E)
 * @route   POST /api/admin/financial/refunds/process
 * @access  Private/Admin
 */
export const processAdminRefund = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { appointmentId, reason, amount } = req.body;

        if (!appointmentId || !reason) {
            res.status(400).json({ error: 'Appointment ID and refund reason are required' });
            return;
        }

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }

        // Find completed online payment to refund
        const payment = await Payment.findOne({
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
                const rzpRefund = await razorpay.payments.refund(payment.razorpayPaymentId, {
                    amount: refundPaise,
                    notes: {
                        reason,
                        appointmentId: appointment._id.toString()
                    }
                });
                gatewayRefundId = rzpRefund.id;
            } catch (rzpErr: any) {
                console.warn('[RazorpayRefundNotice]', rzpErr.message || rzpErr);
                gatewayRefundId = `RZP_REF_${Date.now()}`;
            }
        }

        // Generate Unique Refund ID
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase();
        const refundId = `REF-${dateStr}-${randomStr}`;

        // Create Refund record
        const refundRecord = new Refund({
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
            initiatedBy: req.user?._id,
            processedAt: new Date(),
            notes: reason
        });

        await refundRecord.save();

        // Update Payment record
        payment.status = 'refunded';
        payment.settlementStatus = 'refunded';
        payment.refundDetails = {
            refundId,
            reason,
            amount: refundAmt,
            refundedAt: new Date()
        };
        await payment.save();

        // Update Appointment
        appointment.status = 'cancelled';
        appointment.paymentStatus = 'waived';
        await appointment.save();

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
    } catch (error: any) {
        console.error('[ProcessAdminRefundError]', error.message || error);
        res.status(500).json({ error: 'Failed to process refund', details: error.message });
    }
};

