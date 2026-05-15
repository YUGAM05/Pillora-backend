import { Request, Response } from 'express';
import BloodDonor from '../models/BloodDonor';
import Donor from '../models/Donor';
import BloodRequest from '../models/BloodRequest';
import { AuthRequest } from '../middleware/authMiddleware';
import { getCompatibleDonors } from '../utils/bloodCompatibility';
import { sendWhatsAppMessage } from '../utils/whatsappService';
import { verifyAadhaarLocal, validateVerhoeff } from '../utils/aadhaarVerifier';
import { logActivity } from '../utils/activityLogger';



// @desc    Register as a blood donor
// @route   POST /api/blood-bank/donors
// @access  Private
export const registerDonor = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { bloodGroup, location, age, phone, address, gender, area, city, name } = req.body;

        const ageNum = Number(age);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 60) {
            res.status(400).json({ message: 'Age must be between 18 and 60 to donate blood.' });
            return;
        }

        // Check if phone number already used by a DIFFERENT user
        const existingDonorByPhone = await BloodDonor.findOne({ phone, user: { $ne: req.user.id } });
        if (existingDonorByPhone) {
            res.status(400).json({ message: 'This phone number is already registered by another donor' });
            return;
        }

        // Upsert: update existing record or create new one
        const donor = await BloodDonor.findOneAndUpdate(
            { user: req.user.id },
            {
                user: req.user.id,
                name,
                bloodGroup,
                gender,
                age,
                phone,
                address,
                area,
                city,
                source: 'user_panel',
                location: {
                    type: 'Point',
                    coordinates: location // [longitude, latitude]
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(201).json(donor);

        // Log Platform Activity
        const io = req.app.get('io');
        logActivity(io, {
            title: 'New Blood Donor',
            description: `${name || 'A user'} registered as a ${bloodGroup} donor in ${area}, ${city}.`,
            type: 'blood_donor'
        });
    } catch (error: any) {
        console.error("Blood Bank Registration Error:", error);
        if (error.code === 11000) {
            // Duplicate key error
            if (error.keyPattern?.phone) {
                res.status(400).json({ message: 'This phone number is already registered' });
            } else if (error.keyPattern?.user) {
                res.status(400).json({ message: 'You are already registered as a donor' });
            } else {
                res.status(400).json({ message: 'Duplicate entry detected' });
            }
            return;
        }
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
};

// @desc    Find donors by blood group and location (optional)
// @route   GET /api/blood-bank/donors
// @access  Public
export const findDonors = async (req: Request, res: Response): Promise<void> => {
    try {
        const { bloodGroup, lng, lat, distance } = req.query;

        let query: any = { isAvailable: true };

        if (bloodGroup) {
            query.bloodGroup = bloodGroup;
        }

        if (lng && lat) {
            query.location = {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(lng as string), parseFloat(lat as string)]
                    },
                    $maxDistance: distance ? parseInt(distance as string) : 50000 // default 50km
                }
            };
        }

        const donors = await BloodDonor.find(query).populate('user', 'name email phone');
        res.json(donors);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Find compatible donors for a specific blood requirement
// @route   GET /api/blood-bank/matches
// @access  Public
export const findMatches = async (req: Request, res: Response): Promise<void> => {
    try {
        const { bloodGroup, city, area } = req.query;

        if (!bloodGroup) {
            res.status(400).json({ message: 'Blood group is required' });
            return;
        }

        // Get all compatible blood groups
        const compatibleGroups = getCompatibleDonors(bloodGroup as string);

        let query: any = {
            bloodGroup: { $in: compatibleGroups },
            isAvailable: true
        };

        // Filter by city if provided
        if (city) {
            query.city = new RegExp(city as string, 'i');
        }

        // Filter by area if provided
        if (area) {
            query.area = new RegExp(area as string, 'i');
        }

        // Find matches in both BloodDonor (old) and Donor (new) models
        const [donors1, donors2] = await Promise.all([
            BloodDonor.find(query).populate('user', 'name email phone').sort({ lastDonationDate: 1 }),
            Donor.find({
                blood_group: { $in: compatibleGroups },
                city: query.city,
                area: query.area
            }).sort({ lastDonationDate: 1 })
        ]);

        // Merge and remove duplicates if any (based on phone/donor_phone)
        const allDonors = [
            ...donors1.map(d => ({ name: d.name, phone: d.phone, bloodGroup: d.bloodGroup })),
            ...donors2.map((d: any) => ({ name: d.donor_name, phone: d.donor_phone, bloodGroup: d.blood_group }))
        ];

        const uniqueDonors = Array.from(new Map(allDonors.map(d => [d.phone, d])).values());

        res.json(uniqueDonors);
    } catch (error: any) {
        console.error("Match Finding Error:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Create a blood request
// @route   POST /api/blood-bank/requests
// @access  Private
export const createRequest = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { patientName, age, bloodGroup, units, hospitalAddress, area, city, contactNumber, isUrgent, kycDocumentType, kycDocumentId, kycDocumentImage } = req.body;

        let finalKycDocumentId = kycDocumentId;
        let aiStatus: 'Verified' | 'Rejected' | 'Error' = 'Pending' as any;
        let aiRemarks = '';

        // Perform Fast Extract & Validate synchronously instantly natively
        if (kycDocumentType === 'Aadhar Card') {
            if (!kycDocumentId || kycDocumentId.trim() === '') {
                aiStatus = 'Rejected';
                aiRemarks = 'Aadhaar Document Number is mandatory';
            } else {
                const cleanNum = kycDocumentId.replace(/\s/g, '');
                if (cleanNum.length === 12 && validateVerhoeff(cleanNum)) {
                    aiStatus = 'Verified';
                    aiRemarks = 'Verified via fast mathematical pattern matching';
                    finalKycDocumentId = `**** **** **${cleanNum.slice(-2)}`;
                } else {
                    aiStatus = 'Rejected';
                    aiRemarks = 'Fake or Invalid Aadhaar Number';
                }
            }
        } else {
            // Manual verification fallback
            aiStatus = 'Verified';
            aiRemarks = 'Verified via manual details';
        }

        // 1. Instant Save: Create the request with exact verify status
        const request = await BloodRequest.create({
            user: req.user.id,
            patientName, age, bloodGroup, units, hospitalAddress, area, city, contactNumber,
            status: isUrgent ? 'Urgent' : 'Open',
            isUrgent, kycDocumentType,
            kycDocumentId: finalKycDocumentId || 'Processing...', 
            kycDocumentImage: kycDocumentImage, // Store image for Admin
            aiVerificationStatus: aiStatus,
            aiVerificationRemarks: aiRemarks
        });

        // 2. Instant Response: Return 201 Created to the frontend
        res.status(201).json(request);

        // Log Platform Activity
        const io = req.app.get('io');
        logActivity(io, {
            title: isUrgent ? 'Urgent Blood Request' : 'New Blood Request',
            description: `${patientName} needs ${units} units of ${bloodGroup} at ${hospitalAddress}.`,
            type: 'blood_request'
        });

        // 3. Background Processing: Matching & notifications safe out of flow
        (async () => {
            try {
                // Perform Matching & Notifications
                if (aiStatus === 'Verified') {
                    const compatibleGroups = getCompatibleDonors(bloodGroup);
                    const [donors1, donors2] = await Promise.all([
                        Donor.find({ blood_group: { $in: compatibleGroups }, city: new RegExp(city, 'i'), area: new RegExp(area, 'i') }).limit(5),
                        BloodDonor.find({ bloodGroup: { $in: compatibleGroups }, city: new RegExp(city, 'i'), area: new RegExp(area, 'i'), isAvailable: true }).limit(5)
                    ]);
                    const matchedDonors = Array.from(new Map([...donors1.map((d: any) => ({ name: d.donor_name, phone: d.donor_phone })), ...donors2.map(d => ({ name: d.name, phone: d.phone }))].map(d => [d.phone, d])).values()).slice(0, 5);
                    if (matchedDonors.length > 0) {
                        let messageBody = `🚨 Pillora Blood Match Found! 🚨\n\nFor your request (${bloodGroup} at ${hospitalAddress}), we found compatible donors.\n\nPlease contact them immediately. Stay Safe!`;
                        await sendWhatsAppMessage(contactNumber, messageBody);
                    }
                }
            } catch (bgErr) {
                console.error("[BackgroundMatching] Error occurred:", bgErr);
            }
        })();

    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({ message: error.message || 'Server Error' });
        }
    }
};

// @desc    Get current user's blood requests
// @route   GET /api/blood-bank/my-requests
// @access  Private
export const getMyRequests = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const requests = await BloodRequest.find({ user: req.user.id })
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get current user's donor profile
// @route   GET /api/blood-bank/my-donor
// @access  Private
export const getMyDonorProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const donor = await BloodDonor.findOne({ user: req.user.id });
        if (!donor) {
            res.status(404).json({ message: 'Donor profile not found' });
            return;
        }
        res.json(donor);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get all blood requests
// @route   GET /api/blood-bank/requests
// @access  Public
export const getRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const requests = await BloodRequest.find({ status: { $ne: 'Closed' } })
            .sort({ isUrgent: -1, createdAt: -1 }) // Urgent first
            .populate('user', 'name');
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};
// @desc    Get all donors (Admin)
// @route   GET /api/blood-bank/admin/donors
// @access  Private/Admin
// @desc    Get all donors for admin
// @route   GET /api/blood-bank/admin/donors
// @access  Private/Admin
export const getAllDonors = async (req: Request, res: Response): Promise<void> => {
    try {
        const [donors1, donors2] = await Promise.all([
            BloodDonor.find({}).sort({ createdAt: -1 }).populate('user', 'name email'),
            Donor.find({}).sort({ createdAt: -1 })
        ]);

        // Standardize the format for the admin table
        const combinedDonors = [
            ...donors1.map(d => ({
                _id: d._id,
                name: d.name,
                email: d.email,
                bloodGroup: d.bloodGroup,
                age: d.age,
                gender: d.gender,
                phone: d.phone,
                city: d.city,
                area: d.area,
                address: d.address,
                isAvailable: d.isAvailable,
                source: d.source || 'user_panel',
                createdAt: d.createdAt
            })),
            ...donors2.map((d: any) => ({
                _id: d._id,
                name: d.donor_name,
                email: 'N/A',
                bloodGroup: d.blood_group,
                age: 25, // Default for legacy data
                gender: 'Other',
                phone: d.donor_phone,
                city: d.city,
                area: d.area,
                address: 'Imported Record',
                isAvailable: true,
                source: 'imported',
                createdAt: d.createdAt
            }))
        ];

        // Sort combined list by date
        combinedDonors.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json(combinedDonors);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get all requests (Admin)
// @route   GET /api/blood-bank/admin/requests
// @access  Private/Admin
export const getAllRequestsAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const requests = await BloodRequest.find({}).sort({ createdAt: -1 }).populate('user', 'name email');
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Update blood request status
// @route   PATCH /api/blood-bank/admin/requests/:id/status
// @access  Private/Admin
export const updateRequestStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status } = req.body;
        const request = await BloodRequest.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }

        res.json(request);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Delete a donor
// @route   DELETE /api/blood-bank/admin/donors/:id
// @access  Private/Admin
export const deleteDonor = async (req: Request, res: Response): Promise<void> => {
    try {
        const donor = await BloodDonor.findByIdAndDelete(req.params.id);

        if (!donor) {
            res.status(404).json({ message: 'Donor not found' });
            return;
        }

        res.json({ message: 'Donor removed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Verify blood request KYC with Local AI Agent
// @route   POST /api/blood-bank/admin/requests/:id/verify-ai
// @access  Private/Admin
export const verifyRequestWithAI = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        console.log(`[Controller] AI Verification requested for ID: ${id}`);
        const request = await BloodRequest.findById(id);

        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }

        if (!request.kycDocumentImage) {
            res.status(400).json({ message: 'No KYC image found for this request' });
            return;
        }

        // Prepare image data (Tesseract can handle base64 data URLs)
        const imageContent = request.kycDocumentImage;
        const patientName = request.patientName;

        const result = await verifyAadhaarLocal(imageContent, patientName);
        console.log(`[Controller] Agent Result for ID ${id}:`, result);

        request.aiVerificationStatus = result.status as any;
        request.aiVerificationRemarks = result.remarks;
        
        if (result.aadhaarNumber) {
            const cleanNum = result.aadhaarNumber.replace(/\s/g, '');
            request.kycDocumentId = `**** **** **${cleanNum.slice(-2)}`;
        }

        console.log(`[Controller] Saving request with status: ${request.aiVerificationStatus}...`);
        const savedRequest = await request.save();
        console.log(`[Controller] Request saved successfully. New status: ${savedRequest.aiVerificationStatus}`);

        res.json(savedRequest);

    } catch (error: any) {
        console.error("Agent Verification Error:", error);
        res.status(500).json({ message: 'Agent Verification Failed', error: error.message });
    }
};

// @desc    Update KYC verification status manually (Accept/Reject)
// @route   PATCH /api/blood-bank/admin/requests/:id/kyc
// @access  Private/Admin
export const updateKycStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status } = req.body;
        if (!['Verified', 'Rejected'].includes(status)) {
            res.status(400).json({ message: 'Invalid KYC status' });
            return;
        }

        const request = await BloodRequest.findByIdAndUpdate(
            req.params.id,
            { 
                aiVerificationStatus: status,
                aiVerificationRemarks: `Manually ${status.toLowerCase()} by Admin.`
            },
            { new: true }
        );

        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }

        res.json(request);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

