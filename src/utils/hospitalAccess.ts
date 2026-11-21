import Hospital from '../models/Hospital';

/**
 * Hospital staff accounts: who may use which part of the hospital dashboard.
 *
 * A hospital user is either the OWNER (Hospital.user === user._id) or a STAFF
 * member (user.hospitalId === Hospital._id) with one of the staff roles below.
 * Permissions are enforced on the server by requireHospitalPermission();
 * the dashboard only uses the same list to hide what the user can't open.
 */
export type HospitalStaffRole = 'owner' | 'administrator' | 'receptionist' | 'doctor' | 'accounts';
export const STAFF_ROLES: HospitalStaffRole[] = ['administrator', 'receptionist', 'doctor', 'accounts'];

export const HOSPITAL_PERMISSIONS = {
    appointments: ['owner', 'administrator', 'receptionist', 'doctor'],
    patients: ['owner', 'administrator', 'receptionist', 'doctor'],
    followups: ['owner', 'administrator', 'receptionist'],
    doctorsSlots: ['owner', 'administrator'],
    payments: ['owner', 'administrator', 'accounts'],
    settlements: ['owner', 'administrator', 'accounts'],
    planView: ['owner', 'administrator'],
    planPurchase: ['owner'],
    hospitalSettings: ['owner', 'administrator'],
    bankDetails: ['owner'],
    staffManage: ['owner'],
    self: ['owner', 'administrator', 'receptionist', 'doctor', 'accounts'],
} as const;

export type HospitalPermission = keyof typeof HOSPITAL_PERMISSIONS;

/** Readable names used in the 403 message. */
export const PERMISSION_LABELS: Record<HospitalPermission, string> = {
    appointments: 'appointments',
    patients: 'patient records',
    followups: 'follow-up reminders',
    doctorsSlots: 'doctors & slot management',
    payments: 'payments & collections',
    settlements: 'settlements & financial reports',
    planView: 'plan & usage',
    planPurchase: 'buying add-on packs',
    hospitalSettings: 'hospital settings',
    bankDetails: 'bank details',
    staffManage: 'staff management',
    self: 'your account',
};

export const hasHospitalPermission = (role: string | undefined, perm: HospitalPermission): boolean =>
    !!role && (HOSPITAL_PERMISSIONS[perm] as readonly string[]).includes(role);

export const permissionsForRole = (role: string | undefined): HospitalPermission[] =>
    (Object.keys(HOSPITAL_PERMISSIONS) as HospitalPermission[]).filter(p => hasHospitalPermission(role, p));

/**
 * Staff role of a non-owner hospital user. A legacy staff record marked
 * 'owner' is treated as administrator: only Hospital.user is the owner.
 */
export const staffRoleOf = (user: any): HospitalStaffRole => {
    const r = user?.hospitalStaffRole;
    return STAFF_ROLES.includes(r) ? r : 'administrator';
};

export interface HospitalAccess {
    ok: boolean;
    hospital?: any;
    staffRole?: HospitalStaffRole;
    isOwner?: boolean;
    status?: number;   // set when ok is false
    message?: string;  // set when ok is false
}

export const DEACTIVATED_MESSAGE = 'Your staff account is deactivated';

/**
 * Find the hospital a logged-in hospital user belongs to.
 * Owner: Hospital.user === user._id. Staff: Hospital._id === user.hospitalId.
 * Deactivated staff are refused.
 */
export const resolveHospitalAccess = async (user: any): Promise<HospitalAccess> => {
    if (!user?._id) return { ok: false, status: 401, message: 'Not authorized' };

    const owned = await Hospital.findOne({ user: user._id });
    if (owned) return { ok: true, hospital: owned, staffRole: 'owner', isOwner: true };

    if (user.hospitalId) {
        if (user.isActiveStaff === false) return { ok: false, status: 403, message: DEACTIVATED_MESSAGE };
        const hospital = await Hospital.findById(user.hospitalId);
        if (hospital) return { ok: true, hospital, staffRole: staffRoleOf(user), isOwner: false };
    }
    return { ok: false, status: 404, message: 'Hospital profile not found' };
};

/** True for a hospital staff login that has been deactivated (owners are never blocked). */
export const isDeactivatedHospitalStaff = async (user: any): Promise<boolean> => {
    if (!user || user.role !== 'hospital' || user.isActiveStaff !== false) return false;
    return !(await Hospital.exists({ user: user._id }));
};
