import BloodRequest from '../models/BloodRequest';
import BloodDonor from '../models/BloodDonor';
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

    console.log('=== DONOR SEARCH START ===');
    console.log('Request ID:', requestId);
    console.log('Request blood group:', request.bloodGroup);
    console.log('Request city:', request.city);
    console.log('Request area:', request.area);

    // First check how many total donors exist
    const totalDonors = await BloodDonor.countDocuments();
    console.log('Total donors in DB:', totalDonors);

    // Check all donors regardless of filters
    const allDonors = await BloodDonor.find({});
    console.log('All donors:', JSON.stringify(allDonors.map(d => ({
      name: d.name,
      bloodGroup: d.bloodGroup,
      city: d.city,
      area: d.area,
      isAvailable: d.isAvailable
    })), null, 2));

    // Fix 4 — Check the exact field names in the Donor schema
    const firstDonor = await BloodDonor.findOne({});
    if (firstDonor) {
      console.log('Donor document keys:', Object.keys(firstDonor.toObject()));
      console.log('Full donor document:', firstDonor.toObject());
    } else {
      console.log('No donor document in DB to extract keys from.');
    }

    // Fix 5 — Check the exact field names in the BloodRequest schema
    console.log('Request document keys:', Object.keys(request.toObject()));
    console.log('Full request document:', request.toObject());

    const cityVal = (request.city || '').trim();
    const areaVal = (request.area || '').trim();
    const bloodGroupVal = (request.bloodGroup || '').trim();

    // Now search with filters
    // Fix 2 & 3: Use case-insensitive regex for bloodGroup, trim fields, and check isAvailable condition
    let donors = await BloodDonor.find({
      bloodGroup: { $regex: `^${bloodGroupVal}$`, $options: 'i' },
      city: { $regex: cityVal, $options: 'i' },
      area: { $regex: areaVal, $options: 'i' },
      $or: [
        { isAvailable: true },
        { isAvailable: { $exists: false } },
        { isAvailable: null }
      ]
    });

    console.log('Matching donors found (strict city + area):', donors.length);

    // If no exact area match found search by city and blood group only
    if (donors.length === 0) {
      console.log('No exact area match. Falling back to city + blood group search...');
      donors = await BloodDonor.find({
        bloodGroup: { $regex: `^${bloodGroupVal}$`, $options: 'i' },
        city: { $regex: cityVal, $options: 'i' },
        $or: [
          { isAvailable: true },
          { isAvailable: { $exists: false } },
          { isAvailable: null }
        ]
      });
      console.log('Matching donors found (city fallback):', donors.length);
    }

    console.log('=== DONOR SEARCH END ===');

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
          name: d.name || 'Anonymous',
          bloodGroup: d.bloodGroup || bloodGroupVal,
          phone: d.phone || 'N/A',
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
