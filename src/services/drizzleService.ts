import { db } from '../db';
import { donors, hospitals, doctors, slots, appointments, users } from '../db/schema';
import { eq, and, ne, sql, desc, ilike } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const drizzleService = {
  // --- BLOOD DONORS ---
  async findDonorByPhone(phone: string, excludeUserId?: string) {
    if (excludeUserId) {
      const results = await db
        .select()
        .from(donors)
        .where(and(eq(donors.phone, phone), ne(donors.userId, excludeUserId)));
      return results[0] || null;
    }
    const results = await db.select().from(donors).where(eq(donors.phone, phone));
    return results[0] || null;
  },

  async upsertDonor(phone: string, data: any) {
    const existing = await this.findDonorByPhone(phone);
    const donorId = existing ? existing.id : (data.id || uuidv4());

    const payload = {
      id: donorId,
      userId: data.userId || null,
      name: data.name || 'Unnamed',
      email: data.email || null,
      bloodGroup: data.bloodGroup,
      gender: data.gender || 'Other',
      age: Number(data.age),
      phone,
      address: data.address,
      area: data.area,
      city: data.city,
      isAvailable: data.isAvailable ?? true,
      source: data.source || 'user_panel',
      location: data.location || null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(donors).set(payload).where(eq(donors.id, donorId));
    } else {
      await db.insert(donors).values({ ...payload, createdAt: new Date() });
    }

    const updated = await db.select().from(donors).where(eq(donors.id, donorId));
    return updated[0];
  },

  async getDonors(filter: { bloodGroup?: string; city?: string; limit?: number }) {
    let query = db.select().from(donors);
    const conditions = [];
    if (filter.bloodGroup) conditions.push(eq(donors.bloodGroup, filter.bloodGroup));
    if (filter.city) conditions.push(ilike(donors.city, filter.city));

    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }

    const results = await query.limit(filter.limit || 100);
    return results;
  },

  // --- HOSPITALS ---
  async getHospitals(filter?: { city?: string; search?: string }) {
    let query = db.select().from(hospitals);
    const conditions = [];
    if (filter?.city) conditions.push(ilike(hospitals.city, filter.city));
    if (filter?.search) conditions.push(ilike(hospitals.name, `%${filter.search}%`));

    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }
    return await query;
  },

  async getHospitalById(id: string) {
    const results = await db.select().from(hospitals).where(eq(hospitals.id, id));
    return results[0] || null;
  },

  // --- DOCTORS ---
  async getDoctorsByHospital(hospitalId: string) {
    return await db.select().from(doctors).where(eq(doctors.hospitalId, hospitalId));
  },

  // --- APPOINTMENTS ---
  async getAppointmentsByPatient(patientId: string) {
    return await db.select().from(appointments).where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.createdAt));
  },

  async createAppointment(data: any) {
    const id = data.id || uuidv4();
    const payload = {
      id,
      patientId: data.patientId,
      doctorId: data.doctorId,
      hospitalId: data.hospitalId,
      slotId: data.slotId || null,
      slotTime: new Date(data.slotTime),
      status: data.status || 'pending',
      paymentStatus: data.paymentStatus || 'unpaid',
      paymentSource: data.paymentSource || 'manual',
      bookingDate: new Date(),
      notes: data.notes || null,
      patientName: data.patientName || null,
      patientPhone: data.patientPhone || null,
      patientEmail: data.patientEmail || null,
      patientAge: data.patientAge || null,
      doctorName: data.doctorName || null,
      hospitalName: data.hospitalName || null,
      consultationFee: data.consultationFee ? String(data.consultationFee) : null,
      appointmentDate: data.appointmentDate || null,
      appointmentTime: data.appointmentTime || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(appointments).values(payload);
    const created = await db.select().from(appointments).where(eq(appointments.id, id));
    return created[0];
  }
};
