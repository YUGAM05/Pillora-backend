import Razorpay from 'razorpay';

/**
 * Single Razorpay client built only from environment variables.
 * Created lazily so a missing key fails the payment call with a clear error
 * instead of silently using a placeholder key.
 */
let client: Razorpay | null = null;

export const getRazorpay = (): Razorpay => {
    if (client) return client;
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
    }
    client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return client;
};

/** Razorpay errors carry the reason in error.description; fall back to message. */
export const razorpayErrorMessage = (err: any): string =>
    err?.error?.description || err?.description || err?.message || 'Unknown Razorpay error';
