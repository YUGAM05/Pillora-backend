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
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSafety = exports.analyzeDrugSafety = void 0;
const drugDatabase_1 = require("../data/drugDatabase");
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
        // Find drug in database
        const drug = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === medicineName.toLowerCase() ||
            d.genericName.toLowerCase() === medicineName.toLowerCase());
        if (!drug) {
            // Drug not found in database
            res.json({
                found: false,
                medicineName,
                message: 'This medication is not in our database. Please consult a healthcare professional for detailed information.',
                safetyLevel: 'unknown',
                recommendation: 'We recommend consulting with a pharmacist or doctor before taking this medication.'
            });
            return;
        }
        // Analyze symptom compatibility
        const symptomWords = symptoms.toLowerCase().split(/[\s,]+/);
        const matchingSymptoms = drug.treatsSymptoms.filter(treatedSymptom => symptomWords.some((word) => treatedSymptom.includes(word) || word.includes(treatedSymptom)));
        const isAppropriate = matchingSymptoms.length > 0;
        const isSafe = drug.contraindications.length === 0; // Simplified - would need more context
        let safetyLevel;
        if (isAppropriate && isSafe) {
            safetyLevel = 'safe';
        }
        else if (isAppropriate && !isSafe) {
            safetyLevel = 'caution';
        }
        else if (!isAppropriate) {
            safetyLevel = 'warning';
        }
        else {
            safetyLevel = 'unsafe';
        }
        // Generate report
        const report = {
            found: true,
            medicineName: drug.name,
            genericName: drug.genericName,
            category: drug.category,
            safetyLevel,
            isAppropriate,
            appropriateFor: isAppropriate
                ? `Matched Symptoms: ${matchingSymptoms.join(', ')}. This medication is effectively used for your condition.`
                : `No direct match found for your symptoms. This medication is typically used for: ${drug.treatsSymptoms.slice(0, 5).join(', ')}. Consult a doctor if your symptoms persist.`,
            mechanismOfAction: `As a ${drug.category.toLowerCase()}, this medication works by ${drug.category.includes('NSAID') ? 'blocking enzymes that cause inflammation and pain' : drug.category.includes('Antibiotic') ? 'inhibiting bacterial cell wall synthesis or reproduction' : 'targeting specific physiological pathways'}.`,
            dosageRecommendations: {
                adult: drug.dosage.adult,
                child: drug.dosage.child,
                frequency: drug.dosage.frequency,
                maxDaily: drug.dosage.maxDaily
            },
            usageInstructions: [
                `Take ${drug.dosage.adult} ${drug.dosage.frequency.toLowerCase()}`,
                `Maximum daily dose: ${drug.dosage.maxDaily}`,
                'Follow the instructions on the packaging',
                'Complete the full course if prescribed',
                'Do not take on an empty stomach unless specified'
            ],
            criticalPrecautions: [
                ...drug.warnings.slice(0, 2),
                `Contraindicated in: ${drug.contraindications.join(', ')}`
            ],
            sideEffects: drug.sideEffects,
            interactions: drug.interactions.length > 0
                ? `Potential interactions with: ${drug.interactions.join(', ')}`
                : 'No major interactions identified in our current database.',
            lifestyleAdvice: [
                'Maintain adequate hydration while on medication',
                'Avoid alcohol consumption unless cleared by a doctor',
                'Monitor for any unusual allergic reactions'
            ],
            disclaimer: 'CRITICAL: This is an AI-generated safety analysis based on clinical data. It is for informational purposes only and DOES NOT replace professional medical advice, diagnosis, or treatment.'
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
        // 1. Check Drug-Drug Interactions using the database
        if (cartItems && cartItems.length > 1) {
            const names = cartItems.map((item) => item.name.toLowerCase());
            // Check each drug against others in the cart
            for (let i = 0; i < names.length; i++) {
                const drug1 = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === names[i] || d.genericName.toLowerCase() === names[i]);
                if (drug1) {
                    for (let j = i + 1; j < names.length; j++) {
                        const drug2Name = names[j];
                        const drug2 = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === drug2Name || d.genericName.toLowerCase() === drug2Name);
                        // Check if drug1 interacts with drug2
                        if (drug1.interactions.some(interaction => drug2Name.includes(interaction.toLowerCase()) ||
                            interaction.toLowerCase().includes(drug2Name) ||
                            (drug2 && (drug2.name.toLowerCase().includes(interaction.toLowerCase()) ||
                                drug2.genericName.toLowerCase().includes(interaction.toLowerCase()))))) {
                            warnings.push(`⚠️ INTERACTION: ${drug1.name} and ${(drug2 === null || drug2 === void 0 ? void 0 : drug2.name) || drug2Name} may interact. Consult your healthcare provider.`);
                        }
                        // Check reverse (if drug2 lists drug1 as interaction)
                        if (drug2 && drug2.interactions.some(interaction => names[i].includes(interaction.toLowerCase()) ||
                            interaction.toLowerCase().includes(names[i]) ||
                            drug1.name.toLowerCase().includes(interaction.toLowerCase()) ||
                            drug1.genericName.toLowerCase().includes(interaction.toLowerCase()))) {
                            // Avoid duplicate warnings
                            const warningExists = warnings.some(w => w.includes(drug1.name) && w.includes(drug2.name));
                            if (!warningExists) {
                                warnings.push(`⚠️ INTERACTION: ${drug1.name} and ${drug2.name} may interact. Consult your healthcare provider.`);
                            }
                        }
                    }
                }
            }
            // Specific known critical interactions
            if (names.includes('aspirin') && names.includes('warfarin')) {
                warnings.push('🚨 CRITICAL: Aspirin and Warfarin significantly increase bleeding risk. Seek immediate medical advice.');
            }
            if (names.includes('ibuprofen') && names.includes('aspirin')) {
                warnings.push('⚠️ WARNING: Taking Ibuprofen with Aspirin may reduce the heart-protective effects of Aspirin.');
            }
            if ((names.includes('alprazolam') || names.includes('zolpidem')) && names.includes('alcohol')) {
                warnings.push('🚨 CRITICAL: Benzodiazepines/sedatives with alcohol can cause severe respiratory depression.');
            }
        }
        // 2. Check Condition-Drug Interactions
        if (medicalConditions && medicalConditions.length > 0) {
            const conditions = medicalConditions.map((c) => c.toLowerCase());
            const names = cartItems.map((item) => item.name.toLowerCase());
            // Check each medication against medical conditions
            for (const name of names) {
                const drug = drugDatabase_1.DRUG_DATABASE.find(d => d.name.toLowerCase() === name || d.genericName.toLowerCase() === name);
                if (drug) {
                    // Check contraindications
                    for (const contraindication of drug.contraindications) {
                        if (conditions.some((condition) => condition.includes(contraindication.toLowerCase()) ||
                            contraindication.toLowerCase().includes(condition))) {
                            warnings.push(`🚨 CONTRAINDICATION: ${drug.name} is contraindicated with ${contraindication}. Do not use without consulting a doctor.`);
                        }
                    }
                }
            }
            // Specific condition-drug checks
            if (conditions.includes('high blood pressure') || conditions.includes('hypertension')) {
                if (names.some((n) => n.includes('pseudoephedrine') || n.includes('decongestant'))) {
                    warnings.push('⚠️ WARNING: Decongestants can raise blood pressure.');
                }
            }
            if (conditions.includes('diabetes')) {
                if (names.includes('prednisolone') || names.includes('prednisone')) {
                    warnings.push('⚠️ WARNING: Corticosteroids can increase blood sugar levels. Monitor glucose closely.');
                }
            }
            if (conditions.includes('kidney disease') || conditions.includes('renal disease')) {
                if (names.includes('ibuprofen') || names.includes('naproxen') || names.includes('diclofenac')) {
                    warnings.push('⚠️ WARNING: NSAIDs can worsen kidney function. Use with caution.');
                }
                if (names.includes('metformin')) {
                    warnings.push('🚨 CONTRAINDICATION: Metformin is contraindicated in severe kidney disease.');
                }
            }
            if (conditions.includes('asthma')) {
                if (names.includes('aspirin') || names.includes('atenolol')) {
                    warnings.push('⚠️ WARNING: These medications may worsen asthma symptoms.');
                }
            }
        }
        res.json({
            isSafe: warnings.length === 0,
            warnings,
            checkedMedications: cartItems.length,
            checkedConditions: (medicalConditions === null || medicalConditions === void 0 ? void 0 : medicalConditions.length) || 0
        });
    }
    catch (error) {
        console.error('Safety check error:', error);
        res.status(500).json({ message: 'Server Error', error });
    }
});
exports.checkSafety = checkSafety;
