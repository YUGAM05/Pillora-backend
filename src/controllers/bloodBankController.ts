import { Request, Response } from 'express';
import BloodDonor from '../models/BloodDonor';
import BloodRequest from '../models/BloodRequest';
import { AuthRequest } from '../middleware/authMiddleware';
import { getCompatibleDonors } from '../utils/bloodCompatibility';
import { verifyAadhaarLocal, validateVerhoeff } from '../utils/aadhaarVerifier';
import { logActivity } from '../utils/activityLogger';
import { processKYCResult } from '../services/bloodConnectService';
import { sendTelegramMessage } from '../utils/telegram';

// Escape user input before building a RegExp (prevents ReDoS / regex errors)
const escapeRegex = (s: string): string => s.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "a+", "A " (a '+' decoded from a query string becomes a space) -> "A+"
const normalizeBloodGroup = (v: unknown): string =>
    String(v).toUpperCase().replace(/\s+$/, '+').replace(/\s/g, '').slice(0, 3);

/**
 * Version of the donor sharing consent shown on the donor form (Pillora/src/app/blood-bank/BloodBankClient.tsx).
 * Change it whenever that wording changes, so each donor's recorded consent can be traced to the text they saw.
 */
export const DONOR_CONSENT_VERSION = '2026-11-19';


// @desc    Register as a blood donor
// @route   POST /api/blood-bank/donors
// @access  Private
export const registerDonor = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { bloodGroup, location, age, phone, address, gender, area, city, name, consentToShare } = req.body;

        // Sharing consent. The current donor form (pillora.in/blood-bank) already tells donors that
        // their name and phone are shared when someone nearby needs blood, but it does not send an
        // explicit flag yet. Record the explicit consent when the form sends it; registration is
        // not blocked without it until the form has the checkbox (see audit report).
        const consentFields = consentToShare === true
            ? { sharingConsentAt: new Date(), sharingConsentVersion: DONOR_CONSENT_VERSION, sharingConsentSource: 'donor_form' }
            : {};

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

        // Upsert: update existing record by phone or create a new one
        const donor = await BloodDonor.findOneAndUpdate(
            { phone: phone },
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
                ...consentFields,
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

/** "Rahul Kumar Sharma" -> "Rahul S." (first name + last initial). */
export const maskPersonName = (name?: string): string => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Donor';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
};

/** Date -> "YYYY-MM" (month only, never the exact day). */
const toMonth = (d?: Date | null): string | null => {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Public donor shape. Never phone, address, exact location, email, age, gender or account ids.
 * Contact details reach a requester only through the admin-approved request flow.
 */
const toPublicDonor = (d: any) => ({
    name: maskPersonName(d.name),
    bloodGroup: d.bloodGroup,
    city: d.city || '',
    area: d.area || '',
    isAvailable: d.isAvailable !== false,
    lastDonationMonth: toMonth(d.lastDonationDate),
});

// @desc    Find donors by blood group / city / area (public, reduced fields)
// @route   GET /api/blood-bank/donors
// @access  Public
export const findDonors = async (req: Request, res: Response): Promise<void> => {
    try {
        const { bloodGroup, city, area } = req.query;

        const query: any = { isAvailable: true };

        if (bloodGroup) {
            // String() blocks operator injection like ?bloodGroup[$ne]=x
            query.bloodGroup = normalizeBloodGroup(bloodGroup);
        }
        if (city) query.city = new RegExp(escapeRegex(String(city).trim()), 'i');
        if (area) query.area = new RegExp(escapeRegex(String(area).trim()), 'i');
        // The geo ($near lng/lat/distance) filter was removed: repeated distance queries
        // could be used to locate a donor.

        const donors = await BloodDonor.find(query)
            .select('name bloodGroup city area isAvailable lastDonationDate')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        res.json(donors.map(toPublicDonor));
    } catch (error) {
        console.error('[findDonors]', (error as any)?.message || error);
        res.status(500).json({ message: 'Server Error' });
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
        const compatibleGroups = getCompatibleDonors(normalizeBloodGroup(bloodGroup));

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        let query: any = {
            bloodGroup: { $in: compatibleGroups },
            isAvailable: true,
            $or: [
                { lastDonationDate: { $exists: false } },
                { lastDonationDate: null },
                { lastDonationDate: { $lte: ninetyDaysAgo } }
            ]
        };

        // Filter by city if provided
        if (city) {
            query.city = new RegExp(escapeRegex(String(city)), 'i');
        }

        // Filter by area if provided
        if (area) {
            query.area = new RegExp(escapeRegex(String(area)), 'i');
        }

        // Find matches in unified BloodDonor model
        const donors = await BloodDonor.find(query).select('name phone bloodGroup').sort({ lastDonationDate: 1 }).limit(200);

        // Map and remove duplicates if any (based on phone)
        const allDonors = donors.map(d => ({ name: d.name, phone: d.phone, bloodGroup: d.bloodGroup }));
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
        const { patientName, age, bloodGroup, units, hospitalAddress, area, city, contactNumber, isUrgent, kycDocumentType, kycDocumentId, kycDocumentImage, email, unitsNeeded, coordinationNumber } = req.body;

        let finalKycDocumentId = kycDocumentId;
        let aiStatus: 'Pending' | 'Verified' | 'Rejected' | 'Error' = 'Pending';
        let aiRemarks = '';

        // ID check. Nothing is approved automatically: an admin reviews the ID document
        // (PATCH /admin/requests/:id/kyc) before any donor details are shared.
        // An Aadhaar number that fails the checksum is rejected straight away.
        if (kycDocumentType === 'Aadhar Card') {
            const cleanNum = String(kycDocumentId || '').replace(/\s/g, '');
            if (!cleanNum) {
                aiStatus = 'Rejected';
                aiRemarks = 'Aadhaar number is required.';
            } else if (cleanNum.length === 12 && validateVerhoeff(cleanNum)) {
                aiStatus = 'Pending';
                aiRemarks = 'Waiting for our team to check your ID document.';
                finalKycDocumentId = `**** **** **${cleanNum.slice(-2)}`;
            } else {
                aiStatus = 'Rejected';
                aiRemarks = 'The Aadhaar number is not valid. Please check it and submit again.';
            }
        } else {
            aiStatus = 'Pending';
            aiRemarks = 'Waiting for our team to check your ID document.';
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
            aiVerificationRemarks: aiRemarks,
            email: email || (req.user as any)?.email,
            unitsNeeded: unitsNeeded || units,
            coordinationNumber: coordinationNumber || contactNumber
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

        // Send Telegram notification
        sendTelegramMessage(
            `🩸 <b>New Blood Request</b>${aiStatus === 'Pending' ? ' (ID review needed)' : ''}\n🅰️ Blood Group: ${bloodGroup}\n📍 City: ${city}\n📞 Contact: ${contactNumber}\n🕐 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
        ).catch(err => console.error('Telegram notification failed:', err));

        // 3. A rejected Aadhaar number gets the failure email now. Pending requests wait for
        //    an admin decision; donor details are shared only after approval (updateKycStatus).
        if (aiStatus === 'Rejected') {
            processKYCResult(request._id.toString(), false).catch(err =>
                console.error('[createRequest] KYC failure email error:', err?.message || err));
        }

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
        // Public list: no KYC, contact number, email, age, account id or verification notes.
        // Fake/rejected requests are not listed.
        const requests = await BloodRequest.find({ status: { $nin: ['Closed', 'Fake'] } })
            .select('patientName bloodGroup units unitsNeeded hospitalAddress area city isUrgent status createdAt')
            .sort({ isUrgent: -1, createdAt: -1 }) // Urgent first
            .limit(200)
            .lean();
        res.json(requests.map((r: any) => ({
            _id: r._id,
            patientName: maskPersonName(r.patientName),
            bloodGroup: r.bloodGroup,
            units: r.unitsNeeded || r.units,
            hospitalAddress: r.hospitalAddress,
            area: r.area,
            city: r.city,
            isUrgent: Boolean(r.isUrgent),
            status: r.status,
            createdAt: r.createdAt,
        })));
    } catch (error) {
        console.error('[getRequests]', (error as any)?.message || error);
        res.status(500).json({ message: 'Server Error' });
    }
};
// @desc    Get all donors (Admin)
// @route   GET /api/blood-bank/admin/donors
// @access  Private/Admin
// @desc    Get all donors for admin
// @route   GET /api/blood-bank/admin/donors
// @access  Private/Admin
export const standardizeDonor = (d: any) => {
  const lastDonation = d.lastDonationDate;
  let eligibleFromDate = null;
  let status = 'Eligible';
  let daysRemaining = 0;

  if (lastDonation) {
    const donationDate = new Date(lastDonation);
    const eligibleDate = new Date(donationDate.getTime());
    eligibleDate.setDate(donationDate.getDate() + 90);
    eligibleFromDate = eligibleDate;

    const today = new Date();
    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const eligibleZero = new Date(eligibleDate.getFullYear(), eligibleDate.getMonth(), eligibleDate.getDate());

    if (todayZero >= eligibleZero) {
      status = 'Eligible';
    } else {
      status = 'Not Eligible';
      const diffTime = eligibleZero.getTime() - todayZero.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }

  return {
    _id: d._id,
    name: d.name,
    email: d.email || (d.user as any)?.email || 'N/A',
    bloodGroup: d.bloodGroup,
    age: d.age,
    gender: d.gender,
    phone: d.phone,
    city: d.city,
    area: d.area,
    address: d.address,
    isAvailable: d.isAvailable,
    source: d.source || 'user_panel',
    lastDonationDate: lastDonation || null,
    eligibleFromDate,
    eligibilityStatus: status,
    daysRemaining,
    createdAt: d.createdAt
  };
};

export const getAllDonors = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    const total = await BloodDonor.countDocuments({});
    const donors = await BloodDonor.find({})
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .skip(skip)
      .limit(limit);

    console.log(`[AdminDonors] Total in DB: ${total}, Returning: ${donors.length}`);

    const standardizedDonors = donors.map(d => standardizeDonor(d));

    res.status(200).json({
      donors: standardizedDonors,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching donors for admin:', error);
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
        const { id } = req.params;
        const donor = await BloodDonor.findByIdAndDelete(id);

        if (!donor) {
            res.status(404).json({ message: 'Donor not found' });
            return;
        }

        res.json({ message: 'Donor removed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Delete multiple donors
// @route   POST /api/blood-bank/admin/donors/delete-many
// @access  Private/Admin
export const deleteManyDonors = async (req: Request, res: Response): Promise<void> => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs list' });
            return;
        }

        const result = await BloodDonor.deleteMany({ _id: { $in: ids } });

        res.json({ message: `${result.deletedCount} donors removed successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Delete a request
// @route   DELETE /api/blood-bank/admin/requests/:id
// @access  Private/Admin
export const deleteRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        console.log(`[BloodBankController] DELETE request received for ID: ${id}`);
        
        const request = await BloodRequest.findByIdAndDelete(id);

        if (!request) {
            console.warn(`[BloodBankController] Request with ID ${id} NOT found for deletion.`);
            res.status(404).json({ message: 'Request document not found in database (404)' });
            return;
        }

        console.log(`[BloodBankController] Successfully deleted request ID: ${id}`);
        res.json({ message: 'Request removed successfully' });
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
        console.log(`[Controller] Agent result for ID ${id}: ${result.status}`);

        // Advisory only: the OCR result is recorded for the admin, who then approves or
        // rejects with PATCH /admin/requests/:id/kyc. It never shares donor details itself.
        request.aiVerificationRemarks = `Automatic document check: ${result.status}. ${result.remarks || ''}`.trim();
        
        if (result.aadhaarNumber) {
            const cleanNum = result.aadhaarNumber.replace(/\s/g, '');
            request.kycDocumentId = `**** **** **${cleanNum.slice(-2)}`;
        }

        const savedRequest = await request.save();

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

        // Trigger automated KYC and notification flow
        const kycPassed = status === 'Verified';
        processKYCResult(request._id.toString(), kycPassed).catch(err => {
            console.error('[updateKycStatus] Error running processKYCResult:', err);
        });

        res.json(request);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Delete user's own request
// @route   DELETE /api/blood-bank/requests/:id
// @access  Private
export const deleteMyRequest = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const request = await BloodRequest.findById(id);

        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }

        // Verify ownership
        if (request.user.toString() !== req.user.id) {
            res.status(401).json({ message: 'User not authorized to delete this request' });
            return;
        }

        await request.deleteOne();
        res.json({ message: 'Request deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// @desc    Update donor details (Admin)
// @route   PATCH /api/blood-bank/admin/donors/:id
// @access  Private/Admin
export const updateDonorAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { lastDonationDate, isAvailable, name, email, phone, age, gender, address, area, city, sharingConsentConfirmed } = req.body;

        const updateData: any = {};
        if (lastDonationDate !== undefined) {
            updateData.lastDonationDate = lastDonationDate ? new Date(lastDonationDate) : null;
        }
        if (isAvailable !== undefined) {
            updateData.isAvailable = isAvailable;
        }
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (age !== undefined) updateData.age = Number(age);
        if (gender !== undefined) updateData.gender = gender;
        if (address !== undefined) updateData.address = address;
        if (area !== undefined) updateData.area = area;
        if (city !== undefined) updateData.city = city;
        // Record sharing consent after confirming it directly with the donor (e.g. imported donors).
        if (sharingConsentConfirmed === true) {
            updateData.sharingConsentAt = new Date();
            updateData.sharingConsentVersion = DONOR_CONSENT_VERSION;
            updateData.sharingConsentSource = 'admin_confirmed';
        } else if (sharingConsentConfirmed === false) {
            updateData.sharingConsentAt = null;
        }

        const donor = await BloodDonor.findByIdAndUpdate(id, updateData, { new: true });

        if (!donor) {
            res.status(404).json({ message: 'Donor not found' });
            return;
        }

        res.json(standardizeDonor(donor));
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
};

