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
exports.resolveVoiceHospital = void 0;
const VoiceHospitalConfig_1 = __importDefault(require("../models/VoiceHospitalConfig"));
const resolveVoiceHospital = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    try {
        console.log('[ResolveVoiceHospital] Request body:', JSON.stringify(req.body, null, 2));
        const exotelNumber = ((_d = (_c = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.call) === null || _c === void 0 ? void 0 : _c.phoneNumber) === null || _d === void 0 ? void 0 : _d.number) ||
            ((_g = (_f = (_e = req.body) === null || _e === void 0 ? void 0 : _e.message) === null || _f === void 0 ? void 0 : _f.phoneNumber) === null || _g === void 0 ? void 0 : _g.number) ||
            ((_k = (_j = (_h = req.body) === null || _h === void 0 ? void 0 : _h.call) === null || _j === void 0 ? void 0 : _j.phoneNumber) === null || _k === void 0 ? void 0 : _k.number) ||
            ((_l = req.body) === null || _l === void 0 ? void 0 : _l.phoneNumber) ||
            ((_p = (_o = (_m = req.body) === null || _m === void 0 ? void 0 : _m.message) === null || _o === void 0 ? void 0 : _o.call) === null || _p === void 0 ? void 0 : _p.to) ||
            ((_q = req.body) === null || _q === void 0 ? void 0 : _q.to) ||
            ((_r = req.body) === null || _r === void 0 ? void 0 : _r.calledNumber);
        if (!exotelNumber) {
            const fallbackHospitalId = process.env.DEFAULT_VOICE_HOSPITAL_ID;
            if (fallbackHospitalId) {
                console.warn('[ResolveVoiceHospital] No phone number found — using DEFAULT_VOICE_HOSPITAL_ID fallback (test mode)');
                req.hospitalId = fallbackHospitalId;
                return next();
            }
            console.warn('[ResolveVoiceHospital] No phone number extracted from request body');
            res.status(403).json({ error: "voice_booking_not_enabled_for_this_number" });
            return;
        }
        const config = yield VoiceHospitalConfig_1.default.findOne({ exotelNumber });
        if (!config || !config.isEnabled) {
            console.warn(`[ResolveVoiceHospital] Voice config not found or disabled for exotelNumber: ${exotelNumber}`);
            res.status(403).json({ error: "voice_booking_not_enabled_for_this_number" });
            return;
        }
        req.hospitalId = config.hospitalId.toString();
        next();
    }
    catch (error) {
        console.error('[ResolveVoiceHospital] Middleware error:', error.message);
        res.status(500).json({ error: "internal_server_error" });
    }
});
exports.resolveVoiceHospital = resolveVoiceHospital;
