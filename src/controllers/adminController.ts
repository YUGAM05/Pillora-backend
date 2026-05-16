import { Request, Response } from 'express';
import User from '../models/User';
import BloodDonor from '../models/BloodDonor';
import Donor from '../models/Donor';
import Inventory from '../models/Inventory';
import Order from '../models/Order';
import Notification from '../models/Notification';
import Hospital from '../models/Hospital';
import { verifyAadhaarLocal } from '../utils/aadhaarVerifier';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import axios from 'axios';
import slugify from 'slugify';
import AuditLog from '../models/AuditLog';
import PlatformActivity from '../models/PlatformActivity';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import mongoose from 'mongoose';

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
        
        const [donorCount1, donorCount2] = await Promise.all([
            BloodDonor.countDocuments(),
            Donor.countDocuments()
        ]);
        const totalDonors = donorCount1 + donorCount2;

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
            rating: 4.0
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
