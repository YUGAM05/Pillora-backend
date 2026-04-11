import { Request, Response } from 'express';
import BloodDonor from '../models/BloodDonor';
import Donor from '../models/Donor';
import BloodRequest from '../models/BloodRequest';
import { AuthRequest } from '../middleware/authMiddleware';
import { getCompatibleDonors } from '../utils/bloodCompatibility';
import { sendWhatsAppMessage } from '../utils/whatsappService';
import { verifyAadhaarLocal } from '../utils/aadhaarVerifier';



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
        console.log(`[BloodRequest] Incoming request from ${req.user.id} for ${bloodGroup} in ${city}. KYC: ${kycDocumentType}`);

        const request = await BloodRequest.create({
            user: req.user.id,
            patientName,
            age,
            bloodGroup,
            units,
            hospitalAddress,
            area,
            city,
            contactNumber,
            status: isUrgent ? 'Urgent' : 'Open',
            isUrgent,
            kycDocumentType,
            kycDocumentId,
            kycDocumentImage
        });

        // Trigger Matching & Notification Logic
        try {
            const compatibleGroups = getCompatibleDonors(bloodGroup);
            console.log(`[BloodMatch] Finding donors for: ${bloodGroup} in ${city}, ${area}. Compatible groups: ${compatibleGroups}`);

            // Search for donors in the specific city/area across both models
            const [donors1, donors2] = await Promise.all([
                Donor.find({
                    blood_group: { $in: compatibleGroups },
                    city: new RegExp(city, 'i'),
                    area: new RegExp(area, 'i'),
                    // isAvailable: true // Not in the schema provided by user, but let's assume availability isn't tracked in the simple schema
                }).limit(5),
                BloodDonor.find({
                    bloodGroup: { $in: compatibleGroups },
                    city: new RegExp(city, 'i'),
                    area: new RegExp(area, 'i'),
                    isAvailable: true
                }).limit(5)
            ]);

            console.log(`[BloodMatch] Found ${donors1.length} in Donor table and ${donors2.length} in BloodDonor table`);

            const allMatchedDonors = [
                ...donors1.map((d: any) => ({ name: d.donor_name, phone: d.donor_phone })),
                ...donors2.map(d => ({ name: d.name, phone: d.phone }))
            ];

            const matchedDonors = Array.from(new Map(allMatchedDonors.map(d => [d.phone, d])).values()).slice(0, 5);
            console.log(`[BloodMatch] Unique matched donors: ${matchedDonors.length}`);

            if (matchedDonors.length > 0) {
                // Get requester's phone
                const requesterPhone = contactNumber;
                console.log(`[BloodMatch] Notifying requester at: ${requesterPhone}`);

                let messageBody = `🚨 Apex Care Blood Match Found! 🚨\n\nFor your request (${bloodGroup} at ${hospitalAddress}), we found compatible donors:\n\n`;

                matchedDonors.forEach(donor => {
                    messageBody += `👤 ${donor.name}\n📞 ${donor.phone}\n\n`;
                });

                messageBody += `Please contact them immediately. Stay Safe!`;

                // Send WhatsApp to requester
                await sendWhatsAppMessage(requesterPhone, messageBody);
                console.log(`[BloodMatch] WhatsApp trigger called for ${requesterPhone}`);
            } else {
                console.log(`[BloodMatch] No donors matched the criteria.`);
            }
        } catch (matchErr) {
            console.error("Auto-matching/Notification error:", matchErr);
            // Don't fail the request creation if notification fails
        }

        // Send response immediately
        res.status(201).json(request);

        // Run AI Verification automatically in background
        if (kycDocumentImage && kycDocumentType === 'Aadhar Card') {
            (async () => {
                try {
                    console.log(`[AutoAI] Starting background verification for request ${request._id}`);
                    const result = await verifyAadhaarLocal(kycDocumentImage, patientName);

                    request.aiVerificationStatus = result.status as any;
                    request.aiVerificationRemarks = result.remarks;
                    await request.save();

                    console.log(`[AutoAI] background verification complete for ${request._id}: ${result.status}`);
                } catch (aiErr) {
                    console.error(`[AutoAI] background verification failed for ${request._id}:`, aiErr);
                }
            })();
        }

    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({ message: error.message || 'Server Error', error });
        } else {
            console.error("Error after response sent:", error);
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
export const getAllDonors = async (req: Request, res: Response): Promise<void> => {
    try {
        const donors = await BloodDonor.find({}).sort({ createdAt: -1 }).populate('user', 'name email');
        res.json(donors);
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

        console.log(`[Controller] Saving request with status: ${request.aiVerificationStatus}...`);
        const savedRequest = await request.save();
        console.log(`[Controller] Request saved successfully. New status: ${savedRequest.aiVerificationStatus}`);

        res.json(savedRequest);

    } catch (error: any) {
        console.error("Agent Verification Error:", error);
        res.status(500).json({ message: 'Agent Verification Failed', error: error.message });
    }
};
