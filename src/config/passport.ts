import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User';

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
} else {
    try {
        passport.use(
            new GoogleStrategy(
                {
                    clientID: GOOGLE_CLIENT_ID,
                    clientSecret: GOOGLE_CLIENT_SECRET,
                    callbackURL: GOOGLE_CALLBACK_URL,
                },
                async (accessToken, refreshToken, profile, done) => {
                    try {
                        let user = await User.findOne({ email: profile.emails?.[0].value });

                        if (!user) {
                            user = await User.create({
                                name: profile.displayName,
                                email: profile.emails?.[0].value,
                                googleId: profile.id,
                                profilePicture: profile.photos?.[0].value,
                                role: 'customer',
                                status: 'approved',
                            });
                        } else if (!user.googleId) {
                            user.googleId = profile.id;
                            user.profilePicture = profile.photos?.[0].value;
                            await user.save();
                        }

                        console.log('User authenticated via Google:', user.email);
                        return done(null, user);
                    } catch (error) {
                        console.error('Error in Google OAuth callback:', error);
                        return done(error as Error, undefined);
                    }
                }
            )
        );
        console.log('Google OAuth registered');
    } catch (err) {
        console.error('[Passport] Failed to register Google OAuth strategy:', err);
    }
}

passport.serializeUser((user: any, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

export default passport;