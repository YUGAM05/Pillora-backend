/**
 * Pillora plans and add-on packs.
 *
 * Plan codes are the values already stored in Hospital.plan, so no data
 * migration is needed; `label` is what hospitals see.
 *   Standard   -> "Clinic"      Rs 2,999 / month
 *   Premium    -> "Hospital"    Rs 7,999 / month
 *   Enterprise -> "Enterprise"  Rs 14,999 / month
 * All prices are before GST.
 */

export type PlanCode = 'Standard' | 'Premium' | 'Enterprise';

export interface PlanLimits {
    label: string;
    priceMonthly: number;
    /** null = unlimited */
    maxDoctors: number | null;
    /** WhatsApp messages included each calendar month */
    whatsappMonthly: number;
    /** AI phone receptionist minutes included each calendar month (0 = add-on via packs) */
    aiMinutesMonthly: number;
}

export const PLANS: Record<PlanCode, PlanLimits> = {
    Standard: { label: 'Clinic', priceMonthly: 2999, maxDoctors: 5, whatsappMonthly: 3000, aiMinutesMonthly: 0 },
    Premium: { label: 'Hospital', priceMonthly: 7999, maxDoctors: 25, whatsappMonthly: 10000, aiMinutesMonthly: 500 },
    Enterprise: { label: 'Enterprise', priceMonthly: 14999, maxDoctors: null, whatsappMonthly: 25000, aiMinutesMonthly: 1500 },
};

export const planFor = (code?: string | null): PlanLimits & { code: PlanCode } => {
    const c = (code && code in PLANS ? code : 'Standard') as PlanCode;
    return { code: c, ...PLANS[c] };
};

export type PackKind = 'whatsapp' | 'ai_minutes';

export interface PackDef {
    code: string;
    kind: PackKind;
    /** messages, or minutes */
    quantity: number;
    /** Rupees, before GST */
    price: number;
    label: string;
}

export const PACKS: PackDef[] = [
    { code: 'wa-1000', kind: 'whatsapp', quantity: 1000, price: 299, label: '1,000 WhatsApp messages' },
    { code: 'wa-5000', kind: 'whatsapp', quantity: 5000, price: 1199, label: '5,000 WhatsApp messages' },
    { code: 'wa-15000', kind: 'whatsapp', quantity: 15000, price: 2999, label: '15,000 WhatsApp messages' },
    { code: 'ai-100', kind: 'ai_minutes', quantity: 100, price: 699, label: '100 AI call minutes' },
    { code: 'ai-500', kind: 'ai_minutes', quantity: 500, price: 2999, label: '500 AI call minutes' },
    { code: 'ai-1500', kind: 'ai_minutes', quantity: 1500, price: 7499, label: '1,500 AI call minutes' },
];

export const packFor = (code: string): PackDef | undefined => PACKS.find((p) => p.code === code);

/** Add-on packs carry over month to month for this long after purchase. */
export const PACK_VALIDITY_DAYS = 183;

/** GST added on top of pack prices at checkout. */
export const GST_RATE = 0.18;

/**
 * When a hospital's messages run out: confirmations may still go out up to
 * this share of the monthly allowance extra (reminders/follow-ups pause first).
 */
export const CONFIRMATION_GRACE_SHARE = 0.1;

/** AI calls: billed in 30-second blocks; calls shorter than this are free. */
export const AI_BILLING_BLOCK_SECONDS = 30;
export const AI_FREE_CALL_SECONDS = 10;

/** Warn hospitals when this share of the monthly allowance is used. */
export const LOW_USAGE_WARNING_SHARE = 0.8;
