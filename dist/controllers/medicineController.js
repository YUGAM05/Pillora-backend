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
exports.searchMedicinesByNames = exports.getApprovedMedicines = exports.adminApproveMedicine = exports.adminGetAllMedicines = exports.sellerDeleteMedicine = exports.sellerUpdateMedicine = exports.sellerGetMyMedicines = exports.sellerAddMedicine = void 0;
const Medicine_1 = __importDefault(require("../models/Medicine"));
const sellerAddMedicine = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const seller_id = req.user._id;
        const { name, generic_name, brand, category, price, stock, dosage, expiry_date, requires_prescription } = req.body;
        let image_url = '';
        if (req.file) {
            image_url = req.file.path;
        }
        const medicine = yield Medicine_1.default.create({
            seller_id,
            name,
            generic_name,
            brand,
            category,
            price,
            stock,
            dosage,
            expiry_date,
            requires_prescription,
            image_url,
            admin_approved: 'pending'
        });
        res.status(201).json(medicine);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.sellerAddMedicine = sellerAddMedicine;
const sellerGetMyMedicines = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const medicines = yield Medicine_1.default.find({ seller_id: req.user._id });
        res.status(200).json(medicines);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.sellerGetMyMedicines = sellerGetMyMedicines;
const sellerUpdateMedicine = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const medicine = yield Medicine_1.default.findOneAndUpdate({ _id: req.params.id, seller_id: req.user._id }, req.body, { new: true });
        if (!medicine) {
            return res.status(404).json({ message: 'Medicine not found or unauthorized' });
        }
        res.status(200).json(medicine);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.sellerUpdateMedicine = sellerUpdateMedicine;
const sellerDeleteMedicine = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const medicine = yield Medicine_1.default.findOneAndDelete({ _id: req.params.id, seller_id: req.user._id });
        if (!medicine) {
            return res.status(404).json({ message: 'Medicine not found' });
        }
        res.status(200).json({ message: 'Medicine deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.sellerDeleteMedicine = sellerDeleteMedicine;
const adminGetAllMedicines = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const medicines = yield Medicine_1.default.find()
            .populate('seller_id', 'name pharmacy_name'); // Assumes pharmacy_name exists on User
        res.status(200).json(medicines);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.adminGetAllMedicines = adminGetAllMedicines;
const adminApproveMedicine = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { admin_approved, rejection_reason } = req.body;
        const medicine = yield Medicine_1.default.findByIdAndUpdate(req.params.id, { admin_approved, rejection_reason }, { new: true });
        if (!medicine) {
            return res.status(404).json({ message: 'Medicine not found' });
        }
        res.status(200).json(medicine);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.adminApproveMedicine = adminApproveMedicine;
const getApprovedMedicines = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let query = { admin_approved: 'approved', stock: { $gt: 0 } };
        if (req.query.name) {
            query.name = { $regex: req.query.name, $options: 'i' };
        }
        const medicines = yield Medicine_1.default.find(query);
        res.status(200).json(medicines);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getApprovedMedicines = getApprovedMedicines;
const searchMedicinesByNames = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { names } = req.body;
        if (!Array.isArray(names)) {
            return res.status(400).json({ message: 'Names must be an array' });
        }
        const regexes = names.map(name => new RegExp(name, 'i'));
        const medicines = yield Medicine_1.default.find({
            admin_approved: 'approved',
            name: { $in: regexes }
        });
        // Group by name for easier UI handling
        const grouped = names.reduce((acc, name) => {
            acc[name] = medicines.filter(m => new RegExp(name, 'i').test(m.name));
            return acc;
        }, {});
        res.status(200).json(grouped);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.searchMedicinesByNames = searchMedicinesByNames;
