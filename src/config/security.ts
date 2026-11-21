/**
 * Central access to auth secrets and the CORS allowlist.
 *
 * Secrets come only from the environment (.env locally, Vercel dashboard in
 * production). There are deliberately NO hard-coded fallbacks: a fallback in
 * source code is public to anyone who can read the repo and lets them forge
 * tokens or reach the database.
 */

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`[Config] Missing required environment variable: ${name}`);
    }
    return value;
};

export const getJwtSecret = (): string => requireEnv('JWT_SECRET');

export const getMongoUri = (): string => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri || !uri.trim()) {
        throw new Error('[Config] Missing required environment variable: MONGO_URI');
    }
    return uri;
};

/** Exact origins of the real frontends. Anything else gets no CORS headers. */
export const ALLOWED_ORIGINS = new Set<string>([
    'https://pillora.in',
    'https://www.pillora.in',
    'https://pillorahospital.in',
    'https://www.pillorahospital.in',
    'https://pillora-admin.vercel.app',
    'https://www.pillora-admin.vercel.app',
    'https://pillora-hospital.vercel.app',
    'https://www.pillora-hospital.vercel.app',
    'https://pillora-seller.vercel.app',
    'https://www.pillora-seller.vercel.app',
]);

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export const isAllowedOrigin = (origin: string | undefined | null): origin is string =>
    !!origin && (ALLOWED_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin));

/** Sets CORS headers on the response only when the request origin is allowed. */
export const applyCorsHeaders = (
    origin: string | undefined,
    res: { setHeader: (name: string, value: string) => unknown },
): void => {
    if (!isAllowedOrigin(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
};
