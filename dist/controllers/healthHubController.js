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
exports.getHealthTipById = exports.deleteHealthTip = exports.getAllHealthTips = exports.createHealthTip = void 0;
const HealthTip_1 = __importDefault(require("../models/HealthTip"));
const createHealthTip = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, description, imageUrl, date } = req.body;
        const newTip = new HealthTip_1.default({
            title,
            description,
            imageUrl,
            date: date || new Date()
        });
        const savedTip = yield newTip.save();
        res.status(201).json(savedTip);
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating health tip', error });
    }
});
exports.createHealthTip = createHealthTip;
const getAllHealthTips = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tips = yield HealthTip_1.default.find().sort({ date: -1 });
        res.status(200).json(tips);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching health tips', error });
    }
});
exports.getAllHealthTips = getAllHealthTips;
const deleteHealthTip = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const deletedTip = yield HealthTip_1.default.findByIdAndDelete(id);
        if (!deletedTip) {
            return res.status(404).json({ message: 'Health tip not found' });
        }
        res.status(200).json({ message: 'Health tip deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting health tip', error });
    }
});
exports.deleteHealthTip = deleteHealthTip;
const getHealthTipById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const tip = yield HealthTip_1.default.findById(id);
        if (!tip) {
            return res.status(404).json({ message: 'Health tip not found' });
        }
        res.status(200).json(tip);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching health tip details', error });
    }
});
exports.getHealthTipById = getHealthTipById;
