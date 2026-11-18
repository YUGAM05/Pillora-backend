import BloodRequest from '../models/BloodRequest';
import BloodDonor from '../models/BloodDonor';
import { sendKYCFailedEmail, sendNoDonorFoundEmail, sendDonorFoundEmail } from './emailService';
import { sendWhatsAppTemplate } from './whatsappService';

/**
 * Donor sharing rules (Nov 2026):
 *  - Donor details are shared only after an admin has approved the requester's
 *    ID (PATCH /api/blood-bank/admin/requests/:id/kyc). Nothing is shared automatically.
 *  - Only donors with a recorded sharing consent (sharingConsentAt) are matched.
 *    Imported donors without consent are never shared until consent is recorded.
 *  - At most MAX_DONORS_SHARED donors per request, and each request shares once.
 *  - Never log donor or requester personal data.
 */
export const MAX_DONORS_SHARED = 5;

const escapeRegex = (str: string) => str.slice(0, 100).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

/** Query filters common to every donor match. */
const eligibleDonorFilter = (ninetyDaysAgo: Date) => ({
  // Only donors who agreed to have their name and phone shared with requesters.
  sharingConsentAt: { $exists: true, $ne: null },
  $and: [
    { $or: [{ isAvailable: true }, { isAvailable: { $exists: false } }, { isAvailable: null }] },
    // Completed the 90-day gap since the last donation
    { $or: [{ lastDonationDate: { $exists: false } }, { lastDonationDate: null }, { lastDonationDate: { $lte: ninetyDaysAgo } }] },
  ],
});

/**
 * Searches for matching blood donors and notifies the requester.
 * First queries by bloodGroup + city + area; if none, falls back to city + bloodGroup.
 * Must only be called after the requester's ID has been approved.
 */
export const searchAndNotifyDonors = async (requestId: string): Promise<void> => {
  try {
    // Claim the request atomically so donor details are shared at most once,
    // even if the approval is clicked twice.
    const request = await BloodRequest.findOneAndUpdate(
      { _id: requestId, donorsSharedAt: { $exists: false } },
      { $set: { donorsSharedAt: new Date() } },
      { new: true }
    );
    if (!request) {
      console.log(`[searchAndNotifyDonors] Request ${requestId} not found or donors already shared; skipping.`);
      return;
    }

    const cityVal = (request.city || '').trim();
    const areaVal = (request.area || '').trim();
    const bloodGroupVal = (request.bloodGroup || '').trim();

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const base = {
      bloodGroup: { $regex: `^${escapeRegex(bloodGroupVal)}$`, $options: 'i' },
      city: { $regex: escapeRegex(cityVal), $options: 'i' },
      ...eligibleDonorFilter(ninetyDaysAgo),
    };

    // Longest since last donation first; capped.
    let donors = await BloodDonor.find({ ...base, area: { $regex: escapeRegex(areaVal), $options: 'i' } })
      .sort({ lastDonationDate: 1 })
      .limit(MAX_DONORS_SHARED);
    if (donors.length === 0) {
      donors = await BloodDonor.find(base).sort({ lastDonationDate: 1 }).limit(MAX_DONORS_SHARED);
    }
    console.log(`[searchAndNotifyDonors] Request ${requestId}: ${donors.length} consenting donor(s) matched (max ${MAX_DONORS_SHARED}).`);

    const emailToUse = request.email || '';
    if (donors.length === 0) {
      await request.updateOne({ status: 'no_donor_found', donorsSharedCount: 0 });
      if (emailToUse) {
        await sendNoDonorFoundEmail({
          toEmail: emailToUse,
          patientName: request.patientName,
          bloodGroup: bloodGroupVal,
          city: cityVal,
          area: areaVal
        });
      }
      return;
    }

    // DONORS FOUND: send email and WhatsApp with donor details
    await request.updateOne({ status: 'matched', donorsSharedCount: donors.length });
    const contactPhone = request.contactNumber || (request as any).phone;
    if (contactPhone) {
      try {
        const matchedDonor = donors[0];
        await sendWhatsAppTemplate(
          contactPhone,
          'donor_found_alert',
          'en',
          [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: request.patientName || 'Requester' },
                { type: 'text', text: bloodGroupVal },
                { type: 'text', text: matchedDonor?.name || 'Volunteer Donor' },
                { type: 'text', text: matchedDonor?.phone || 'N/A' }
              ]
            }
          ]
        );
        console.log(`[searchAndNotifyDonors] WhatsApp donor_found_alert sent for request ${requestId}`);
      } catch (waErr: any) {
        console.error('[searchAndNotifyDonors] WhatsApp dispatch error:', waErr.message || waErr);
      }
    }

    if (emailToUse) {
      await sendDonorFoundEmail({
        toEmail: emailToUse,
        patientName: request.patientName,
        bloodGroup: bloodGroupVal,
        unitsNeeded: request.unitsNeeded || request.units || 1,
        requestArea: areaVal,
        requestCity: cityVal,
        donors: donors.map((d: any) => ({
          name: d.name || 'Anonymous',
          bloodGroup: d.bloodGroup || bloodGroupVal,
          phone: d.phone || 'N/A',
          area: d.area || '',
          city: d.city || ''
        }))
      });
    }
  } catch (error: any) {
    console.error('[searchAndNotifyDonors] Error searching or notifying donors:', error?.message || error);
  }
};

/**
 * Called when the requester's ID check is decided (by an admin).
 * Passed: share up to MAX_DONORS_SHARED consenting donors (once). Failed: email the requester.
 */
export const processKYCResult = async (requestId: string, kycPassed: boolean): Promise<void> => {
  try {
    const bloodRequest = await BloodRequest.findById(requestId);
    if (!bloodRequest) {
      console.error(`[processKYCResult] BloodRequest not found for ID: ${requestId}`);
      return;
    }

    if (!kycPassed) {
      await bloodRequest.updateOne({ kycStatus: 'failed' });
      if (bloodRequest.email) {
        await sendKYCFailedEmail({
          toEmail: bloodRequest.email,
          patientName: bloodRequest.patientName
        });
      }
      return;
    }

    await bloodRequest.updateOne({ kycStatus: 'verified', kycVerifiedAt: new Date() });
    await searchAndNotifyDonors(requestId);
  } catch (error: any) {
    console.error('[processKYCResult] Error processing KYC result:', error?.message || error);
  }
};
