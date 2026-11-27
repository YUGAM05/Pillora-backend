// Free slots grouped by doctor and day, for the AI receptionist's one-request
// availability lookup (POST /api/voice/availability). Kept free of the
// database so it is easy to check on its own.

export interface FreeSlotSource {
    _id: { toString(): string };
    doctor: { toString(): string };
    startTime: Date | string;
    booked_count?: number;
    max_appointments?: number;
}

export interface DoctorFreeDays {
    doctorId: string;
    days: { date: string; slots: { slotId: string; time: string }[] }[];
}

// India time: 'YYYY-MM-DD' (en-CA writes dates that way) and 'HH:mm' (24-hour).
const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const istTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Every doctor in doctorIds gets every date in dates, in that order, with the
 * slots that still have room (booked_count below max_appointments, default 1).
 * Slots should come sorted by startTime; dates not asked for are left out.
 */
export function groupFreeSlots(doctorIds: string[], dates: string[], slots: FreeSlotSource[]): DoctorFreeDays[] {
    const byDoctorDay = new Map<string, { slotId: string; time: string }[]>();
    for (const slot of slots) {
        if ((slot.booked_count ?? 0) >= (slot.max_appointments || 1)) continue;
        const start = new Date(slot.startTime);
        const key = `${slot.doctor.toString()}|${istDate.format(start)}`;
        const list = byDoctorDay.get(key) ?? [];
        list.push({ slotId: slot._id.toString(), time: istTime.format(start) });
        byDoctorDay.set(key, list);
    }
    return doctorIds.map((doctorId) => ({
        doctorId,
        days: dates.map((date) => ({ date, slots: byDoctorDay.get(`${doctorId}|${date}`) ?? [] })),
    }));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const startOfIstDay = (date: string) => new Date(`${date}T00:00:00+05:30`);

/**
 * The dates of a request, checked: 1-14 real YYYY-MM-DD dates within 31 days
 * of each other. Returns them sorted without repeats, or null when invalid.
 */
export function checkedDates(dates: unknown): string[] | null {
    if (!Array.isArray(dates) || dates.length === 0 || dates.length > 14) return null;
    if (!dates.every((d) => typeof d === 'string' && DATE.test(d) && !Number.isNaN(startOfIstDay(d).getTime()))) return null;
    const sorted = [...new Set(dates as string[])].sort();
    const spanDays = (startOfIstDay(sorted[sorted.length - 1]).getTime() - startOfIstDay(sorted[0]).getTime()) / 86_400_000;
    return spanDays <= 31 ? sorted : null;
}
