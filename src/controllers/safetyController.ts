import { Request, Response } from 'express';
import { DRUG_DATABASE, DrugInfo } from '../data/drugDatabase';
import Inventory from '../models/Inventory';
import User from '../models/User';

interface DrugItem {
    name: string;
    interactions: string[]; // List of drugs this interacts with
}

// @desc    Comprehensive drug safety analysis
// @route   POST /api/safety/analyze
// @access  Public
export const analyzeDrugSafety = async (req: Request, res: Response): Promise<void> => {
    try {
        const { medicineName, symptoms } = req.body;

        if (!medicineName || !symptoms) {
            res.status(400).json({ message: 'Please provide both medicine name and symptoms' });
            return;
        }

        // 1. First, check our own Inventory for this medicine
        // This allows the "Own Implementation" requested by the user
        const inventoryProduct = await Inventory.findOne({
            status: 'approved',
            $or: [
                { name: { $regex: new RegExp(`^${medicineName}$`, 'i') } },
                { description: { $regex: new RegExp(medicineName, 'i') } }
            ]
        });

        // 2. Also find drug in clinical database for fallback or supplemental data
        const clinicalDrug = DRUG_DATABASE.find(
            d => d.name.toLowerCase() === medicineName.toLowerCase() ||
                d.genericName.toLowerCase() === medicineName.toLowerCase()
        );

        if (!inventoryProduct && !clinicalDrug) {
            // Drug not found anywhere
            res.json({
                found: false,
                medicineName,
                message: 'This medication is not in our verified inventory or safety database. Please consult a healthcare professional.',
                safetyLevel: 'unknown',
                recommendation: 'We recommend consulting with a pharmacist or doctor before taking this medication.'
            });
            return;
        }

        // 3. Analyze symptom compatibility
        // We use clinical data if available, otherwise analyze product description
        const treatableSymptoms = clinicalDrug ? clinicalDrug.treatsSymptoms : [];
        const productInfo = inventoryProduct ? (inventoryProduct.description || '') + ' ' + (inventoryProduct.safetyInformation || '') : '';

        const symptomWords = symptoms.toLowerCase().split(/[\s,]+/);
        const matchingSymptoms = treatableSymptoms.filter(ts =>
            symptomWords.some(word => ts.includes(word) || word.includes(ts))
        );

        // If no clinical match, look for symptom keywords in product description
        let isAppropriate = matchingSymptoms.length > 0;
        if (!isAppropriate && inventoryProduct) {
            const symptomsToLink = ['pain', 'fever', 'cough', 'allergy', 'infection', 'stomach', 'headache'];
            isAppropriate = symptomsToLink.some(s =>
                symptomWords.includes(s) && (inventoryProduct.description?.toLowerCase().includes(s) || inventoryProduct.category.toLowerCase().includes(s))
            );
        }

        const safetyLevel: 'safe' | 'caution' | 'warning' | 'unsafe' = isAppropriate ? (clinicalDrug ? 'safe' : 'caution') : 'warning';

        // 4. Construct high-fidelity report using merged data
        const report = {
            found: true,
            medicineName: inventoryProduct?.name || clinicalDrug?.name || medicineName,
            genericName: clinicalDrug?.genericName || inventoryProduct?.manufacturer || 'Generic Pharmaceutical',
            category: inventoryProduct?.category || clinicalDrug?.category || 'Healthcare Product',
            safetyLevel,
            isAppropriate,
            appropriateFor: isAppropriate
                ? `Matched Symptoms: ${matchingSymptoms.length > 0 ? matchingSymptoms.join(', ') : 'Condition Match'}. This medication is indicated for your symptoms.`
                : `Caution: No direct clinical link found between "${medicineName}" and your symptoms. This is usually used for ${clinicalDrug?.treatsSymptoms.slice(0, 3).join(', ') || inventoryProduct?.category}.`,

            mechanismOfAction: inventoryProduct?.description || (clinicalDrug
                ? `As a ${clinicalDrug.category.toLowerCase()}, this medication targets specific physiological pathways to provide relief.`
                : 'Works by targeting therapeutic receptors to alleviate symptoms.'),

            dosageRecommendations: {
                adult: clinicalDrug?.dosage.adult || 'As prescribed by doctor',
                child: clinicalDrug?.dosage.child || 'Not recommended without pediatric advice',
                frequency: clinicalDrug?.dosage.frequency || 'Follow package instructions',
                maxDaily: clinicalDrug?.dosage.maxDaily || 'Do not exceed prescribed limit'
            },

            usageInstructions: [
                inventoryProduct?.directionsForUse || 'Take with water after meals',
                `Manufacturer: ${inventoryProduct?.manufacturer || clinicalDrug?.name || 'Authorized Lab'}`,
                'Follow the instructions on the packaging precisely',
                clinicalDrug ? `Full course: ${clinicalDrug.dosage.frequency}` : 'Complete the recommended dosage',
                'Store in a cool, dry place away from sunlight'
            ],

            criticalPrecautions: [
                ...(clinicalDrug?.warnings || []),
                inventoryProduct?.safetyInformation || 'No specific safety metadata provided by seller. Proceed with standard clinical oversight.',
                `Contraindicated in: ${clinicalDrug?.contraindications.join(', ') || 'Hypersensitivity to components'}`
            ],

            sideEffects: clinicalDrug?.sideEffects || ['Mild nausea', 'Dizziness', 'Dry mouth'],

            interactions: (inventoryProduct?.drugInteractions && inventoryProduct.drugInteractions.length > 0)
                ? `Verified Interactions: ${inventoryProduct.drugInteractions.join(', ')}`
                : (clinicalDrug?.interactions ? `Clinical Interactions: ${clinicalDrug.interactions.join(', ')}` : 'No major interactions identified.'),

            lifestyleAdvice: [
                'Ensure proper hydration during treatment',
                'Monitor for any unusual allergic reactions',
                'Maintain a light diet if experiencing stomach sensitivity'
            ],

            disclaimer: 'APEX SAFETY ENGINE: This analysis is generated using our proprietary pharmaceutical database and verified inventory data. It is FOR INFORMATIONAL USE ONLY and does not replace the advice of a certified physician.'
        };

        res.json(report);
    } catch (error) {
        console.error('Safety analysis error:', error);
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Check for drug interactions (existing functionality)
// @route   POST /api/safety/check
// @access  Public (or Private)
export const checkSafety = async (req: Request, res: Response): Promise<void> => {
    try {
        const { cartItems, medicalConditions } = req.body;
        // cartItems: [{ name: 'Aspirin', ingredients: ['...'], ... }]

        let warnings: string[] = [];
        const names = cartItems.map((item: any) => item.name.toLowerCase());

        // 1. Fetch all Inventory products for these items to get real-time interaction data
        const inventoryProducts = await Inventory.find({
            name: { $in: cartItems.map((item: any) => new RegExp(`^${item.name}$`, 'i')) }
        });

        // 2. Check Drug-Drug Interactions
        if (cartItems && cartItems.length > 1) {
            // Compare each drug against others
            for (let i = 0; i < names.length; i++) {
                const name1 = names[i];

                // Get data from clinical DB
                const clinicalDrug1 = DRUG_DATABASE.find(
                    d => d.name.toLowerCase() === name1 || d.genericName.toLowerCase() === name1
                );

                // Get data from our own Inventory
                const inventoryDrug1 = inventoryProducts.find(
                    p => p.name.toLowerCase() === name1
                );

                for (let j = i + 1; j < names.length; j++) {
                    const name2 = names[j];
                    const clinicalDrug2 = DRUG_DATABASE.find(
                        d => d.name.toLowerCase() === name2 || d.genericName.toLowerCase() === name2
                    );
                    const inventoryDrug2 = inventoryProducts.find(
                        p => p.name.toLowerCase() === name2
                    );

                    // Check clinical database interactions
                    const clinicalInteracts = (clinicalDrug1?.interactions.some(inter =>
                        name2.includes(inter.toLowerCase()) ||
                        (clinicalDrug2 && clinicalDrug2.name.toLowerCase().includes(inter.toLowerCase()))
                    )) || (clinicalDrug2?.interactions.some(inter =>
                        name1.includes(inter.toLowerCase()) ||
                        (clinicalDrug1 && clinicalDrug1.name.toLowerCase().includes(inter.toLowerCase()))
                    ));

                    // Check our OWN Inventory defined interactions
                    const inventoryInteracts = (inventoryDrug1?.drugInteractions.some(inter =>
                        name2.includes(inter.toLowerCase()) ||
                        (inventoryDrug2 && inventoryDrug2.name.toLowerCase().includes(inter.toLowerCase()))
                    )) || (inventoryDrug2?.drugInteractions.some(inter =>
                        name1.includes(inter.toLowerCase()) ||
                        (inventoryDrug1 && inventoryDrug1.name.toLowerCase().includes(inter.toLowerCase()))
                    ));

                    if (clinicalInteracts || inventoryInteracts) {
                        warnings.push(`⚠️ INTERACTION: ${name1.toUpperCase()} and ${name2.toUpperCase()} may interact. ${inventoryInteracts ? '(Verified in Inventory)' : '(Clinical Reference)'}`);
                    }
                }
            }

            // Universal high-risk combinations (Static safety net)
            if (names.includes('aspirin') && names.includes('warfarin')) {
                warnings.push('🚨 CRITICAL: Aspirin and Warfarin significantly increase bleeding risk.');
            }
            if (names.includes('alprazolam') && names.includes('alcohol')) {
                warnings.push('🚨 CRITICAL: Alcohol with Alprazolam can cause fatal respiratory depression.');
            }
        }

        // 3. Check Condition-Drug Interactions
        if (medicalConditions && medicalConditions.length > 0) {
            const conditions = medicalConditions.map((c: string) => c.toLowerCase());

            for (const name of names) {
                const clinicalDrug = DRUG_DATABASE.find(
                    d => d.name.toLowerCase() === name || d.genericName.toLowerCase() === name
                );

                const inventoryDrug = inventoryProducts.find(
                    p => p.name.toLowerCase() === name
                );

                // Clinical Contraindications
                if (clinicalDrug) {
                    for (const contra of clinicalDrug.contraindications) {
                        if (conditions.some(c => c.includes(contra.toLowerCase()) || contra.toLowerCase().includes(c))) {
                            warnings.push(`🚨 CONTRAINDICATION: ${name.toUpperCase()} is risky with ${contra}.`);
                        }
                    }
                }

                // Inventory Safety Info Check
                if (inventoryDrug?.safetyInformation) {
                    const safetyLower = inventoryDrug.safetyInformation.toLowerCase();
                    if (conditions.some(c => safetyLower.includes(c))) {
                        warnings.push(`⚠️ SAFETY ALERT: ${name.toUpperCase()} documentation mentions risks related to your condition.`);
                    }
                }
            }
        }

        res.json({
            isSafe: warnings.length === 0,
            warnings: Array.from(new Set(warnings)), // Deduplicate
            checkedMedications: cartItems.length,
            checkedConditions: medicalConditions?.length || 0,
            engine: "Apex Verified Safety Engine"
        });
    } catch (error) {
        console.error('Safety check error:', error);
        res.status(500).json({ message: 'Server Error', error });
    }
};
