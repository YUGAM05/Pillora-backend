/**
 * Central access to required secrets.
 *
 * Secrets must come from the environment (.env locally, Vercel dashboard in
 * production). There are deliberately NO hard-coded fallbacks: a fallback that
 * lives in source code is public to anyone who can read the repo, which lets
 * them forge tokens or reach third-party accounts.
 */

export const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`[Config] Missing required environment variable: ${name}`);
    }
    return value;
};

export const getJwtSecret = (): string => requireEnv('JWT_SECRET');

export const getMongoUri = (): string => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('[Config] Missing required environment variable: MONGO_URI');
    return uri;
};

/** Variables the server cannot run safely without. Checked once at startup. */
const REQUIRED_AT_STARTUP = ['JWT_SECRET', 'SESSION_SECRET'];

export const assertRequiredEnv = (): void => {
    const missing = REQUIRED_AT_STARTUP.filter((n) => !process.env[n] || !process.env[n]!.trim());
    if (!process.env.MONGO_URI && !process.env.MONGODB_URI) missing.push('MONGO_URI');
    if (missing.length) {
        throw new Error(`[Config] Missing required environment variables: ${missing.join(', ')}`);
    }
    if (process.env.NODE_ENV === 'production') {
        const optional = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
        const absent = optional.filter((n) => !process.env[n]);
        if (absent.length) console.warn(`[Config] Not set (related features will fail): ${absent.join(', ')}`);
    }
};
