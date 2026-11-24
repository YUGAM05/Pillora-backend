/**
 * AI phone receptionist settings of one hospital (Hospital.aiReceptionist).
 *
 * Edited in the hospital dashboard (Settings > AI receptionist, owner and
 * administrator) and in the Pillora admin panel. The voice server receives
 * them at the start of every call (POST /api/voice/doctors) and uses them for
 * the greeting, the greeting language and the facts the AI may tell callers.
 */

/** Longest "information for the AI" text. The AI re-reads it before every reply, so long text slows every answer. */
export const AI_INFO_MAX = 1000;
/** Longest spoken hospital name. */
export const AI_NAME_MAX = 60;

export const AI_LANGUAGES = ['gu', 'hi'] as const;
export type AiLanguage = (typeof AI_LANGUAGES)[number];

export interface AiReceptionistSettings {
    spokenNameGu: string;
    spokenNameHi: string;
    firstLanguage: AiLanguage;
    info: string;
    updatedAt: Date | null;
}

export type AiReceptionistInput = Omit<AiReceptionistSettings, 'updatedAt'>;

const GUJARATI = /[઀-૿]/;
const DEVANAGARI = /[ऀ-ॿ]/;

// Control characters (except tab and newline) and invisible marks that can hide
// text: zero-width space, direction marks and overrides, byte-order mark.
// ZWJ/ZWNJ (U+200C/U+200D) stay: Gujarati and Hindi spelling uses them.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F​‎‏‪-‮⁦-⁩﻿]/g;

/** One line of text: no line breaks, single spaces. */
const cleanLine = (v: string) =>
    v.replace(/[\r\n\t]+/g, ' ').replace(INVISIBLE, '').replace(/ {2,}/g, ' ').trim();

/** A block of text: Unix line breaks, no trailing spaces, at most one empty line in a row. */
const cleanBlock = (v: string) =>
    v
        .replace(/\r\n?/g, '\n')
        .replace(/\t/g, ' ')
        .replace(INVISIBLE, '')
        .split('\n')
        .map((line) => line.replace(/ {2,}/g, ' ').trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

/** Current settings of a hospital (document or lean object), defaults filled in. */
export const readAiReceptionist = (hospital: any): AiReceptionistSettings => {
    const s = hospital?.aiReceptionist || {};
    return {
        spokenNameGu: typeof s.spokenNameGu === 'string' ? s.spokenNameGu : '',
        spokenNameHi: typeof s.spokenNameHi === 'string' ? s.spokenNameHi : '',
        firstLanguage: s.firstLanguage === 'hi' ? 'hi' : 'gu',
        info: typeof s.info === 'string' ? s.info : '',
        updatedAt: s.updatedAt ? new Date(s.updatedAt) : null,
    };
};

/**
 * Validates new settings. A field left out keeps its current value.
 * Returns the cleaned settings, or a message the dashboard can show as is.
 */
export const parseAiReceptionistInput = (
    body: any,
    current: AiReceptionistSettings
): { ok: boolean; value?: AiReceptionistInput; message?: string } => {
    const text = (key: 'spokenNameGu' | 'spokenNameHi' | 'info'): string | null => {
        const v = body?.[key];
        if (v === undefined) return current[key];
        if (v === null) return '';
        return typeof v === 'string' ? v : null;
    };
    const gu = text('spokenNameGu');
    const hi = text('spokenNameHi');
    const info = text('info');
    if (gu === null || hi === null || info === null) return { ok: false, message: 'Invalid settings' };

    const spokenNameGu = cleanLine(gu);
    const spokenNameHi = cleanLine(hi);
    if (spokenNameGu.length > AI_NAME_MAX || spokenNameHi.length > AI_NAME_MAX) {
        return { ok: false, message: `Keep the hospital name under ${AI_NAME_MAX} characters` };
    }
    // The voice is chosen from the script of each sentence: a Hindi name inside a
    // Gujarati greeting would be read by the Hindi voice, and the other way round.
    if (DEVANAGARI.test(spokenNameGu)) {
        return { ok: false, message: 'Write the Gujarati name in Gujarati script (ગુજરાતી) or English letters, not Hindi script' };
    }
    if (GUJARATI.test(spokenNameHi)) {
        return { ok: false, message: 'Write the Hindi name in Hindi script (हिन्दी) or English letters, not Gujarati script' };
    }

    const cleanInfo = cleanBlock(info);
    if (cleanInfo.length > AI_INFO_MAX) {
        return { ok: false, message: `The information is ${cleanInfo.length} characters long; the limit is ${AI_INFO_MAX}. Please shorten it.` };
    }

    const firstLanguage = body?.firstLanguage === undefined ? current.firstLanguage : body.firstLanguage;
    if (!AI_LANGUAGES.includes(firstLanguage)) {
        return { ok: false, message: 'The first language must be Gujarati or Hindi' };
    }

    return { ok: true, value: { spokenNameGu, spokenNameHi, firstLanguage, info: cleanInfo } };
};

/** What the voice server needs at the start of a call. */
export const aiReceptionistForVoice = (hospital: any): AiReceptionistInput => {
    const { spokenNameGu, spokenNameHi, firstLanguage, info } = readAiReceptionist(hospital);
    return { spokenNameGu, spokenNameHi, firstLanguage, info };
};
