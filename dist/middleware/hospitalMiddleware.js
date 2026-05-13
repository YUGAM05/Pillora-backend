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
exports.attachHospital = exports.selfManagedOnly = exports.isHospital = void 0;
const Hospital_1 = __importDefault(require("../models/Hospital"));
const isHospital = (req, res, next) => {
    if (req.user && req.user.role === 'hospital') {
        next();
    }
    else {
        res.status(403).json({ message: 'Access denied. Hospital role required.' });
    }
};
exports.isHospital = isHospital;
const selfManagedOnly = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const hospital = yield Hospital_1.default.findOne({ user: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        if (hospital.management_type !== 'SELF') {
            res.status(403).json({
                message: 'This hospital is managed by Pillora. You cannot modify records directly. Please contact admin to switch to Self-Managed mode.'
            });
            return;
        }
        req.hospital = hospital;
        next();
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
exports.selfManagedOnly = selfManagedOnly;
const attachHospital = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const hospital = yield Hospital_1.default.findOne({ user: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital profile not found' });
            return;
        }
        req.hospital = hospital;
        next();
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
exports.attachHospital = attachHospital;
