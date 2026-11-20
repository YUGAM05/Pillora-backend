/**
 * Plan allowances, usage counting and add-on packs.
 *
 * WhatsApp: every message a hospital's patients receive (confirmation,
 * reminder, follow-up) counts as 1. Order of use each month:
 *   1. the plan's monthly allowance (resets on the 1st, India time)
 *   2. add-on packs, oldest first (valid PACK_VALIDITY_DAYS, carry over months)
 *   3. confirmations only: a small grace amount (reminders/follow-ups pause first)
 * If Meta rejects a message, its unit is given back.
 *
 * AI calls: billed in 30-second blocks, calls under 10 s free; plan minutes
 * first, then minute packs. A call is never cut off mid-way: anything beyond
 * plan + packs is recorded as overage.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import Hospital from '../models/Hospital';
import Doctor from '../models/Doctor';
import UsageMonth from '../models/UsageMonth';
import UsagePack, { IUsagePack } from '../models/UsagePack';
import WhatsAppMessage from '../models/WhatsAppMessage';
import { sendWhatsAppTemplate, formatPhoneNumber } from './whatsappService';
import {
    planFor,
    packFor,
    PACKS,
    PACK_VALIDITY_DAYS,
    GST_RATE,
    CONFIRMATION_GRACE_SHARE,
    AI_BILLING_BLOCK_SECONDS,
    AI_FREE_CALL_SECONDS,
    LOW_USAGE_WARNING_SHARE,
    PackKind,
} from '../config/plans';

export type MessageKind = 'confirmation' | 'reminder' | 'followup' | 'other';
type Id = string | mongoose.Types.ObjectId;

const oid = (id: Id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id);

/** "YYYY-MM" in India time. */
export const currentMonth = (d = new Date()): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);

async function getPlan(hospitalId: Id) {
    const h = await Hospital.findById(hospitalId).select('plan').lean();
    return planFor((h as any)?.plan);
}

async function ensureMonth(hospital: mongoose.Types.ObjectId, month: string) {
    try {
        await UsageMonth.updateOne({ hospital, month }, { $setOnInsert: { hospital, month } }, { upsert: true });
    } catch (e: any) {
        if (e?.code !== 11000) throw e; // created concurrently: fine
    }
}

const activePackFilter = (hospital: mongoose.Types.ObjectId, kind: PackKind) => ({
    hospital,
    kind,
    status: 'active',
    remaining: { $gt: 0 },
    expiresAt: { $gt: new Date() },
});

// ---------------------------------------------------------------- WhatsApp

export interface WhatsAppCharge {
    chargedTo: 'plan' | 'pack' | 'grace' | 'none';
    month: string;
    packId?: mongoose.Types.ObjectId;
    kind: MessageKind;
}

/** Reserve one WhatsApp message for this hospital. null = allowance and packs used up. */
export async function consumeWhatsApp(hospitalId: Id, kind: MessageKind): Promise<WhatsAppCharge | null> {
    const hospital = oid(hospitalId);
    const plan = await getPlan(hospital);
    const month = currentMonth();
    await ensureMonth(hospital, month);
    const byKind = `whatsappByKind.${kind}`;

    // 1. Plan allowance
    const fromPlan = await UsageMonth.findOneAndUpdate(
        { hospital, month, whatsappPlanUsed: { $lt: plan.whatsappMonthly } },
        { $inc: { whatsappPlanUsed: 1, [byKind]: 1 } },
        { new: true }
    );
    if (fromPlan) return { chargedTo: 'plan', month, kind };

    // 2. Packs, oldest first
    const pack = await UsagePack.findOneAndUpdate(activePackFilter(hospital, 'whatsapp'), { $inc: { remaining: -1 } }, { sort: { purchasedAt: 1 }, new: true });
    if (pack) {
        if (pack.remaining <= 0) await UsagePack.updateOne({ _id: pack._id, remaining: { $lte: 0 } }, { status: 'used' });
        await UsageMonth.updateOne({ hospital, month }, { $inc: { whatsappPackUsed: 1, [byKind]: 1 } });
        return { chargedTo: 'pack', month, packId: pack._id as mongoose.Types.ObjectId, kind };
    }

    // 3. Grace, for confirmations only
    if (kind === 'confirmation') {
        const graceLimit = Math.floor(plan.whatsappMonthly * (1 + CONFIRMATION_GRACE_SHARE));
        const fromGrace = await UsageMonth.findOneAndUpdate(
            { hospital, month, whatsappPlanUsed: { $lt: graceLimit } },
            { $inc: { whatsappPlanUsed: 1, [byKind]: 1 } },
            { new: true }
        );
        if (fromGrace) return { chargedTo: 'grace', month, kind };
    }

    await UsageMonth.updateOne({ hospital, month }, { $inc: { whatsappSkipped: 1 } });
    return null;
}

/** Give back a reserved message (Meta rejected it). */
export async function refundWhatsApp(hospitalId: Id, charge: WhatsAppCharge) {
    const hospital = oid(hospitalId);
    const byKind = `whatsappByKind.${charge.kind}`;
    if (charge.chargedTo === 'plan' || charge.chargedTo === 'grace') {
        await UsageMonth.updateOne({ hospital, month: charge.month, whatsappPlanUsed: { $gt: 0 } }, { $inc: { whatsappPlanUsed: -1, [byKind]: -1 } });
    } else if (charge.chargedTo === 'pack' && charge.packId) {
        await UsagePack.updateOne({ _id: charge.packId }, { $inc: { remaining: 1 }, $set: { status: 'active' } });
        await UsageMonth.updateOne({ hospital, month: charge.month, whatsappPackUsed: { $gt: 0 } }, { $inc: { whatsappPackUsed: -1, [byKind]: -1 } });
    }
}

export interface HospitalWhatsAppInput {
    hospitalId?: Id | null;
    kind: MessageKind;
    phone: string;
    template: string;
    language?: string;
    components?: any[];
    appointmentId?: Id | null;
}

/**
 * Send a hospital's WhatsApp template message, counting it against the
 * hospital's allowance and logging it for delivery reports. Never throws.
 * Returns { success, skipped? , data?, error? } like sendWhatsAppTemplate.
 */
export async function sendHospitalWhatsApp(input: HospitalWhatsAppInput): Promise<{ success: boolean; skipped?: boolean; data?: any; error?: any }> {
    const { hospitalId, kind, phone, template, language = 'en', components = [], appointmentId } = input;
    const to = formatPhoneNumber(phone);
    const base = { hospital: hospitalId ? oid(hospitalId) : undefined, appointment: appointmentId ? oid(appointmentId) : undefined, kind, template, to };

    let charge: WhatsAppCharge | null = { chargedTo: 'none', month: currentMonth(), kind };
    if (hospitalId) {
        try {
            charge = await consumeWhatsApp(hospitalId, kind);
        } catch (e: any) {
            // Counting failed (e.g. database hiccup): still send the patient's message.
            console.error('[Usage] Could not count WhatsApp message, sending anyway:', e?.message || e);
            charge = { chargedTo: 'none', month: currentMonth(), kind };
        }
        if (!charge) {
            console.warn(`[Usage] WhatsApp ${kind} not sent: hospital ${hospitalId} has used its messages and packs.`);
            WhatsAppMessage.create({ ...base, status: 'skipped_quota', chargedTo: 'none' }).catch(() => {});
            return { success: false, skipped: true, error: 'whatsapp_allowance_used_up' };
        }
    }

    const result = await sendWhatsAppTemplate(phone, template, language, components);
    if (result.success) {
        const msg = (result as any).data?.messages?.[0];
        WhatsAppMessage.create({ ...base, wamid: msg?.id, status: 'accepted', chargedTo: charge.chargedTo, statusAt: new Date() }).catch((e) =>
            console.error('[Usage] Could not log WhatsApp message:', e?.message)
        );
    } else {
        if (hospitalId && charge.chargedTo !== 'none') await refundWhatsApp(hospitalId, charge).catch(() => {});
        const err = typeof result.error === 'string' ? result.error : JSON.stringify(result.error ?? '').slice(0, 500);
        WhatsAppMessage.create({ ...base, status: 'send_error', error: err, chargedTo: 'none' }).catch(() => {});
    }
    return result;
}

// ---------------------------------------------------------------- AI minutes

export const billableSeconds = (durationSeconds: number): number =>
    durationSeconds < AI_FREE_CALL_SECONDS ? 0 : Math.ceil(durationSeconds / AI_BILLING_BLOCK_SECONDS) * AI_BILLING_BLOCK_SECONDS;

/** Charge an ended call: plan minutes first, then minute packs, rest as overage. */
export async function consumeAiSeconds(hospitalId: Id, seconds: number) {
    const hospital = oid(hospitalId);
    const plan = await getPlan(hospital);
    const month = currentMonth();
    await ensureMonth(hospital, month);
    const result = { plan: 0, packs: 0, overage: 0 };

    if (seconds > 0) {
        const doc = await UsageMonth.findOne({ hospital, month }).lean();
        const planLeft = Math.max(0, plan.aiMinutesMonthly * 60 - ((doc as any)?.aiPlanSeconds ?? 0));
        result.plan = Math.min(seconds, planLeft);
        let rest = seconds - result.plan;

        // Packs, oldest first; retry if another call took the same pack meanwhile.
        for (let guard = 0; rest > 0 && guard < 20; guard++) {
            const pack = await UsagePack.findOne(activePackFilter(hospital, 'ai_minutes')).sort({ purchasedAt: 1 }).lean();
            if (!pack) break;
            const take = Math.min(rest, (pack as any).remaining);
            const updated = await UsagePack.findOneAndUpdate({ _id: (pack as any)._id, remaining: { $gte: take } }, { $inc: { remaining: -take } }, { new: true });
            if (!updated) continue;
            if (updated.remaining <= 0) await UsagePack.updateOne({ _id: updated._id, remaining: { $lte: 0 } }, { status: 'used' });
            result.packs += take;
            rest -= take;
        }
        result.overage = rest;
    }

    await UsageMonth.updateOne(
        { hospital, month },
        { $inc: { aiPlanSeconds: result.plan, aiPackSeconds: result.packs, aiOverageSeconds: result.overage, aiCalls: 1 } }
    );
    return result;
}

/** Can the AI receptionist take a call for this hospital right now? */
export async function aiStatus(hospitalId: Id) {
    const hospital = oid(hospitalId);
    const plan = await getPlan(hospital);
    const month = currentMonth();
    const [doc, packs] = await Promise.all([
        UsageMonth.findOne({ hospital, month }).lean(),
        UsagePack.aggregate([{ $match: activePackFilter(hospital, 'ai_minutes') }, { $group: { _id: null, s: { $sum: '$remaining' } } }]),
    ]);
    const planLeft = Math.max(0, plan.aiMinutesMonthly * 60 - ((doc as any)?.aiPlanSeconds ?? 0));
    const packLeft = packs[0]?.s ?? 0;
    const remainingSeconds = planLeft + packLeft;
    return { allowed: remainingSeconds >= 30, remainingMinutes: Math.floor(remainingSeconds / 60), planMinutes: plan.aiMinutesMonthly };
}

// ---------------------------------------------------------------- doctors

export async function doctorLimit(hospitalId: Id) {
    const plan = await getPlan(hospitalId);
    const used = await Doctor.countDocuments({ hospital: oid(hospitalId) });
    return { plan: plan.label, max: plan.maxDoctors, used, allowed: plan.maxDoctors === null || used < plan.maxDoctors };
}

// ---------------------------------------------------------------- summary (dashboard / admin)

export async function usageSummary(hospitalId: Id) {
    const hospital = oid(hospitalId);
    const h = await Hospital.findById(hospital).select('plan name').lean();
    const plan = planFor((h as any)?.plan);
    const month = currentMonth();
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [doc, packs, doctorsUsed, delivery] = await Promise.all([
        UsageMonth.findOne({ hospital, month }).lean(),
        UsagePack.find({ hospital, status: { $in: ['active', 'pending'] } }).sort({ purchasedAt: 1, createdAt: 1 }).lean(),
        Doctor.countDocuments({ hospital }),
        WhatsAppMessage.aggregate([{ $match: { hospital, createdAt: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const d: any = doc || {};
    const now = new Date();
    const live = (packs as any[]).filter((p) => p.status === 'active' && p.remaining > 0 && (!p.expiresAt || p.expiresAt > now));
    const waPacks = live.filter((p) => p.kind === 'whatsapp');
    const aiPacks = live.filter((p) => p.kind === 'ai_minutes');
    const waPackLeft = waPacks.reduce((s, p) => s + p.remaining, 0);
    const aiPackLeftMin = Math.floor(aiPacks.reduce((s, p) => s + p.remaining, 0) / 60);
    const waUsed = d.whatsappPlanUsed ?? 0;
    const aiUsedMin = Math.ceil((d.aiPlanSeconds ?? 0) / 60);
    const deliveryCounts = Object.fromEntries((delivery as any[]).map((x) => [x._id, x.n]));

    return {
        hospital: { id: String(hospital), name: (h as any)?.name?.trim() },
        plan: { code: plan.code, label: plan.label, priceMonthly: plan.priceMonthly, maxDoctors: plan.maxDoctors, doctorsUsed },
        month,
        whatsapp: {
            planLimit: plan.whatsappMonthly,
            planUsed: Math.min(waUsed, plan.whatsappMonthly),
            graceUsed: Math.max(0, waUsed - plan.whatsappMonthly),
            packUsedThisMonth: d.whatsappPackUsed ?? 0,
            byKind: d.whatsappByKind ?? { confirmation: 0, reminder: 0, followup: 0, other: 0 },
            skipped: d.whatsappSkipped ?? 0,
            packRemaining: waPackLeft,
            available: Math.max(0, plan.whatsappMonthly - waUsed) + waPackLeft,
            lowWarning: waUsed >= plan.whatsappMonthly * LOW_USAGE_WARNING_SHARE && waPackLeft === 0,
            delivery30d: deliveryCounts,
        },
        ai: {
            planMinutes: plan.aiMinutesMonthly,
            planUsedMinutes: Math.min(aiUsedMin, plan.aiMinutesMonthly),
            packUsedMinutesThisMonth: Math.ceil((d.aiPackSeconds ?? 0) / 60),
            overageMinutes: Math.ceil((d.aiOverageSeconds ?? 0) / 60),
            calls: d.aiCalls ?? 0,
            packRemainingMinutes: aiPackLeftMin,
            availableMinutes: Math.max(0, plan.aiMinutesMonthly - aiUsedMin) + aiPackLeftMin,
            lowWarning: plan.aiMinutesMonthly + aiPackLeftMin > 0 && aiUsedMin >= plan.aiMinutesMonthly * LOW_USAGE_WARNING_SHARE && aiPackLeftMin === 0,
        },
        packs: (packs as any[]).map((p) => ({
            id: String(p._id),
            kind: p.kind,
            label: packFor(p.packCode)?.label ?? `${p.quantity} ${p.kind === 'whatsapp' ? 'messages' : 'minutes'}`,
            quantity: p.quantity,
            remaining: p.kind === 'ai_minutes' ? Math.floor(p.remaining / 60) : p.remaining,
            status: p.status,
            source: p.source,
            purchasedAt: p.purchasedAt,
            expiresAt: p.expiresAt,
        })),
        catalog: PACKS.map((p) => ({ ...p, gst: Math.round(p.price * GST_RATE), total: p.price + Math.round(p.price * GST_RATE) })),
    };
}

// ---------------------------------------------------------------- packs

const validity = () => new Date(Date.now() + PACK_VALIDITY_DAYS * 24 * 3600 * 1000);
const baseUnits = (kind: PackKind, quantity: number) => (kind === 'ai_minutes' ? quantity * 60 : quantity);

let razorpayClient: Razorpay | null = null;
const razorpay = () =>
    (razorpayClient ??= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID || '', key_secret: process.env.RAZORPAY_KEY_SECRET || '' }));

/** Admin: give a hospital a pack (free, or paid offline). Active immediately. */
export async function grantPack(hospitalId: Id, opts: { packCode?: string; kind?: PackKind; quantity?: number; price?: number; note?: string; grantedBy?: Id }) {
    const def = opts.packCode ? packFor(opts.packCode) : undefined;
    const kind = def?.kind ?? opts.kind;
    const quantity = def?.quantity ?? opts.quantity;
    if (!kind || !quantity || quantity < 1) throw new Error('Choose a pack, or a kind and quantity');
    return UsagePack.create({
        hospital: oid(hospitalId),
        kind,
        packCode: def?.code,
        quantity,
        remaining: baseUnits(kind, quantity),
        price: opts.price ?? 0,
        status: 'active',
        source: 'admin',
        purchasedAt: new Date(),
        expiresAt: validity(),
        grantedBy: opts.grantedBy ? oid(opts.grantedBy) : undefined,
        note: opts.note,
    });
}

/** Hospital: start buying a pack. Returns what Razorpay Checkout needs. */
export async function createPackOrder(hospitalId: Id, packCode: string) {
    const def = packFor(packCode);
    if (!def) throw new Error('Unknown pack');
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new Error('Online payments are not configured');
    const gst = Math.round(def.price * GST_RATE);
    const total = def.price + gst;
    const order = await razorpay().orders.create({
        amount: total * 100,
        currency: 'INR',
        receipt: `pack_${String(hospitalId).slice(-6)}_${Date.now()}`,
        notes: { type: 'usage_pack', hospitalId: String(hospitalId), packCode: def.code },
    });
    await UsagePack.create({
        hospital: oid(hospitalId),
        kind: def.kind,
        packCode: def.code,
        quantity: def.quantity,
        remaining: baseUnits(def.kind, def.quantity),
        price: def.price,
        gstAmount: gst,
        status: 'pending',
        source: 'razorpay',
        razorpayOrderId: order.id,
    });
    return { orderId: order.id, amount: total * 100, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID, pack: { ...def, gst, total } };
}

async function activatePending(orderId: string, paymentId: string, hospitalId?: Id): Promise<IUsagePack | null> {
    const filter: any = { razorpayOrderId: orderId, status: 'pending' };
    if (hospitalId) filter.hospital = oid(hospitalId);
    const activated = await UsagePack.findOneAndUpdate(
        filter,
        { $set: { status: 'active', razorpayPaymentId: paymentId, purchasedAt: new Date(), expiresAt: validity() } },
        { new: true }
    );
    if (activated) return activated;
    return UsagePack.findOne({ razorpayOrderId: orderId, ...(hospitalId ? { hospital: oid(hospitalId) } : {}) }); // already active
}

/** Hospital: Razorpay Checkout finished. Verify its signature and activate the pack. */
export async function verifyPackPayment(hospitalId: Id, orderId: string, paymentId: string, signature: string) {
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex');
    const ok = signature && expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!ok) throw new Error('Payment could not be verified');
    const pack = await activatePending(orderId, paymentId, hospitalId);
    if (!pack) throw new Error('Pack order not found');
    return pack;
}

/**
 * If a hospital paid but closed the window before we heard back, the pack is
 * still "pending". Ask Razorpay and activate it if the payment was captured.
 */
export async function reconcilePendingPacks(hospitalId: Id) {
    const pending = await UsagePack.find({ hospital: oid(hospitalId), status: 'pending', source: 'razorpay', createdAt: { $lte: new Date(Date.now() - 60_000) } }).lean();
    for (const p of pending as any[]) {
        try {
            const payments: any = await razorpay().orders.fetchPayments(p.razorpayOrderId);
            const paid = (payments?.items ?? []).find((x: any) => x.status === 'captured');
            if (paid) await activatePending(p.razorpayOrderId, paid.id, hospitalId);
            else if (Date.now() - new Date(p.createdAt).getTime() > 3 * 24 * 3600 * 1000) await UsagePack.updateOne({ _id: p._id, status: 'pending' }, { status: 'cancelled' });
        } catch (e: any) {
            console.warn('[Usage] Could not check pending pack', p.razorpayOrderId, e?.message || e);
        }
    }
}

/** Daily: mark packs past their validity as expired. */
export async function expirePacks() {
    const r = await UsagePack.updateMany({ status: 'active', expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
    return { expired: r.modifiedCount };
}

/**
 * Drop-in replacement for sendWhatsAppTemplate(phone, template, language, components)
 * that also counts the message for the hospital: call sites only add `ctx`.
 */
export const sendCountedTemplate = (
    ctx: { hospitalId?: Id | null; kind: MessageKind; appointmentId?: Id | null },
    phone: string,
    template: string,
    language: string = 'en',
    components: any[] = []
) => sendHospitalWhatsApp({ ...ctx, phone, template, language, components });
