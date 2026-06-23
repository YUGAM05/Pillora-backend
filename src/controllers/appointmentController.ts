import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Appointment from '../models/Appointment';
import Payment from '../models/Payment';
import Settlement from '../models/Settlement';
import Razorpay from 'razorpay';
import Slot from '../models/Slot';
import Doctor from '../models/Doctor';

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

/**
 * @desc    Create appointment dynamically (supports simplified React Router template)
 * @route   POST /api/appointments/create
 * @access  Public/Private
 */
export const createAppointment = async (req: any, res: Response): Promise<void> => {
    try {
        const { userId, doctorId, hospitalId, appointmentDate, appointmentTime, consultationFee, status } = req.body;

        if (!doctorId || !hospitalId || !appointmentDate || !appointmentTime) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        // Parse Date & Time
        // Combine date ("YYYY-MM-DD") and time ("HH:MM")
        const dateTimeStr = `${appointmentDate}T${appointmentTime}:00`;
        const startTime = new Date(dateTimeStr);

        // Find or create a Slot dynamically for this slot time
        let slot = await Slot.findOne({
            doctor: doctorId,
            hospital: hospitalId,
            startTime: startTime
        });

        if (!slot) {
            const endTime = new Date(startTime.getTime() + 60 * 60000); // 1 hour duration
            slot = new Slot({
                doctor: doctorId,
                hospital: hospitalId,
                startTime: startTime,
                endTime: endTime,
                status: 'booked',
                booked_count: 1,
                max_appointments: 1
            });
            await slot.save();
        } else {
            slot.booked_count += 1;
            slot.status = 'booked';
            await slot.save();
        }

        // Generate token number
        const activeAppointmentsCount = await Appointment.countDocuments({
            slot: slot._id,
            status: { $ne: 'cancelled' }
        });
        const tokenNumber = activeAppointmentsCount + 1;

        // Resolve patient ID
        const patientId = userId || req.user?._id || req.user?.id;
        if (!patientId) {
            res.status(400).json({ error: 'User ID is required' });
            return;
        }

        // Create Appointment
        const appointment = new Appointment({
            patient: patientId,
            doctor: doctorId,
            hospital: hospitalId,
            slot: slot._id,
            slotTime: startTime,
            status: 'pending', // Pending payment
            paymentStatus: 'unpaid',
            paymentSource: 'gateway',
            tokenNumber
        });

        await appointment.save();

        // Update slot with appointment id if single slot
        if (slot.max_appointments === 1) {
            slot.appointment = appointment._id;
            await slot.save();
        }

        res.status(201).json({
            success: true,
            appointmentId: appointment._id
        });
    } catch (error: any) {
        console.error('[AppointmentCreateError]', error.message);
        res.status(500).json({ error: error.message });
    }
};
