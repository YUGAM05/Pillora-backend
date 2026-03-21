import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const generateToken = (id: string, role: string) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'defaultSecret', {
        expiresIn: '30d',
    });
};

export const registerUser = async (req: Request, res: Response): Promise<void> => {
    const { name, email, password, role, bankDetails, pharmacyCertificate, aadhaarCardUrl, phone, address } = req.body;

    try {
        console.log(`Registering user: ${email}, Role: ${role}`);
        const userExists = await User.findOne({ email: email.toLowerCase() });
        if (userExists) {
            console.log('Registration failed: User already exists');
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const initialStatus = (role === 'seller' || role === 'delivery') ? 'pending' : 'approved';

        const userData: any = {
            name,
            email: email.toLowerCase(),
            passwordHash,
            role: role || 'customer',
            status: initialStatus,
            phone,
            address
        };

        if (role === 'seller') {
            const sellerFields = [
                'bankDetails', 'pharmacyCertificate', 'aadhaarCardUrl', 'aadhaarNumber',
                'ownerPhotoUrl', 'ownerPan', 'panCardUrl', 'businessPan',
                'businessType', 'yearsInOperation', 'retailDrugLicense',
                'drugLicenseNumber', 'licenseExpiryDate', 'pharmacistCertificate',
                'gstNumber', 'cancelledChequeUrl', 'shopEstablishmentUrl',
                'rentAgreementUrl', 'shopPhotoFrontUrl', 'shopPhotoInsideUrl',
                'whatsappNumber', 'alternateContact', 'operatingHours',
                'agreedToTerms', 'agreedToCompliance', 'agreedToNoBannedDrugs',
                'selfDeclarationValidLicenses', 'pharmacy_name'
            ];
            
            sellerFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    userData[field] = req.body[field];
                }
            });
        } else if (role === 'delivery') {
            const deliveryFields = [
                'dob', 'gender', 'aadhaarNumber', 'aadhaarCardUrl', 'aadhaarBackUrl',
                'ownerPan', 'panCardUrl', 'ownerPhotoUrl', 'vehicleType', 'vehicleRegNumber',
                'dlNumber', 'dlExpiryDate', 'dlFrontUrl', 'dlBackUrl', 'rcUrl',
                'insuranceUrl', 'whatsappNumber', 'emergencyContactName', 
                'emergencyContactNumber', 'bankDetails', 'cancelledChequeUrl',
                'upiId', 'preferredZones', 'availableHours', 'daysAvailable',
                'employmentType', 'noCriminalRecord', 'policeVerificationUrl',
                'referenceContact', 'agreedToTerms', 'agreedToGpsTracking',
                'agreedToHandleMeds', 'acknowledgeSla', 'consentBackgroundCheck'
            ];
            
            deliveryFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    userData[field] = req.body[field];
                }
            });
        }

        const user = await User.create(userData) as any;

        if (user) {
            console.log('User created successfully:', user._id);
            if (user.status === 'pending') {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    message: "Registration successful. Please wait for admin approval."
                });
            } else {
                res.status(201).json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    phone: user.phone,
                    address: user.address,
                    location: user.location,
                    token: generateToken(user._id as string, user.role),
                });
            }
        } else {
            console.log('Registration failed: User creation returned null');
            res.status(400).json({ message: 'Invalid user data provided' });
        }
    } catch (error: any) {
        console.error('Registration Server Error:', error);
        res.status(500).json({
            message: 'Internal server error during registration',
            details: error.message
        });
    }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    console.log(`[LoginRequest] Received login attempt for: ${email}`);

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (user && user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
            console.log(`Login attempt for ${email}: Role=${user.role}, Status=${user.status}`);

            // Allow admin, customer, or any non-rejected user to login
            // We only block rejected users here. Pending users can login but usually have limited access on frontend.
            if (user.role !== 'admin' && user.status === 'rejected') {
                res.status(403).json({
                    message: 'Your account has been rejected. Please contact support.',
                    status: user.status
                });
                return;
            }

            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                phone: user.phone,
                address: user.address,
                location: user.location,
                token: generateToken(user._id as unknown as string, user.role),
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error: any) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message || error });
    }
};
// Temporary Setup Route
export const setupAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const email = 'admin@life-link.com';
        const password = 'admin';
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        await User.findOneAndUpdate(
            { email },
            { name: 'Super Admin', email, passwordHash, role: 'admin', status: 'approved' },
            { upsert: true, new: true }
        );

        console.log("Admin setup complete via API.");
        res.json({ message: "Admin Account Created Successfully! Login with admin@life-link.com / admin" });
    } catch (error: any) {
        console.error('Setup Admin Error:', error);
        res.status(500).json({ message: 'Setup Failed', error: error.message || error });
    }
};
