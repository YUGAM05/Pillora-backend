import mongoose from 'mongoose';
import Doctor from '../models/Doctor';
import Slot from '../models/Slot';
import HospitalSettings from '../models/HospitalSettings';
import { activeHoldsExpr, statusStage } from './slotBooking';

/**
 * How many patients can book one slot ("max patients per slot").
 *
 *   1. the doctor's own `maxAppointmentsPerSlot`, when it is greater than 1 (explicit per-doctor / group value);
 *   2. otherwise the hospital's Settings value `appointmentSettings.maxAppointmentsPerSlot`;
 *   3. otherwise 1.
 * Always clamped to 1..100.
 *
 * New slots store this in `Slot.max_appointments`; booking (utils/slotBooking.ts) enforces it atomically.
 */
export const MIN_SLOT_CAPACITY = 1;
export const MAX_SLOT_CAPACITY = 100;

export const clampSlotCapacity = (value: any): number => {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < MIN_SLOT_CAPACITY) return MIN_SLOT_CAPACITY;
    return Math.min(MAX_SLOT_CAPACITY, n);
};

/** True when the doctor has its own per-slot limit (anything above the default 1). */
export const doctorHasOwnCapacity = (doctor: any): boolean => Number(doctor?.maxAppointmentsPerSlot) > 1;

/** Pure rule: doctor's own value (> 1), else the hospital setting, else 1. */
export const effectiveSlotCapacity = (doctor: any, hospitalSetting?: any): number => {
    if (doctorHasOwnCapacity(doctor)) return clampSlotCapacity(doctor.maxAppointmentsPerSlot);
    if (Number(hospitalSetting) >= 1) return clampSlotCapacity(hospitalSetting);
    return 1;
};

/** The hospital's "Max patients per slot" setting (undefined when no settings record exists). */
export const hospitalSlotCapacitySetting = async (hospitalId: any): Promise<number | undefined> => {
    if (!hospitalId) return undefined;
    const settings: any = await HospitalSettings.findOne({ hospitalId })
        .select('appointmentSettings.maxAppointmentsPerSlot')
        .lean();
    const v = settings?.appointmentSettings?.maxAppointmentsPerSlot;
    return Number(v) >= 1 ? Number(v) : undefined;
};

/**
 * Effective capacity for a doctor (document, lean object or id). Loads the hospital setting only when
 * the doctor has no own value. Unknown doctor -> 1.
 */
export const effectiveCapacityForDoctor = async (doctorOrId: any): Promise<number> => {
    let doctor: any = doctorOrId;
    if (!doctor || typeof doctor !== 'object' || doctor instanceof mongoose.Types.ObjectId) {
        if (!doctorOrId || !mongoose.Types.ObjectId.isValid(String(doctorOrId))) return 1;
        doctor = await Doctor.findById(doctorOrId).select('maxAppointmentsPerSlot hospital').lean();
        if (!doctor) return 1;
    }
    if (doctorHasOwnCapacity(doctor)) return effectiveSlotCapacity(doctor);
    return effectiveSlotCapacity(doctor, await hospitalSlotCapacitySetting(doctor.hospital));
};

/**
 * After the hospital changes "Max patients per slot": apply it to that hospital's upcoming slots
 * (startTime > now, not cancelled/blocked) of doctors that have no own limit.
 * New capacity = max(new value, booked seats + active holds), so nobody already booked or checking out
 * loses a place. Status is recomputed with the same stage the booking code uses (full -> booked,
 * full with holds -> locked, else available). Returns the number of slots changed.
 */
export const applyHospitalCapacityToFutureSlots = async (hospitalId: any, newValue: any): Promise<number> => {
    const cap = clampSlotCapacity(newValue);
    const doctors: any[] = await Doctor.find({ hospital: hospitalId }).select('maxAppointmentsPerSlot').lean();
    const doctorIds = doctors.filter((d) => !doctorHasOwnCapacity(d)).map((d) => d._id);
    if (doctorIds.length === 0) return 0;

    const now = new Date();
    const booked = { $ifNull: ['$booked_count', 0] };
    const target = { $max: [cap, { $add: [booked, { $size: activeHoldsExpr(now) }] }] };

    const result = await Slot.updateMany(
        {
            hospital: hospitalId,
            doctor: { $in: doctorIds },
            startTime: { $gt: now },
            status: { $nin: ['cancelled', 'blocked'] },
            $expr: { $ne: [{ $ifNull: ['$max_appointments', 1] }, target] }
        },
        [
            {
                $set: {
                    max_appointments: target,
                    booked_count: booked,
                    holds: activeHoldsExpr(now)
                }
            },
            statusStage
        ],
        { updatePipeline: true }
    );
    return result.modifiedCount || 0;
};
