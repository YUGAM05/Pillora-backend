import { Request, Response } from 'express';
import BloodDonor from '../models/BloodDonor';
import Donor from '../models/Donor';
import ExcelJS from 'exceljs';
import { AuthRequest } from '../middleware/authMiddleware';

// @desc    Import donors from Excel file
// @route   POST /api/blood-bank/admin/import/donors
// @access  Private/Admin
export const importDonorsFromExcel = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }

        console.log(`[Import] Received file: ${req.file.originalname}, Size: ${req.file.size} bytes, Mime: ${req.file.mimetype}`);

        // AUTO-CLEANUP: Explicitly drop the outdated 'user_1' unique index if it exists
        try {
            await BloodDonor.collection.dropIndex('user_1');
        } catch (idxError: any) {
            // Silently ignore if index doesn't exist
        }

        const workbook = new ExcelJS.Workbook();

        try {
            // exceljs only supports .xlsx (which is a zip-based format)
            // It will throw "Can't find end of central directory" if it's an old .xls or other format
            await (workbook.xlsx as any).load(req.file.buffer as any);
        } catch (loadError: any) {
            console.error('[Import] ExcelJS Load Error:', loadError.message);
            if (loadError.message.includes('central directory') || req.file.originalname.toLowerCase().endsWith('.xls')) {
                res.status(400).json({
                    message: 'Unsupported File Format',
                    error: 'The uploaded file is not a valid .xlsx file. If you are using an old Excel format (.xls) or a CSV, please "Save As" .xlsx (Excel Workbook) before uploading.'
                });
                return;
            }
            throw loadError;
        }

        const worksheet = workbook.worksheets[0];
        const donors: any[] = [];
        const errors: string[] = [];
        let headerMap: { [key: string]: number } = {};
        let headerRowNumber = 1;

        // Process headers - Scan first 10 rows to find a valid header row
        // (Sometimes sheets have titles or empty rows at the top)
        let headerScanSuccessful = false;
        const requiredFields = ['name', 'bloodGroup', 'phone'];

        for (let r = 1; r <= 10; r++) {
            const row = worksheet.getRow(r);
            const currentMap: { [key: string]: number } = {};

            row.eachCell((cell, colNumber) => {
                const header = cell.value?.toString().toLowerCase().trim() || '';
                if (!header) return;

                // Name mapping
                if (header.includes('name') || header === 'donor' || header.includes('patient') || header.includes('full name'))
                    currentMap['name'] = colNumber;

                // Email mapping
                else if (header.includes('email') || header.includes('mail'))
                    currentMap['email'] = colNumber;

                // Blood Group mapping
                else if (header.includes('blood') || header.includes('group') || header === 'bg' || header === 'b.g' || header.includes('bility'))
                    currentMap['bloodGroup'] = colNumber;

                // Age mapping
                else if (header.includes('age') || header.includes('year'))
                    currentMap['age'] = colNumber;

                // Gender mapping
                else if (header.includes('gender') || header.includes('sex'))
                    currentMap['gender'] = colNumber;

                // Phone mapping
                else if (header.includes('phone') || header.includes('mobile') || header.includes('contact') || header.includes('number'))
                    currentMap['phone'] = colNumber;

                // City mapping
                else if (header.includes('city') || header.includes('town'))
                    currentMap['city'] = colNumber;

                // Area mapping
                else if (header.includes('area') || header.includes('locality') || header.includes('location'))
                    currentMap['area'] = colNumber;

                // Address mapping
                else if (header.includes('address'))
                    currentMap['address'] = colNumber;
            });

            const missingFields = requiredFields.filter(f => !currentMap[f]);
            if (missingFields.length === 0) {
                console.log(`[Import] Found valid header row at row ${r}`);
                headerMap = currentMap;
                headerRowNumber = r;
                headerScanSuccessful = true;
                break;
            }
        }

        if (!headerScanSuccessful) {
            res.status(400).json({
                message: `Could not find valid headers in the first 10 rows`,
                error: `Detected ${Object.keys(headerMap).length} headers. We need: Name, Blood Group, and Phone. Please ensure your sheet has these labels in the first row.`
            });
            return;
        }

        // Process data rows
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber <= headerRowNumber) return; // Skip headers and any rows above them

            try {
                // Expected Blood Group formatting (ensure it matches enum)
                let bloodGroup = row.getCell(headerMap['bloodGroup']).value?.toString().trim().toUpperCase() || '';
                // Fix common variations (e.g., "O Positive" -> "O+", "A Neg" -> "A-")
                bloodGroup = bloodGroup.replace(/POSITIVE|POS|\+VE/g, '+')
                    .replace(/NEGATIVE|NEG|\-VE/g, '-')
                    .replace(/\s/g, '');

                const donor = {
                    name: row.getCell(headerMap['name']).value?.toString().trim() || '',
                    email: headerMap['email'] ? (row.getCell(headerMap['email']).value?.toString().trim() || '') : '',
                    bloodGroup: bloodGroup,
                    age: parseInt(row.getCell(headerMap['age']).value?.toString() || '0'),
                    gender: headerMap['gender'] ? (row.getCell(headerMap['gender']).value?.toString().trim() || 'Other') : 'Other',
                    phone: row.getCell(headerMap['phone']).value?.toString().trim() || '',
                    city: headerMap['city'] ? (row.getCell(headerMap['city']).value?.toString().trim() || 'Unknown') : 'Unknown',
                    area: headerMap['area'] ? (row.getCell(headerMap['area']).value?.toString().trim() || 'Unknown') : 'Unknown',
                    address: headerMap['address'] ? (row.getCell(headerMap['address']).value?.toString().trim() || 'N/A') : 'N/A',
                    source: 'google_form',
                    isAvailable: true,
                    location: {
                        type: 'Point',
                        coordinates: [0, 0]
                    }
                };

                // Validate required fields for this specific row
                if (!donor.name || !donor.bloodGroup || !donor.phone) {
                    const msg = `Row ${rowNumber}: Missing data in required columns (Name, Blood Group, or Phone)`;
                    console.warn(msg, donor);
                    errors.push(msg);
                    return;
                }

                // Validate age (default to 25 if missing or invalid)
                if (isNaN(donor.age) || donor.age < 1 || donor.age > 120) {
                    donor.age = 25;
                }

                // Map Gender to Enum
                if (donor.gender) {
                    const g = donor.gender.toLowerCase();
                    if (g.startsWith('m')) donor.gender = 'Male';
                    else if (g.startsWith('f')) donor.gender = 'Female';
                    else donor.gender = 'Other';
                }

                // Validate blood group
                const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
                if (!validBloodGroups.includes(donor.bloodGroup)) {
                    const msg = `Row ${rowNumber}: Invalid blood group "${donor.bloodGroup}"`;
                    console.warn(msg);
                    errors.push(msg);
                    return;
                }

                donors.push(donor);
            } catch (error) {
                const msg = `Row ${rowNumber}: Error processing - ${error}`;
                console.error(msg);
                errors.push(msg);
            }
        });

        // Insert donors into database
        let successCount = 0;
        let duplicateCount = 0;
        const insertErrors: string[] = [];

        for (const donor of donors) {
            try {
                // Check for duplicates by phone number
                const existing = await BloodDonor.findOne({ phone: donor.phone });
                if (existing) {
                    duplicateCount++;
                    continue;
                }

                await BloodDonor.create(donor);
                successCount++;
            } catch (error: any) {
                insertErrors.push(`Failed to insert ${donor.name}: ${error.message}`);
            }
        }

        res.json({
            success: true,
            message: 'Import completed',
            stats: {
                totalRows: donors.length,
                successfulImports: successCount,
                duplicates: duplicateCount,
                errors: errors.length + insertErrors.length
            },
            errors: [...errors, ...insertErrors]
        });

    } catch (error: any) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Failed to import donors', error: error.message });
    }
};

// @desc    Get donor statistics by source
// @route   GET /api/blood-bank/admin/donors/stats
// @access  Private/Admin
export const getDonorStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const [totalBloodDonors, totalLegacyDonors] = await Promise.all([
            BloodDonor.countDocuments(),
            Donor.countDocuments()
        ]);
        
        const googleFormDonors = await BloodDonor.countDocuments({ source: 'google_form' });
        const userPanelDonors = await BloodDonor.countDocuments({
            $or: [{ source: 'user_panel' }, { source: { $exists: false } }]
        });
        const availableDonors = await BloodDonor.countDocuments({ isAvailable: true });
        
        const totalDonors = totalBloodDonors + totalLegacyDonors;

        // Blood group distribution
        const bloodGroupStats = await BloodDonor.aggregate([
            {
                $group: {
                    _id: '$bloodGroup',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            total: totalDonors,
            googleForm: googleFormDonors,
            userPanel: userPanelDonors,
            available: availableDonors,
            bloodGroups: bloodGroupStats
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch stats', error });
    }
};
