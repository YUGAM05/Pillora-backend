"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSafety = exports.analyzeDrugSafety = void 0;
const drugDatabase_1 = require("../data/drugDatabase");
const Inventory_1 = __importDefault(require("../models/Inventory"));
// @desc    Comprehensive drug safety analysis
// @route   POST /api/safety/analyze
// @access  Public
const analyzeDrugSafety = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { medicineName, symptoms } = req.body;
        if (!medicineName || !symptoms) {
            res.status(400).json({ message: 'Please provide both medicine name and symptoms' });
            return;
        }
        // 1. First, check our own Inventory for this medicine
        // This allows the "Own Implementation" requested by the user
        const inventoryProduct = yield Inventory_1.default.findOne({
            status: 'approved',
            $or: [
                { name: { $regex: new RegExp(`^${medicineName}$`, 'i') } },
                { description: { $regex: new RegExp(medicineName, 'i') } }
            ]
        });
        // 2. Also find drug in clinical database for fallback or supplemental data
        const clinicalDrug = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === medicineName.toLowerCase() ||
            d.genericName.toLowerCase() === medicineName.toLowerCase());
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
        const matchingSymptoms = treatableSymptoms.filter(ts => symptomWords.some(word => ts.includes(word) || word.includes(ts)));
        // If no clinical match, look for symptom keywords in product description
        let isAppropriate = matchingSymptoms.length > 0;
        if (!isAppropriate && inventoryProduct) {
            const symptomsToLink = ['pain', 'fever', 'cough', 'allergy', 'infection', 'stomach', 'headache'];
            isAppropriate = symptomsToLink.some(s => { var _a; return symptomWords.includes(s) && (((_a = inventoryProduct.description) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(s)) || inventoryProduct.category.toLowerCase().includes(s)); });
        }
        const safetyLevel = isAppropriate ? (clinicalDrug ? 'safe' : 'caution') : 'warning';
        // 4. Construct high-fidelity report using merged data
        const report = {
            found: true,
            medicineName: (inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.name) || (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.name) || medicineName,
            genericName: (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.genericName) || (inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.manufacturer) || 'Generic Pharmaceutical',
            category: (inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.category) || (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.category) || 'Healthcare Product',
            safetyLevel,
            isAppropriate,
            appropriateFor: isAppropriate
                ? `Matched Symptoms: ${matchingSymptoms.length > 0 ? matchingSymptoms.join(', ') : 'Condition Match'}. This medication is indicated for your symptoms.`
                : `Caution: No direct clinical link found between "${medicineName}" and your symptoms. This is usually used for ${(clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.treatsSymptoms.slice(0, 3).join(', ')) || (inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.category)}.`,
            mechanismOfAction: (inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.description) || (clinicalDrug
                ? `As a ${clinicalDrug.category.toLowerCase()}, this medication targets specific physiological pathways to provide relief.`
                : 'Works by targeting therapeutic receptors to alleviate symptoms.'),
            dosageRecommendations: {
                adult: (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.dosage.adult) || 'As prescribed by doctor',
                child: (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.dosage.child) || 'Not recommended without pediatric advice',
                frequency: (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.dosage.frequency) || 'Follow package instructions',
                maxDaily: (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.dosage.maxDaily) || 'Do not exceed prescribed limit'
            },
            usageInstructions: [
                (inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.directionsForUse) || 'Take with water after meals',
                `Manufacturer: ${(inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.manufacturer) || (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.name) || 'Authorized Lab'}`,
                'Follow the instructions on the packaging precisely',
                clinicalDrug ? `Full course: ${clinicalDrug.dosage.frequency}` : 'Complete the recommended dosage',
                'Store in a cool, dry place away from sunlight'
            ],
            criticalPrecautions: [
                ...((clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.warnings) || []),
                (inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.safetyInformation) || 'No specific safety metadata provided by seller. Proceed with standard clinical oversight.',
                `Contraindicated in: ${(clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.contraindications.join(', ')) || 'Hypersensitivity to components'}`
            ],
            sideEffects: (clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.sideEffects) || ['Mild nausea', 'Dizziness', 'Dry mouth'],
            interactions: ((inventoryProduct === null || inventoryProduct === void 0 ? void 0 : inventoryProduct.drugInteractions) && inventoryProduct.drugInteractions.length > 0)
                ? `Verified Interactions: ${inventoryProduct.drugInteractions.join(', ')}`
                : ((clinicalDrug === null || clinicalDrug === void 0 ? void 0 : clinicalDrug.interactions) ? `Clinical Interactions: ${clinicalDrug.interactions.join(', ')}` : 'No major interactions identified.'),
            lifestyleAdvice: [
                'Ensure proper hydration during treatment',
                'Monitor for any unusual allergic reactions',
                'Maintain a light diet if experiencing stomach sensitivity'
            ],
            disclaimer: 'PILLORA SAFETY ENGINE: This analysis is generated using our proprietary pharmaceutical database and verified inventory data. It is FOR INFORMATIONAL USE ONLY and does not replace the advice of a certified physician.'
        };
        res.json(report);
    }
    catch (error) {
        console.error('Safety analysis error:', error);
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.analyzeDrugSafety = analyzeDrugSafety;
// @desc    Check for drug interactions (existing functionality)
// @route   POST /api/safety/check
// @access  Public (or Private)
const checkSafety = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cartItems, medicalConditions } = req.body;
        // cartItems: [{ name: 'Aspirin', ingredients: ['...'], ... }]
        let warnings = [];
        const names = cartItems.map((item) => item.name.toLowerCase());
        // 1. Fetch all Inventory products for these items to get real-time interaction data
        const inventoryProducts = yield Inventory_1.default.find({
            name: { $in: cartItems.map((item) => new RegExp(`^${item.name}$`, 'i')) }
        });
        // 2. Check Drug-Drug Interactions
        if (cartItems && cartItems.length > 1) {
            // Compare each drug against others
            for (let i = 0; i < names.length; i++) {
                const name1 = names[i];
                // Get data from clinical DB
                const clinicalDrug1 = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === name1 || d.genericName.toLowerCase() === name1);
                // Get data from our own Inventory
                const inventoryDrug1 = inventoryProducts.find(p => p.name.toLowerCase() === name1);
                for (let j = i + 1; j < names.length; j++) {
                    const name2 = names[j];
                    const clinicalDrug2 = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === name2 || d.genericName.toLowerCase() === name2);
                    const inventoryDrug2 = inventoryProducts.find(p => p.name.toLowerCase() === name2);
                    // Check clinical database interactions
                    const clinicalInteracts = (clinicalDrug1 === null || clinicalDrug1 === void 0 ? void 0 : clinicalDrug1.interactions.some(inter => name2.includes(inter.toLowerCase()) ||
                        (clinicalDrug2 && clinicalDrug2.name.toLowerCase().includes(inter.toLowerCase())))) || (clinicalDrug2 === null || clinicalDrug2 === void 0 ? void 0 : clinicalDrug2.interactions.some(inter => name1.includes(inter.toLowerCase()) ||
                        (clinicalDrug1 && clinicalDrug1.name.toLowerCase().includes(inter.toLowerCase()))));
                    // Check our OWN Inventory defined interactions
                    const inventoryInteracts = (inventoryDrug1 === null || inventoryDrug1 === void 0 ? void 0 : inventoryDrug1.drugInteractions.some(inter => name2.includes(inter.toLowerCase()) ||
                        (inventoryDrug2 && inventoryDrug2.name.toLowerCase().includes(inter.toLowerCase())))) || (inventoryDrug2 === null || inventoryDrug2 === void 0 ? void 0 : inventoryDrug2.drugInteractions.some(inter => name1.includes(inter.toLowerCase()) ||
                        (inventoryDrug1 && inventoryDrug1.name.toLowerCase().includes(inter.toLowerCase()))));
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
            const conditions = medicalConditions.map((c) => c.toLowerCase());
            for (const name of names) {
                const clinicalDrug = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === name || d.genericName.toLowerCase() === name);
                const inventoryDrug = inventoryProducts.find(p => p.name.toLowerCase() === name);
                // Clinical Contraindications
                if (clinicalDrug) {
                    for (const contra of clinicalDrug.contraindications) {
                        if (conditions.some(c => c.includes(contra.toLowerCase()) || contra.toLowerCase().includes(c))) {
                            warnings.push(`🚨 CONTRAINDICATION: ${name.toUpperCase()} is risky with ${contra}.`);
                        }
                    }
                }
                // Inventory Safety Info Check
                if (inventoryDrug === null || inventoryDrug === void 0 ? void 0 : inventoryDrug.safetyInformation) {
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
            checkedConditions: (medicalConditions === null || medicalConditions === void 0 ? void 0 : medicalConditions.length) || 0,
            engine: "Pillora Verified Safety Engine"
        });
    }
    catch (error) {
        console.error('Safety check error:', error);
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.checkSafety = checkSafety;
