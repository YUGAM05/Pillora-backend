import { Request, Response } from 'express';
import User from '../models/User';
import BloodDonor from '../models/BloodDonor';
import Inventory from '../models/Inventory';
import Order from '../models/Order';
import Notification from '../models/Notification';
import Hospital from '../models/Hospital';
import Payment from '../models/Payment';
import Settlement from '../models/Settlement';
import { verifyAadhaarLocal } from '../utils/aadhaarVerifier';
import LoginHistory from '../models/LoginHistory';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import axios from 'axios';
import slugify from 'slugify';
import AuditLog from '../models/AuditLog';
import PlatformActivity from '../models/PlatformActivity';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

// @desc    Get platform activities
// @route   GET /api/admin/activities
// @access  Private/Admin
export const getPlatformActivities = async (req: Request, res: Response): Promise<void> => {
    try {
        const activities = await PlatformActivity.find().sort({ timestamp: -1 }).limit(20);
        res.json(activities);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get system statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
export const getSystemStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const totalUsers = await User.countDocuments({ role: 'customer' });
        const totalSellers = await User.countDocuments({ role: 'seller', status: 'approved' });
        const totalDonors = await BloodDonor.countDocuments();

        const totalOrders = await Order.countDocuments();
        const pendingProducts = await Inventory.countDocuments({ status: 'pending' });

        // Calculate Revenue
        const revenueResult = await Order.aggregate([
            { $match: { payment_status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total_amount' } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        // Calculate Admin Profit
        const profitResult = await Order.aggregate([
            { $match: { payment_status: 'paid' } },
            {
                $group: {
                    _id: null,
                    totalProfit: {
                        $sum: {
                            $add: [
                                "$platform_fee",
                                "$seller_commission",
                                { $ifNull: ["$adminDeliveryCommission", 0] }
                            ]
                        }
                    }
                }
            }
        ]);
        const totalProfit = profitResult.length > 0 ? profitResult[0].totalProfit : 0;

        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10).select('-passwordHash');
        const activeSellers = await User.find({ role: 'seller', status: 'approved' }).sort({ createdAt: -1 }).limit(5).select('-passwordHash');

        res.json({
            counts: {
                users: totalUsers,
                sellers: totalSellers,
                donors: totalDonors,
                orders: totalOrders,
                pendingProducts,
                revenue: totalRevenue,
                profit: totalProfit
            },
            recentUsers,
            activeSellers
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get users by role/status
// @route   GET /api/admin/users
// @access  Private/Admin
export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { role, status } = req.query;
        let query: any = {};

        if (role) query.role = role;
        if (status) query.status = status;

        const users = await User.find(query).select('-passwordHash').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Update user status (Approve/Reject)
// @route   PUT /api/admin/users/:id/status
// @access  Private/Admin
export const updateUserStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        if (!['pending', 'approved', 'rejected'].includes(status)) {
            res.status(400).json({ message: 'Invalid status' });
            return;
        }

        const user = await User.findByIdAndUpdate(id, { status }, { new: true }).select('-passwordHash');

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get all products (admin view)
// @route   GET /api/admin/inventory
// @access  Private/Admin
export const getAdminProducts = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status } = req.query;
        let query: any = {};
        if (status) query.status = status;

        const products = await Inventory.find(query).populate('seller', 'name email').sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching inventory', error });
    }
};

// @desc    Approve/Reject Product
// @route   PUT /api/admin/inventory/:id/status
// @access  Private/Admin
export const updateProductStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status, adminComments } = req.body;
        const { id } = req.params;

        if (!['pending', 'approved', 'rejected'].includes(status)) {
            res.status(400).json({ message: 'Invalid status' });
            return;
        }

        const product = await Inventory.findByIdAndUpdate(
            id,
            { status, adminComments },
            { new: true }
        );

        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }

        // Notify Seller
        if (product.seller) {
            await Notification.create({
                user: product.seller,
                message: `Your product "${product.name}" has been ${status} by the admin.${adminComments ? ` Comment: ${adminComments}` : ''}`,
                type: status === 'approved' ? 'success' : 'error',
                relatedId: product._id
            });
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Error updating product', error });
    }
};

// @desc    Delete Product (Hard Delete)
// @route   DELETE /api/admin/inventory/:id
// @access  Private/Admin
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const product = await Inventory.findByIdAndDelete(id);

        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting product', error });
    }
};

// @desc    Toggle Deal of the Day status
// @route   PUT /api/admin/inventory/:id/deal
// @access  Private/Admin
export const toggleDealStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const product = await Inventory.findById(id);

        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }

        // Only approved products can be deals
        if (product.status !== 'approved') {
            res.status(400).json({ message: 'Only approved products can be marked as deals' });
            return;
        }

        product.isDealOfDay = !product.isDealOfDay;
        await product.save();

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Error toggling deal status', error });
    }
};

// @desc    Get orders for a specific user
// @route   GET /api/admin/users/:id/orders
// @access  Private/Admin
export const getUserOrders = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const orders = await Order.find({ user: id })
            .populate('medicines.medicine_id', 'name imageUrl')
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user orders', error });
    }
};

// @desc    Update product details (Admin edit)
// @route   PUT /api/admin/inventory/:id
// @access  Private/Admin
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const product = await Inventory.findByIdAndUpdate(id, updateData, { new: true });

        if (!product) {
            res.status(404).json({ message: 'Product not found' });
            return;
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Error updating product', error });
    }
};

// @desc    Get all orders
// @route   GET /api/admin/orders
// @access  Private/Admin
export const getAllOrders = async (req: Request, res: Response): Promise<void> => {
    try {
        const orders = await Order.find()
            .populate('user', 'name email')
            .populate('medicines.medicine_id', 'name imageUrl')
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: 'Error fetching all orders', error });
    }
};
// @desc    Get dashboard trend data (Revenue & Signups)
// @route   GET /api/admin/trends
// @access  Private/Admin
export const getAdminTrends = async (req: Request, res: Response): Promise<void> => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Revenue Trends (Paid Orders)
        const revenueTrends = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    payment_status: 'paid'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$total_amount" },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // User Signup Trends
        const signupTrends = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // Seller Signup Trends
        const sellerTrends = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    role: 'seller'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        res.json({
            revenue: revenueTrends,
            users: signupTrends,
            sellers: sellerTrends
        });
    } catch (error) {
        console.error("Trends Error:", error);
        res.status(500).json({ message: 'Error fetching trend data', error });
    }
};

// @desc    Verify user Aadhaar with AI
// @route   POST /api/admin/users/:id/verify-aadhaar
// @access  Private/Admin
export const verifyUserAadhaar = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (!user.aadhaarCardUrl) {
            res.status(400).json({ message: 'No Aadhaar card found for this user' });
            return;
        }

        const result = await verifyAadhaarLocal(user.aadhaarCardUrl, user.name);

        user.kyc_status = result.status as any;
        // In this case, we use the status to also update the main status if approved?
        // Or just update kyc_status.

        await user.save();

        res.json({
            message: result.status === 'Verified' ? 'Aadhaar verified successfully' : result.remarks,
            kyc_status: user.kyc_status,
            remarks: result.remarks
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
};

// @desc    Register a new hospital (Super-Admin)
// @route   POST /api/admin/hospitals/register
// @access  Private/Admin
export const registerHospital = async (req: Request, res: Response): Promise<void> => {
    try {
        const { 
            name, 
            city, 
            email, 
            address, 
            consultationFee, 
            management_type,
            plan,
            image,
            images,
            ambulanceContact,
            phoneNumbers,
            description,
            isOpen24Hours,
            isOnlinePaymentAvailable,
            doctors
        } = req.body;

        if (!name || !city || !email || !address || !consultationFee) {
            console.error('Registration failed: Missing required fields', { name, city, email, address, consultationFee });
            res.status(400).json({ message: 'Missing required fields: Name, City, Email, Address, and Fee are mandatory.' });
            return;
        }

        const validPlans = ['Standard', 'Premium', 'Enterprise'];
        if (plan && !validPlans.includes(plan)) {
            res.status(400).json({ message: 'Invalid subscription plan selected.' });
            return;
        }

        const normalizedEmail = email.toLowerCase().trim();
        const userExists = await User.findOne({ email: normalizedEmail });
        if (userExists) {
            res.status(400).json({ message: 'A partner account with this email already exists.' });
            return;
        }

        // 1. Generate Credentials
        const tempPassword = crypto.randomBytes(8).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(tempPassword, salt);

        // 2. Create User account for Hospital
        const user = await User.create({
            name,
            email: normalizedEmail,
            passwordHash,
            role: 'hospital',
            status: 'approved',
            isPasswordResetRequired: true
        });

        // 3. Create Hospital entry
        let baseSlug = slugify(name, { lower: true, strict: true, trim: true });
        let currentSlug = baseSlug;
        let counter = 2;
        while (await Hospital.findOne({ slug: currentSlug })) {
            currentSlug = `${baseSlug}-${counter}`;
            counter++;
        }

        const hospital = await Hospital.create({
            name,
            slug: currentSlug,
            city,
            address,
            consultationFee: Number(consultationFee),
            management_type: management_type || 'SELF',
            plan: req.body.plan || 'Standard',
            // Plan-based feature mapping
            is_verified: true, // All plans get verified badge
            is_featured: req.body.plan === 'Premium' || req.body.plan === 'Enterprise',
            has_govt_schemes: req.body.plan === 'Premium' || req.body.plan === 'Enterprise',
            has_custom_page: req.body.plan === 'Enterprise',
            is_spotlight: req.body.plan === 'Enterprise',
            priority_support: req.body.plan === 'Enterprise',
            user: user._id,
            image: image || "",
            images: Array.isArray(images) ? images : [],
            ambulanceContact: ambulanceContact || "",
            phoneNumbers: Array.isArray(phoneNumbers) ? phoneNumbers : [],
            description: description || `${name} - Multi-specialty care in ${city}`,
            isOpen24Hours: Boolean(isOpen24Hours),
            isOnlinePaymentAvailable: Boolean(isOnlinePaymentAvailable),
            doctors: Array.isArray(doctors) ? doctors : [],
            rating: 4.0,
            tempPassword: tempPassword
        });

        // 4. Trigger "Welcome Kit" email via external Node.js service
        try {
            const mailServiceUrl = process.env.MAIL_SERVICE_URL || 'http://localhost:5001/api/send-welcome';
            await axios.post(mailServiceUrl, {
                to: email,
                hospitalName: name,
                username: email,
                password: tempPassword,
                loginLink: `${process.env.FRONTEND_URL || 'https://pillora.in'}/login`
            });
            console.log(`Welcome email triggered for ${email}`);
        } catch (mailError: any) {
            console.error('Failed to trigger welcome email:', mailError.message);
            // We don't fail the whole registration if email fails, but we log it
        }

        res.status(201).json({
            message: 'Hospital registered successfully',
            hospitalId: hospital._id,
            credentials: {
                username: email,
                temporaryPassword: tempPassword
            }
        });
    } catch (error: any) {
        console.error('Register Hospital Error:', error);
        res.status(500).json({ message: 'Failed to register hospital', error: error.message });
    }
};

// @desc    Get all hospitals (Admin view)
// @route   GET /api/admin/hospitals
// @access  Private/Admin
export const getAdminHospitals = async (req: Request, res: Response): Promise<void> => {
    try {
        const hospitals = await Hospital.find().populate('user', 'name email status');
        res.json(hospitals);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching hospitals', error: error.message });
    }
};

// @desc    Toggle Hospital Management Mode
// @route   PUT /api/admin/hospitals/:id/management
// @access  Private/Admin
export const toggleHospitalManagement = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { management_type } = req.body;

        if (!['SELF', 'PILLORA'].includes(management_type)) {
            res.status(400).json({ message: 'Invalid management type' });
            return;
        }

        const hospital = await Hospital.findByIdAndUpdate(id, { management_type }, { new: true });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }

        res.json(hospital);
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating management type', error: error.message });
    }
};
// @desc    Get all doctors for any hospital (Admin)
// @route   GET /api/admin/hospitals/:id/doctors
// @access  Private/Admin
export const getAdminHospitalDoctors = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const doctors = await Doctor.find({ hospital: id });
        res.json(doctors);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching doctors', error: error.message });
    }
};

// @desc    Add a doctor to a hospital (Admin)
// @route   POST /api/admin/hospitals/:id/doctors
// @access  Private/Admin
export const adminAddDoctor = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, specialty, fee, availability } = req.body;

        const doctor = await Doctor.create({
            hospital: id,
            name,
            specialty,
            fee,
            availability: availability || []
        });

        res.status(201).json(doctor);
    } catch (error: any) {
        res.status(500).json({ message: 'Error adding doctor', error: error.message });
    }
};

// @desc    Bulk Generate Slots for a doctor (Admin)
// @route   POST /api/admin/slots/generate
// @access  Private/Admin
export const adminBulkGenerateSlots = async (req: Request, res: Response): Promise<void> => {
    try {
        const { doctorId, hospitalId, date, startTime, endTime, duration } = req.body;

        if (!doctorId || !hospitalId || !date || !startTime || !endTime || !duration) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }

        const start = new Date(`${date}T${startTime}:00`);
        const end = new Date(`${date}T${endTime}:00`);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            res.status(400).json({ message: 'Invalid date or time format' });
            return;
        }

        const slots = [];
        let current = new Date(start);

        while (current < end) {
            const next = new Date(current.getTime() + Number(duration) * 60000);
            if (next > end) break;

            slots.push({
                doctor: doctorId,
                hospital: hospitalId,
                startTime: new Date(current),
                endTime: new Date(next),
                status: 'available'
            });

            current = next;
        }

        if (slots.length > 0) {
            await Slot.insertMany(slots);
        }

        res.status(201).json({ message: `Successfully generated ${slots.length} slots`, count: slots.length });
    } catch (error: any) {
        res.status(500).json({ message: 'Error generating slots', error: error.message });
    }
};

// @desc    Get User Login Analytics (Stats & Recent Activity)
// @route   GET /api/admin/login-analytics
// @access  Private/Admin
export const getLoginAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. Total Registered Users Count
        const totalUsers = await User.countDocuments();

        // Timezone calculation (IST = UTC + 5:30)
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 mins in ms
        const currentIstTime = new Date(now.getTime() + istOffset);

        const istYear = currentIstTime.getUTCFullYear();
        const istMonth = currentIstTime.getUTCMonth();
        const istDay = currentIstTime.getUTCDate();

        // 2. Total Logins Today (IST timezone)
        const istMidnightInUtc = new Date(Date.UTC(istYear, istMonth, istDay, 0, 0, 0, 0) - istOffset);
        const loginsToday = await LoginHistory.countDocuments({
            timestamp: { $gte: istMidnightInUtc }
        });

        // 3. Total Logins This Week (IST timezone, starting on Monday)
        const istDayOfWeek = currentIstTime.getUTCDay(); // 0 is Sunday, 1 is Monday, ...
        const diffToMonday = istDayOfWeek === 0 ? 6 : istDayOfWeek - 1;
        const istMondayDay = istDay - diffToMonday;
        const istWeekStartInUtc = new Date(Date.UTC(istYear, istMonth, istMondayDay, 0, 0, 0, 0) - istOffset);

        const loginsThisWeek = await LoginHistory.countDocuments({
            timestamp: { $gte: istWeekStartInUtc }
        });

        // 4. Recent Login Activity Table showing user name, email, blood group (if available), and timestamp
        const recentLogins = await LoginHistory.find()
            .populate('user', 'name email role')
            .sort({ timestamp: -1 })
            .limit(100);

        const userIds = recentLogins.map(log => log.user?._id).filter(Boolean);
        const donors = await BloodDonor.find({ user: { $in: userIds } }).select('user bloodGroup');

        const bloodGroupMap: Record<string, string> = {};
        donors.forEach(donor => {
            if (donor.user) {
                bloodGroupMap[donor.user.toString()] = donor.bloodGroup;
            }
        });

        const emails = recentLogins.map(log => log.email).filter(Boolean);
        const donorsByEmail = await BloodDonor.find({ email: { $in: emails } }).select('email bloodGroup');
        donorsByEmail.forEach(donor => {
            if (donor.email) {
                bloodGroupMap[donor.email.toLowerCase()] = donor.bloodGroup;
            }
        });

        const activities = recentLogins.map(log => {
            const userObj = log.user as any;
            const userIdStr = userObj?._id?.toString();
            const emailStr = log.email || userObj?.email;

            const bloodGroup = (userIdStr && bloodGroupMap[userIdStr])
                || (emailStr && bloodGroupMap[emailStr.toLowerCase()])
                || null;

            return {
                _id: log._id,
                name: userObj?.name || 'Unknown User',
                email: emailStr || 'N/A',
                role: userObj?.role || 'customer',
                ipAddress: log.ipAddress,
                userAgent: log.userAgent,
                timestamp: log.timestamp,
                bloodGroup
            };
        });

        res.json({
            stats: {
                totalUsers,
                loginsToday,
                loginsThisWeek
            },
            activities
        });
    } catch (error: any) {
        console.error("Error in getLoginAnalytics:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get Admin Revenue Analytics (Advance booking fees & Settlements)
// @route   GET /api/admin/revenue
// @access  Private/Admin
export const getRevenueAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. Total advance fees collected
        const collectedResult = await Payment.aggregate([
            { $match: { status: { $in: ['completed', 'refund_initiated', 'refunded'] } } },
            { $group: { _id: null, total: { $sum: '$advanceFee' } } }
        ]);
        const totalCollected = collectedResult[0]?.total || 0;

        // 2. Breakdown: retained (user cancellations)
        const retainedResult = await Settlement.aggregate([
            { $match: { status: 'retained_by_pillora' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const retained = retainedResult[0]?.total || 0;

        // 3. Breakdown: refunded (hospital cancellations)
        const refundedResult = await Settlement.aggregate([
            { $match: { status: 'refunded' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const refunded = refundedResult[0]?.total || 0;

        // 4. Breakdown: active settlements (pending / settled)
        const activeSettlementsResult = await Settlement.aggregate([
            { $match: { status: { $in: ['pending_settlement', 'settled'] } } },
            { 
                $group: { 
                    _id: null, 
                    totalAmount: { $sum: '$amount' },
                    hospitalShare: { $sum: '$settledAmount' },
                    pilloraCommission: { $sum: { $subtract: ['$amount', '$settledAmount'] } }
                } 
            }
        ]);
        const activeSettlements = activeSettlementsResult[0]?.totalAmount || 0;
        const activeHospitalShare = activeSettlementsResult[0]?.hospitalShare || 0;
        const activePilloraCommission = activeSettlementsResult[0]?.pilloraCommission || 0;

        // 5. Weekly settlement summary
        const weeklySummary = await Settlement.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$settledDate" } },
                    totalAmount: { $sum: "$amount" },
                    payoutAmount: { $sum: "$settledAmount" },
                    commissionAmount: { $sum: { $subtract: ["$amount", "$settledAmount"] } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": -1 } }
        ]);

        // 6. Recent Payments
        const recentPayments = await Payment.find({ status: { $ne: 'pending' } })
            .populate('userId', 'name email')
            .populate('hospitalId', 'name')
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({
            success: true,
            totalCollected,
            breakdown: {
                retained,
                refunded,
                activeSettlements,
                activeHospitalShare,
                activePilloraCommission
            },
            weeklySummary,
            recentPayments
        });
    } catch (error: any) {
        console.error("Error in getRevenueAnalytics:", error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Bulk import blood donors from Excel (.xlsx) file
// @route   POST /api/admin/donors/bulk-import
// @access  Private/Admin
export const bulkImportDonors = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }

        console.log(`[Bulk Import] Received file: ${req.file.originalname}, Size: ${req.file.size} bytes`);

        // Drop the index 'phone_1' if it exists so Mongoose can rebuild it as sparse and optional
        try {
            await BloodDonor.collection.dropIndex('phone_1');
        } catch (idxError) {
            console.log('[Bulk Import] phone_1 index drop skipped (might not exist)');
        }
        
        try {
            await BloodDonor.ensureIndexes();
        } catch (ensureErr: any) {
            console.warn('[Bulk Import] Rebuilding indexes warning:', ensureErr.message);
        }

        // Read workbook using sheetjs
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            res.status(400).json({ message: 'Excel file has no sheets' });
            return;
        }

        const worksheet = workbook.Sheets[sheetName];
        
        // Parse columns to verify headers
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
        const headers: string[] = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
            if (cell && cell.v) {
                headers.push(cell.v.toString().trim());
            } else {
                headers.push('');
            }
        }

        const expectedHeaders = ['Name', 'Age', 'Blood Group', 'Last Blood Donate Date', 'Address', 'City', 'Area'];
        const normalizedHeaders = headers.map(h => h.toLowerCase());
        const missingHeaders = expectedHeaders.filter(h => !normalizedHeaders.includes(h.toLowerCase()));

        if (missingHeaders.length > 0) {
            res.status(400).json({
                message: `Missing required column headers: ${missingHeaders.join(', ')}`,
                error: `The Excel file must contain the following columns: ${expectedHeaders.join(', ')}`
            });
            return;
        }

        // Convert worksheet rows to JSON
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

        const errors: Array<{ row: number; reason: string }> = [];
        let inserted = 0;
        let skipped = 0;

        const getRowValue = (row: any, headerName: string): any => {
            const key = Object.keys(row).find(k => k.trim().toLowerCase() === headerName.toLowerCase());
            return key ? row[key] : undefined;
        };

        const escapeRegex = (str: string) => {
            return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };

        const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

        for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            const excelRowNum = i + 2; // Row 1 is header

            const nameVal = getRowValue(row, 'Name');
            const ageVal = getRowValue(row, 'Age');
            const bgVal = getRowValue(row, 'Blood Group');
            const dateVal = getRowValue(row, 'Last Blood Donate Date');
            const addressVal = getRowValue(row, 'Address');
            const cityVal = getRowValue(row, 'City');
            const areaVal = getRowValue(row, 'Area');

            // 1. Check if all 7 fields are present (non-empty)
            const missingFields: string[] = [];
            if (nameVal === undefined || nameVal === null || String(nameVal).trim() === '') missingFields.push('Name');
            if (ageVal === undefined || ageVal === null || String(ageVal).trim() === '') missingFields.push('Age');
            if (bgVal === undefined || bgVal === null || String(bgVal).trim() === '') missingFields.push('Blood Group');
            if (dateVal === undefined || dateVal === null || String(dateVal).trim() === '') missingFields.push('Last Blood Donate Date');
            if (addressVal === undefined || addressVal === null || String(addressVal).trim() === '') missingFields.push('Address');
            if (cityVal === undefined || cityVal === null || String(cityVal).trim() === '') missingFields.push('City');
            if (areaVal === undefined || areaVal === null || String(areaVal).trim() === '') missingFields.push('Area');

            if (missingFields.length > 0) {
                errors.push({
                    row: excelRowNum,
                    reason: `Missing required fields: ${missingFields.join(', ')}`
                });
                continue;
            }

            // 2. Validate Age is a positive integer
            const ageNum = Number(ageVal);
            if (isNaN(ageNum) || !Number.isInteger(ageNum) || ageNum <= 0) {
                errors.push({
                    row: excelRowNum,
                    reason: `Age must be a positive integer (got: "${ageVal}")`
                });
                continue;
            }

            // 3. Validate Blood Group is valid
            const bgStr = String(bgVal).trim().toUpperCase();
            if (!validBloodGroups.includes(bgStr)) {
                errors.push({
                    row: excelRowNum,
                    reason: `Invalid blood group "${bgVal}" (must be one of: ${validBloodGroups.join(', ')})`
                });
                continue;
            }

            // 4. Validate and parse Last Blood Donate Date
            let lastDonationDate: Date;
            if (dateVal instanceof Date) {
                lastDonationDate = dateVal;
            } else if (typeof dateVal === 'number' && !isNaN(dateVal)) {
                const utc_days = Math.floor(dateVal - 25569);
                const utc_value = utc_days * 86400;
                lastDonationDate = new Date(utc_value * 1000);
            } else {
                lastDonationDate = new Date(String(dateVal).trim());
            }

            if (isNaN(lastDonationDate.getTime())) {
                errors.push({
                    row: excelRowNum,
                    reason: `Invalid date format for Last Blood Donate Date (got: "${dateVal}")`
                });
                continue;
            }

            const trimmedName = String(nameVal).trim();
            const trimmedCity = String(cityVal).trim();
            const trimmedArea = String(areaVal).trim();

            try {
                // 5. Check if donor already exists (name, age, bloodGroup, city, area)
                const existingDonor = await BloodDonor.findOne({
                    name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
                    age: ageNum,
                    bloodGroup: bgStr,
                    city: { $regex: new RegExp(`^${escapeRegex(trimmedCity)}$`, 'i') },
                    area: { $regex: new RegExp(`^${escapeRegex(trimmedArea)}$`, 'i') }
                });

                if (existingDonor) {
                    skipped++;
                    continue;
                }

                // 6. Insert new donor document
                const newDonor = new BloodDonor({
                    name: trimmedName,
                    age: ageNum,
                    bloodGroup: bgStr,
                    lastDonationDate,
                    address: String(addressVal).trim(),
                    city: trimmedCity,
                    area: trimmedArea,
                    gender: 'Other',
                    isAvailable: true,
                    source: 'google_form',
                    location: {
                        type: 'Point',
                        coordinates: [0, 0]
                    }
                });

                await newDonor.save();
                inserted++;
            } catch (dbError: any) {
                console.error(`[Bulk Import] Error saving row ${excelRowNum}:`, dbError);
                errors.push({
                    row: excelRowNum,
                    reason: `Database error: ${dbError.message}`
                });
            }
        }

        res.status(200).json({
            totalRows: rawRows.length,
            inserted,
            skipped,
            errors
        });

    } catch (error: any) {
        console.error('[Bulk Import] Error:', error);
        res.status(500).json({ message: 'Internal Server Error during bulk import', error: error.message });
    }
};

// @desc    Download sample template Excel file for bulk donor import
// @route   GET /api/admin/donors/bulk-import/template
// @access  Private/Admin
export const downloadBulkImportTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Bulk Donors Import Template');

        worksheet.columns = [
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Age', key: 'age', width: 10 },
            { header: 'Blood Group', key: 'bloodGroup', width: 15 },
            { header: 'Last Blood Donate Date', key: 'lastDonationDate', width: 25 },
            { header: 'Address', key: 'address', width: 40 },
            { header: 'City', key: 'city', width: 15 },
            { header: 'Area', key: 'area', width: 15 }
        ];

        // Sample Row 1
        worksheet.addRow({
            name: 'Jane Doe',
            age: 28,
            bloodGroup: 'B+',
            lastDonationDate: '2026-03-15',
            address: '456 Green Valley Road',
            city: 'Mumbai',
            area: 'Andheri'
        });

        // Sample Row 2
        worksheet.addRow({
            name: 'John Smith',
            age: 35,
            bloodGroup: 'O-',
            lastDonationDate: '2026-05-10',
            address: '789 Oak Avenue Apt 4B',
            city: 'Delhi',
            area: 'Connaught Place'
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=bulk_donor_import_template.xlsx');

        await workbook.xlsx.write(res);
        res.status(200).end();
    } catch (error: any) {
        console.error('Template generation error:', error);
        res.status(500).json({ message: 'Failed to generate template', error: error.message });
    }
};
