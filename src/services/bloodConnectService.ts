import BloodRequest from '../models/BloodRequest';
import Donor from '../models/Donor';
import { sendKYCFailedEmail, sendNoDonorFoundEmail, sendDonorFoundEmail } from './emailService';

/**
 * Searches for matching blood donors and notifies the requester.
 * First queries by bloodGroup + city + area. If no match is found, fallback to city + bloodGroup.
 */
export const searchAndNotifyDonors = async (requestId: string): Promise<void> => {
  try {
    const request = await BloodRequest.findById(requestId);
    if (!request) {
      console.error(`[searchAndNotifyDonors] BloodRequest not found for ID: ${requestId}`);
      return;
    }

    const cityVal = request.city || '';
    const areaVal = request.area || '';
    const bloodGroupVal = request.bloodGroup;

    // Search donors matching blood group AND city AND area
    let donors = await Donor.find({
      bloodGroup: bloodGroupVal,
      city: { $regex: cityVal, $options: 'i' },
      area: { $regex: areaVal, $options: 'i' },
      isAvailable: true
    });

    // If no exact area match found search by city and blood group only
    if (donors.length === 0) {
      donors = await Donor.find({
        bloodGroup: bloodGroupVal,
        city: { $regex: cityVal, $options: 'i' },
        isAvailable: true
      });
    }

    const emailToUse = request.email || '';

    if (donors.length === 0) {
      // NO DONORS FOUND
      await request.updateOne({ status: 'no_donor_found' });
      if (emailToUse) {
        await sendNoDonorFoundEmail({
          toEmail: emailToUse,
          patientName: request.patientName,
          bloodGroup: bloodGroupVal,
          city: cityVal,
          area: areaVal
        });
      } else {
        console.log(`[searchAndNotifyDonors] No donor found, but no email address on file for request ${requestId}`);
      }
      return;
    }

    // DONORS FOUND — send email with donor details
    await request.updateOne({ status: 'matched' });
    if (emailToUse) {
      await sendDonorFoundEmail({
        toEmail: emailToUse,
        patientName: request.patientName,
        bloodGroup: bloodGroupVal,
        unitsNeeded: request.unitsNeeded || request.units || 1,
        donors: donors.map((d: any) => ({
          name: d.name || d.donor_name || 'Anonymous',
          bloodGroup: d.bloodGroup || d.blood_group || bloodGroupVal,
          phone: d.phone || d.donor_phone || 'N/A',
          area: d.area || '',
          city: d.city || ''
        }))
      });
    } else {
      console.log(`[searchAndNotifyDonors] Matched ${donors.length} donors, but no email address on file for request ${requestId}`);
    }
  } catch (error) {
    console.error('[searchAndNotifyDonors] Error searching or notifying donors:', error);
  }
};

/**
 * Main entry point triggered when KYC verification completes.
 * Updates KYC status and kicks off donor search notifications if successful.
 */
export const processKYCResult = async (requestId: string, kycPassed: boolean): Promise<void> => {
  try {
    const bloodRequest = await BloodRequest.findById(requestId);
    if (!bloodRequest) {
      console.error(`[processKYCResult] BloodRequest not found for ID: ${requestId}`);
      return;
    }

    if (!kycPassed) {
      // KYC FAILED — send failure email and stop
      await bloodRequest.updateOne({ kycStatus: 'failed' });
      const emailToUse = bloodRequest.email;
      if (emailToUse) {
        await sendKYCFailedEmail({
          toEmail: emailToUse,
          patientName: bloodRequest.patientName
        });
      } else {
        console.log(`[processKYCResult] KYC failed, but no email address on file for request ${requestId}`);
      }
      return;
    }

    // KYC PASSED — update status and search for donors
    await bloodRequest.updateOne({ kycStatus: 'verified', kycVerifiedAt: new Date() });
    await searchAndNotifyDonors(requestId);
  } catch (error) {
    console.error('[processKYCResult] Error processing KYC result:', error);
  }
};
