/**
 * Pillora Unified Financial Calculation Engine
 * 
 * Single source of truth for:
 * 1. 20% Online Advance vs Clinic Collections
 * 2. 2.36% Gateway Charges (2% Razorpay Fee + 18% GST on fee) with integer paise precision
 * 3. Canonical Settlement State Machine (Pending, Processing, Settled, Failed, not_applicable)
 * 4. Reconciliation between Overview Cards and Detailed Transaction Records
 */

export interface GatewaySplit {
    grossAmount: number; // in INR
    fee: number; // 2% fee in INR
    tax: number; // 18% GST on 2% fee in INR
    gatewayCharges: number; // 2.36% total deduction in INR
    netPayable: number; // Net amount payable to hospital in INR
    paise: {
        gross: number;
        fee: number;
        tax: number;
        deductions: number;
        net: number;
    };
}

export type CanonicalSettlementStatus = 'Pending' | 'Processing' | 'Settled' | 'Failed' | 'not_applicable';
export type CanonicalPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'waived' | 'refunded';

export interface ProcessedAppointmentRecord {
    appointmentId: string;
    tokenNumber?: string | number | null;
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    doctorId?: string;
    doctorName: string;
    consultationFee: number;
    advanceRequired: number;
    advancePaid: number;
    gatewayCharges: number;
    netAdvancePayable: number;
    balanceDue: number;
    balancePaid: number;
    clinicCashCollection: number;
    clinicOnlineCollection: number;
    paymentStatus: CanonicalPaymentStatus;
    settlementStatus: CanonicalSettlementStatus;
    appointmentDate: Date | string;
    transactionDate?: Date | string;
    transactions: Array<{
        transactionId: string;
        amount: number;
        type: string;
        source: string;
        method: string;
        status: string;
        settlementStatus?: string;
        date: Date | string;
    }>;
}

export interface FinancialOverviewSummary {
    cards: {
        totalConsultationFees: number;
        grossOnlineAdvances: number;
        payableFromPillora: {
            netPayable: number;
            pendingSettlement: number;
            processing: number;
            alreadySettled: number;
            failedSettlement?: number;
        };
        cashAtClinic: number;
        onlineAtClinic: number;
    };
    primaryCards: {
        totalConsultationFees: number;
        onlineAdvanceViaPillora: {
            grossAmount: number;
            transactionCount: number;
        };
        payableFromPillora: {
            netAmount: number;
            breakdown: {
                pendingSettlement: number;
                processing: number;
                alreadySettled: number;
                failedSettlement?: number;
            };
        };
        collectedAtClinicCash: {
            amount: number;
            transactionCount: number;
        };
        collectedAtClinicOnline: {
            amount: number;
            transactionCount: number;
        };
    };
    additionalIndicators: {
        pendingPatientCollection: number;
        pilloraSettlementPending: number;
        totalSuccessfullySettled: number;
        totalGatewayCharges: number;
    };
    reconciliation: {
        totalConsultationFees: number;
        totalPatientCollections: number;
        pendingPatientCollection: number;
        totalNetAdvance: number;
        netSettlementSum: number;
        equationHolds: boolean;
    };
}

/**
 * Calculate exact 2.36% gateway charges using integer paise arithmetic
 * - Advance: ₹20 -> 2000 paise
 * - Fee (2%): 40 paise (₹0.40)
 * - Tax (18% of 2%): 7 paise (₹0.07)
 * - Total Gateway Charges: 47 paise (₹0.47)
 * - Net Advance: 1953 paise (₹19.53)
 */
export const calculateAdvanceGatewaySplit = (amountInRupees: number): GatewaySplit => {
    const grossNum = Number(amountInRupees) || 0;
    const advancePaise = Math.round(grossNum * 100);
    const feePaise = Math.round(advancePaise * 0.02);
    const taxPaise = Math.round(feePaise * 0.18);
    const deductionPaise = feePaise + taxPaise;
    const netPaise = Math.max(0, advancePaise - deductionPaise);

    return {
        grossAmount: Math.round(grossNum * 100) / 100,
        fee: feePaise / 100,
        tax: taxPaise / 100,
        gatewayCharges: deductionPaise / 100,
        netPayable: netPaise / 100,
        paise: {
            gross: advancePaise,
            fee: feePaise,
            tax: taxPaise,
            deductions: deductionPaise,
            net: netPaise
        }
    };
};

/**
 * Standard detector for online advance payments collected via Pillora
 */
export const isOnlineAdvancePayment = (p: any): boolean => {
    if (!p) return false;
    return (
        p.paymentSource === 'pillora_online' ||
        p.paymentType === 'advance' ||
        p.paymentType === 'advance_20' ||
        Boolean(p.razorpayPaymentId) ||
        Boolean(p.razorpayOrderId) ||
        (p.mode === 'online' && p.paymentSource !== 'clinic_collection')
    );
};

/**
 * Map any raw settlement status string to one of the 5 canonical statuses
 */
export const normalizeSettlementStatus = (rawStatus?: string | null, hasOnlineAdvance: boolean = true): CanonicalSettlementStatus => {
    if (!hasOnlineAdvance) return 'not_applicable';
    const s = String(rawStatus || '').trim().toLowerCase();

    if (s === 'settled' || s === 'settlement completed' || s === 'completed') {
        return 'Settled';
    }
    if (
        s === 'processing' ||
        s === 'payment initiated' ||
        s === 'awaiting hospital confirmation' ||
        s === 'in_progress'
    ) {
        return 'Processing';
    }
    if (s === 'failed' || s === 'rejected' || s === 'reversed') {
        return 'Failed';
    }
    if (s === 'not_applicable') {
        return 'not_applicable';
    }
    // Default for active advance
    return 'Pending';
};

/**
 * Resolve exact Asia/Kolkata (IST = UTC+5:30) date range bounds
 */
export const resolveISTDateRange = (filter?: string, customStart?: string, customEnd?: string): { start: Date; end: Date } => {
    const now = new Date();
    // Default bounds (all time)
    let start = new Date(0);
    let end = new Date(now.getTime() + 86400000);

    if (!filter || filter === 'all') {
        return { start, end };
    }

    // Convert UTC Date to IST calendar parts
    const IST_OFFSET_MS = 5.5 * 3600 * 1000;
    const toISTParts = (d: Date) => {
        const istDate = new Date(d.getTime() + IST_OFFSET_MS);
        return {
            year: istDate.getUTCFullYear(),
            month: istDate.getUTCMonth(),
            day: istDate.getUTCDate()
        };
    };

    const fromISTParts = (year: number, month: number, day: number, isEndOfDay: boolean = false): Date => {
        if (isEndOfDay) {
            return new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - IST_OFFSET_MS);
        }
        return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS);
    };

    const currentIST = toISTParts(now);

    if (filter === 'today') {
        start = fromISTParts(currentIST.year, currentIST.month, currentIST.day, false);
        end = fromISTParts(currentIST.year, currentIST.month, currentIST.day, true);
    } else if (filter === 'yesterday') {
        const yDate = new Date(Date.UTC(currentIST.year, currentIST.month, currentIST.day - 1));
        start = fromISTParts(yDate.getUTCFullYear(), yDate.getUTCMonth(), yDate.getUTCDate(), false);
        end = fromISTParts(yDate.getUTCFullYear(), yDate.getUTCMonth(), yDate.getUTCDate(), true);
    } else if (filter === 'week' || filter === 'this_week') {
        const istNow = new Date(now.getTime() + IST_OFFSET_MS);
        const dayOfWeek = istNow.getUTCDay(); // 0 is Sunday, 1 is Monday
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayDate = new Date(Date.UTC(currentIST.year, currentIST.month, currentIST.day + diffToMonday));
        start = fromISTParts(mondayDate.getUTCFullYear(), mondayDate.getUTCMonth(), mondayDate.getUTCDate(), false);
        end = fromISTParts(currentIST.year, currentIST.month, currentIST.day, true);
    } else if (filter === 'month' || filter === 'this_month') {
        start = fromISTParts(currentIST.year, currentIST.month, 1, false);
        end = fromISTParts(currentIST.year, currentIST.month, currentIST.day, true);
    } else if (filter === 'last_month') {
        const lastMonthLastDay = new Date(Date.UTC(currentIST.year, currentIST.month, 0));
        start = fromISTParts(lastMonthLastDay.getUTCFullYear(), lastMonthLastDay.getUTCMonth(), 1, false);
        end = fromISTParts(lastMonthLastDay.getUTCFullYear(), lastMonthLastDay.getUTCMonth(), lastMonthLastDay.getUTCDate(), true);
    } else if (filter === 'custom' && customStart) {
        const [sy, sm, sd] = String(customStart).split('-').map(Number);
        if (sy && sm && sd) {
            start = fromISTParts(sy, sm - 1, sd, false);
        } else {
            start = new Date(customStart);
            start.setHours(0, 0, 0, 0);
        }

        if (customEnd) {
            const [ey, em, ed] = String(customEnd).split('-').map(Number);
            if (ey && em && ed) {
                end = fromISTParts(ey, em - 1, ed, true);
            } else {
                end = new Date(customEnd);
                end.setHours(23, 59, 59, 999);
            }
        } else {
            end = fromISTParts(currentIST.year, currentIST.month, currentIST.day, true);
        }
    }

    return { start, end };
};

/**
 * Process a single appointment and its payment records into a canonical financial record
 */
export const processAppointmentFinancialRecord = (app: any, payments: any[] = []): ProcessedAppointmentRecord => {
    const consultationFee = Number(app.consultationFee || (app.doctor as any)?.fee || 500);

    const completedPayments = payments.filter((p: any) => p && (p.status === 'completed' || p.status === 'paid'));

    let advancePaid = 0;
    let gatewayCharges = 0;
    let netAdvancePayable = 0;
    let clinicCashCollection = 0;
    let clinicOnlineCollection = 0;
    let settlementStatus: CanonicalSettlementStatus = 'not_applicable';
    let transactionDate: Date | string = app.createdAt || new Date();

    const onlinePayments = completedPayments.filter(isOnlineAdvancePayment);

    if (onlinePayments.length > 0) {
        for (const p of onlinePayments) {
            const amt = Number(p.advanceFee || p.amount || 0);
            if (amt > 0) {
                advancePaid += amt;
                const split = calculateAdvanceGatewaySplit(amt);
                gatewayCharges += split.gatewayCharges;
                netAdvancePayable += split.netPayable;

                // Priority: Settled > Processing > Failed > Pending
                const currentStatus = normalizeSettlementStatus(p.settlementStatus, true);
                if (currentStatus === 'Settled') {
                    settlementStatus = 'Settled';
                } else if (currentStatus === 'Processing' && settlementStatus !== 'Settled') {
                    settlementStatus = 'Processing';
                } else if (currentStatus === 'Failed' && settlementStatus !== 'Settled' && settlementStatus !== 'Processing') {
                    settlementStatus = 'Failed';
                } else if (settlementStatus === 'not_applicable') {
                    settlementStatus = 'Pending';
                }
            }
            if (p.createdAt && (!transactionDate || new Date(p.createdAt) > new Date(transactionDate))) {
                transactionDate = p.createdAt;
            }
        }
    } else if (app.advancePaid && Number(app.advancePaid) > 0) {
        // Legacy fallback if no Payment record exists but appointment recorded advancePaid
        advancePaid = Number(app.advancePaid);
        const split = calculateAdvanceGatewaySplit(advancePaid);
        gatewayCharges = split.gatewayCharges;
        netAdvancePayable = split.netPayable;
        settlementStatus = 'Pending';
    }

    // Clinic payments (any non-online-advance completed payments)
    const clinicPayments = completedPayments.filter((p: any) => !onlinePayments.includes(p));

    if (clinicPayments.length > 0) {
        for (const p of clinicPayments) {
            const amt = Number(p.amount || 0);
            if (p.paymentMethod === 'cash' || p.mode === 'offline') {
                clinicCashCollection += amt;
            } else {
                clinicOnlineCollection += amt;
            }
            if (p.createdAt && (!transactionDate || new Date(p.createdAt) > new Date(transactionDate))) {
                transactionDate = p.createdAt;
            }
        }
    } else if (app.balancePaid && Number(app.balancePaid) > 0) {
        // Legacy fallback if appointment records balancePaid but no clinic payment documents exist
        const bp = Number(app.balancePaid);
        if (app.paymentMethod === 'upi' || app.paymentMethod === 'card' || app.paymentMethod === 'online') {
            clinicOnlineCollection = bp;
        } else {
            clinicCashCollection = bp;
        }
    }

    // Precise rounding
    advancePaid = Math.round(advancePaid * 100) / 100;
    gatewayCharges = Math.round(gatewayCharges * 100) / 100;
    netAdvancePayable = Math.round(netAdvancePayable * 100) / 100;
    clinicCashCollection = Math.round(clinicCashCollection * 100) / 100;
    clinicOnlineCollection = Math.round(clinicOnlineCollection * 100) / 100;

    const advanceRequired = advancePaid > 0 ? advancePaid : (app.paymentSource === 'gateway' ? Math.round(consultationFee * 0.20) : 0);
    const balancePaid = Math.round((clinicCashCollection + clinicOnlineCollection) * 100) / 100;
    const balanceDue = Math.max(0, Math.round((consultationFee - advancePaid - balancePaid) * 100) / 100);

    // Canonical payment status
    let paymentStatus: CanonicalPaymentStatus = 'unpaid';
    if (balanceDue === 0 && (advancePaid > 0 || balancePaid > 0)) {
        paymentStatus = 'paid';
    } else if (advancePaid > 0 || balancePaid > 0) {
        paymentStatus = 'partial';
    } else if (app.paymentStatus === 'waived') {
        paymentStatus = 'waived';
    } else if (app.paymentStatus === 'refunded') {
        paymentStatus = 'refunded';
    }

    return {
        appointmentId: app._id.toString(),
        tokenNumber: app.tokenNumber || null,
        patientName: app.patientName || (app.patient as any)?.name || 'Guest Patient',
        patientPhone: app.patientPhone || (app.patient as any)?.phone || 'N/A',
        patientEmail: app.patientEmail || (app.patient as any)?.email || 'N/A',
        doctorId: (app.doctor as any)?._id?.toString() || (app.doctor?.toString?.() || undefined),
        doctorName: (app.doctor as any)?.name ? `Dr. ${(app.doctor as any).name}` : (app.doctorName || 'Doctor'),
        consultationFee,
        advanceRequired,
        advancePaid,
        gatewayCharges,
        netAdvancePayable,
        balanceDue,
        balancePaid,
        clinicCashCollection,
        clinicOnlineCollection,
        paymentStatus,
        settlementStatus,
        appointmentDate: app.slotTime || app.appointmentDate || app.createdAt,
        transactionDate,
        transactions: completedPayments.map((p: any) => ({
            transactionId: p.transactionId || `TXN-${p._id}`,
            amount: p.amount,
            type: p.paymentType,
            source: p.paymentSource,
            method: p.paymentMethod,
            status: p.status,
            settlementStatus: p.settlementStatus,
            date: p.createdAt
        }))
    };
};

/**
 * Aggregate an array of ProcessedAppointmentRecord into overview cards and indicators
 */
export const aggregateFinancialRecords = (records: ProcessedAppointmentRecord[]): FinancialOverviewSummary => {
    let totalConsultationFees = 0;
    let grossOnlineAdvances = 0;
    let onlineAdvanceCount = 0;
    let totalGatewayCharges = 0;
    let cashAtClinic = 0;
    let clinicCashCount = 0;
    let onlineAtClinic = 0;
    let clinicOnlineCount = 0;
    let pendingSettlement = 0;
    let processingSettlement = 0;
    let alreadySettled = 0;
    let failedSettlement = 0;
    let pendingPatientCollection = 0;

    for (const r of records) {
        totalConsultationFees += r.consultationFee;

        if (r.advancePaid > 0) {
            grossOnlineAdvances += r.advancePaid;
            onlineAdvanceCount += 1;
            totalGatewayCharges += r.gatewayCharges;

            if (r.settlementStatus === 'Pending') {
                pendingSettlement += r.netAdvancePayable;
            } else if (r.settlementStatus === 'Processing') {
                processingSettlement += r.netAdvancePayable;
            } else if (r.settlementStatus === 'Settled') {
                alreadySettled += r.netAdvancePayable;
            } else if (r.settlementStatus === 'Failed') {
                failedSettlement += r.netAdvancePayable;
            }
        }

        if (r.clinicCashCollection > 0) {
            cashAtClinic += r.clinicCashCollection;
            clinicCashCount += 1;
        }

        if (r.clinicOnlineCollection > 0) {
            onlineAtClinic += r.clinicOnlineCollection;
            clinicOnlineCount += 1;
        }

        pendingPatientCollection += r.balanceDue;
    }

    // Precise rounding
    totalConsultationFees = Math.round(totalConsultationFees * 100) / 100;
    grossOnlineAdvances = Math.round(grossOnlineAdvances * 100) / 100;
    totalGatewayCharges = Math.round(totalGatewayCharges * 100) / 100;
    cashAtClinic = Math.round(cashAtClinic * 100) / 100;
    onlineAtClinic = Math.round(onlineAtClinic * 100) / 100;
    pendingSettlement = Math.round(pendingSettlement * 100) / 100;
    processingSettlement = Math.round(processingSettlement * 100) / 100;
    alreadySettled = Math.round(alreadySettled * 100) / 100;
    failedSettlement = Math.round(failedSettlement * 100) / 100;
    pendingPatientCollection = Math.round(pendingPatientCollection * 100) / 100;

    // Net Payable from Pillora rule: Total Net Advance = Pending + Processing + Settled
    const totalNetPayable = Math.round((pendingSettlement + processingSettlement + alreadySettled) * 100) / 100;
    const totalPatientCollections = Math.round((grossOnlineAdvances + cashAtClinic + onlineAtClinic) * 100) / 100;

    return {
        cards: {
            totalConsultationFees,
            grossOnlineAdvances,
            payableFromPillora: {
                netPayable: totalNetPayable,
                pendingSettlement,
                processing: processingSettlement,
                alreadySettled,
                failedSettlement
            },
            cashAtClinic,
            onlineAtClinic
        },
        primaryCards: {
            totalConsultationFees,
            onlineAdvanceViaPillora: {
                grossAmount: grossOnlineAdvances,
                transactionCount: onlineAdvanceCount
            },
            payableFromPillora: {
                netAmount: totalNetPayable,
                breakdown: {
                    pendingSettlement,
                    processing: processingSettlement,
                    alreadySettled,
                    failedSettlement
                }
            },
            collectedAtClinicCash: {
                amount: cashAtClinic,
                transactionCount: clinicCashCount
            },
            collectedAtClinicOnline: {
                amount: onlineAtClinic,
                transactionCount: clinicOnlineCount
            }
        },
        additionalIndicators: {
            pendingPatientCollection,
            pilloraSettlementPending: pendingSettlement,
            totalSuccessfullySettled: alreadySettled,
            totalGatewayCharges
        },
        reconciliation: {
            totalConsultationFees,
            totalPatientCollections,
            pendingPatientCollection,
            totalNetAdvance: totalNetPayable,
            netSettlementSum: Math.round((pendingSettlement + processingSettlement + alreadySettled) * 100) / 100,
            equationHolds: Math.abs(totalNetPayable - (pendingSettlement + processingSettlement + alreadySettled)) < 0.01
        }
    };
};
