import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Appointment from '../models/Appointment';
import Payment from '../models/Payment';
import Settlement from '../models/Settlement';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_51Mz2wYSHB3q5Xn',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'fallback_secret'
});

/**
 * @desc    Cancel appointment (initiator-dependent refund/retention rules)
 * @route   POST /api/appointments/:appointmentId/cancel
 * @access  Private
 */
export const cancelAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { appointmentId } = req.params;
        const { reason } = req.body;
        const userId = req.user?._id || req.user?.id;

        if (!appointmentId) {
            res.status(400).json({ success: false, message: 'Appointment ID is required' });
            return;
        }

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }

        if (appointment.status === 'cancelled') {
            res.status(400).json({ success: false, message: 'Appointment is already cancelled' });
            return;
        }

        // Identify if initiator is Hospital or Admin vs User
        // If hospital role / admin role, or if user is hospital staff
        const isHospitalOrAdmin = req.user.role === 'hospital' || req.user.role === 'admin';

        // 1. Update Appointment Status
        appointment.status = 'cancelled';
        if (reason) {
            appointment.notes = appointment.notes ? `${appointment.notes}\nCancellation reason: ${reason}` : `Cancellation reason: ${reason}`;
        }
        await appointment.save();

        // 2. Load Payment Record
        const payment = await Payment.findOne({ appointmentId });
        const settlement = await Settlement.findOne({ appointmentId });

        if (payment && payment.status === 'completed') {
            if (isHospitalOrAdmin) {
                // Hospital Initiates Cancellation: FULL REFUND
                payment.status = 'refund_initiated';
                await payment.save();

                // Trigger Razorpay Refund
                if (payment.razorpayPaymentId) {
                    try {
                        const refundAmount = Math.round(payment.amount * 100); // Amount in paise
                        await razorpay.payments.refund(payment.razorpayPaymentId, {
                            amount: refundAmount,
                            notes: {
                                reason: reason || 'Hospital cancelled appointment',
                                appointmentId: appointmentId.toString()
                            }
                        });
                    } catch (refundError: any) {
                        console.error('[RazorpayRefundError]', refundError.message);
                        // We do not throw or revert, as handle webhook refund verification or manual check covers this
                    }
                }

                // Update Settlement Record
                if (settlement) {
                    settlement.status = 'refunded';
                    await settlement.save();
                }
            } else {
                // User Initiates Cancellation: NO REFUND
                // Payment remains status = "completed" (or we can tag as "completed" to signify retained)
                payment.status = 'completed';
                await payment.save();

                // Update Settlement Record
                if (settlement) {
                    settlement.status = 'retained_by_pillora';
                    await settlement.save();
                }
            }
        } else if (payment && payment.status === 'pending') {
            // Unpaid pending appointments being cancelled
            payment.status = 'failed';
            await payment.save();
            
            if (settlement) {
                settlement.status = 'refunded'; // Or deleted
                await settlement.save();
            }
        }

        res.status(200).json({
            success: true,
            message: `Appointment cancelled successfully (${isHospitalOrAdmin ? 'Hospital refund initiated' : 'User cancellation retained'})`,
            appointment
        });
    } catch (error: any) {
        console.error('[AppointmentCancelError]', error.message);
        res.status(500).json({ success: false, message: 'Failed to cancel appointment', error: error.message });
    }
};
