import mongoose from 'mongoose';
import Hospital, { IHospital } from '../models/Hospital';
import HospitalSubscriptionPayment from '../models/HospitalSubscriptionPayment';
import Notification from '../models/Notification';

export interface ComputedSubscriptionStatus {
    status: 'Pending' | 'Active' | 'Expiring Soon' | 'Expired';
    daysRemaining: number;
    isValid: boolean;
    canGenerateSlots: boolean;
    subscriptionStartDate: Date | null;
    subscriptionExpiryDate: Date | null;
    joiningDate: Date | null;
    lastPaymentDate: Date | null;
    paymentStatus: 'Pending' | 'Paid';
}

/**
 * Computes live subscription status based on current time and stored expiry dates.
 * Enforces server-side boundary rules without trusting stale statuses.
 */
export function computeSubscriptionStatus(hospital: any): ComputedSubscriptionStatus {
    const paymentStatus: 'Pending' | 'Paid' = hospital.paymentStatus === 'Paid' ? 'Paid' : 'Pending';
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

export interface RecordPaymentParams {
    hospitalId: string;
    paymentDate?: string | Date;
    amount: number;
    paymentMethod?: 'UPI' | 'Bank Transfer' | 'Cash' | 'Card' | 'Cheque' | 'Other';
    transactionReference?: string;
    adminNotes?: string;
    recordedBy?: string;
}

/**
 * Records a hospital payment, automatically calculates 30-day cycle, and extends/renews.
 * Rules:
 *  - Case A (Initial): Start = paymentDate, Expiry = paymentDate + 30 days
 *  - Case B (Renewal before expiry): Preserve remaining days, Expiry = existingExpiry + 30 days
 *  - Case C (Renewal after expiry): Fresh cycle, Start = paymentDate, Expiry = paymentDate + 30 days
 */
export async function recordHospitalPayment(params: RecordPaymentParams) {
    const {
        hospitalId,
        paymentDate = new Date(),
        amount,
        paymentMethod = 'UPI',
        transactionReference = '',
        adminNotes = '',
        recordedBy
    } = params;

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
        throw new Error('Hospital not found');
    }

    const paymentDateObj = new Date(paymentDate);
    if (isNaN(paymentDateObj.getTime())) {
        throw new Error('Invalid payment date provided');
    }

    const now = Date.now();
    let startDate: Date;
    let expiryDate: Date;
    let paymentType: 'initial' | 'renewal';

    const existingExpiry = hospital.subscriptionExpiryDate ? new Date(hospital.subscriptionExpiryDate) : null;
    const isCurrentlyActive = existingExpiry && existingExpiry.getTime() > now && hospital.paymentStatus === 'Paid';

    if (isCurrentlyActive && existingExpiry) {
        // Case B: Renewal Before Expiry — extend from existing expiry, preserve remaining days
        startDate = hospital.subscriptionStartDate ? new Date(hospital.subscriptionStartDate) : paymentDateObj;
        expiryDate = new Date(existingExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
        paymentType = 'renewal';
    } else if (existingExpiry && existingExpiry.getTime() <= now) {
        // Case C: Renewal After Expiry — start fresh 30-day cycle from confirmed payment date
        startDate = new Date(paymentDateObj);
        expiryDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        paymentType = 'renewal';
    } else {
        // Case A: Initial Payment
        startDate = new Date(paymentDateObj);
        expiryDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        paymentType = 'initial';
    }

    // 1. Store payment history transaction (never overwrite previous transactions)
    const paymentRecord = await HospitalSubscriptionPayment.create({
        hospital: hospital._id,
        paymentDate: paymentDateObj,
        amount: Number(amount) || 0,
        paymentMethod,
        transactionReference: transactionReference.trim(),
        adminNotes: adminNotes.trim(),
        subscriptionStartDate: startDate,
        subscriptionExpiryDate: expiryDate,
        recordedBy: recordedBy ? new mongoose.Types.ObjectId(recordedBy) : undefined,
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

    await hospital.save();

    // 3. Notify hospital user if account exists
    try {
        if (hospital.user) {
            const formattedExpiry = expiryDate.toLocaleDateString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
            await Notification.create({
                user: hospital.user,
                message: `🎉 Your Pillora hospital subscription payment of ₹${amount} has been confirmed. Slot generation privileges are active through ${formattedExpiry}.`,
                type: 'success',
                relatedId: paymentRecord._id
            });
        }
    } catch (notifErr: any) {
        console.warn('[subscriptionService] Failed to create notification:', notifErr.message);
    }

    const computed = computeSubscriptionStatus(hospital);

    return {
        hospital,
        paymentRecord,
        computed
    };
}

/**
 * Returns complete subscription summary statistics for the Admin Dashboard.
 */
export async function getSubscriptionSummary() {
    const hospitals = await Hospital.find();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let activeCount = 0;
    let pendingCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;

    for (const h of hospitals) {
        const comp = computeSubscriptionStatus(h);
        if (comp.status === 'Active') activeCount++;
        else if (comp.status === 'Expiring Soon') expiringSoonCount++;
        else if (comp.status === 'Expired') expiredCount++;
        else pendingCount++;
    }

    // Payments received this month from HospitalSubscriptionPayment
    const monthlyPayments = await HospitalSubscriptionPayment.find({
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
}
