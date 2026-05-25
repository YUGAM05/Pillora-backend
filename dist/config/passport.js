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
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const User_1 = __importDefault(require("../models/User"));
// ─────────────────────────────────────────────────────────────────────────────
// FIX: Wrapped GoogleStrategy initialization in a try-catch guard.
// Previously, if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL
// were missing from Vercel environment variables, passport would throw an error
// at import time — crashing the ENTIRE server before any request could be handled.
// This caused FUNCTION_INVOCATION_FAILED on every single request including login.
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    console.error('MISSING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}
else {
    try {
        passport_1.default.use(new passport_google_oauth20_1.Strategy({
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: GOOGLE_CALLBACK_URL,
        }, (accessToken, refreshToken, profile, done) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            try {
                let user = yield User_1.default.findOne({ email: (_a = profile.emails) === null || _a === void 0 ? void 0 : _a[0].value });
                if (!user) {
                    user = yield User_1.default.create({
                        name: profile.displayName,
                        email: (_b = profile.emails) === null || _b === void 0 ? void 0 : _b[0].value,
                        googleId: profile.id,
                        profilePicture: (_c = profile.photos) === null || _c === void 0 ? void 0 : _c[0].value,
                        role: 'customer',
                        status: 'approved',
                    });
                }
                else if (!user.googleId) {
                    user.googleId = profile.id;
                    user.profilePicture = (_d = profile.photos) === null || _d === void 0 ? void 0 : _d[0].value;
                    yield user.save();
                }
                console.log('User authenticated via Google:', user.email);
                return done(null, user);
            }
            catch (error) {
                console.error('Error in Google OAuth callback:', error);
                return done(error, undefined);
            }
        })));
        console.log('Google OAuth registered');
    }
    catch (err) {
        console.error('[Passport] Failed to register Google OAuth strategy:', err);
    }
}
passport_1.default.serializeUser((user, done) => {
    done(null, user._id);
});
passport_1.default.deserializeUser((id, done) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield User_1.default.findById(id);
        done(null, user);
    }
    catch (error) {
        done(error, null);
    }
}));
exports.default = passport_1.default;
