"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.drizzleService = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
exports.drizzleService = {
    // --- BLOOD DONORS ---
    findDonorByPhone(phone, excludeUserId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (excludeUserId) {
                const results = yield db_1.db
                    .select()
                    .from(schema_1.donors)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donors.phone, phone), (0, drizzle_orm_1.ne)(schema_1.donors.userId, excludeUserId)));
                return results[0] || null;
            }
            const results = yield db_1.db.select().from(schema_1.donors).where((0, drizzle_orm_1.eq)(schema_1.donors.phone, phone));
            return results[0] || null;
        });
    },
    upsertDonor(phone, data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const existing = yield this.findDonorByPhone(phone);
            const donorId = existing ? existing.id : (data.id || (0, uuid_1.v4)());
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
                isAvailable: (_a = data.isAvailable) !== null && _a !== void 0 ? _a : true,
                source: data.source || 'user_panel',
                location: data.location || null,
                updatedAt: new Date(),
            };
            if (existing) {
                yield db_1.db.update(schema_1.donors).set(payload).where((0, drizzle_orm_1.eq)(schema_1.donors.id, donorId));
            }
            else {
                yield db_1.db.insert(schema_1.donors).values(Object.assign(Object.assign({}, payload), { createdAt: new Date() }));
            }
            const updated = yield db_1.db.select().from(schema_1.donors).where((0, drizzle_orm_1.eq)(schema_1.donors.id, donorId));
            return updated[0];
        });
    },
    getDonors(filter) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = db_1.db.select().from(schema_1.donors);
            const conditions = [];
            if (filter.bloodGroup)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.donors.bloodGroup, filter.bloodGroup));
            if (filter.city)
                conditions.push((0, drizzle_orm_1.ilike)(schema_1.donors.city, filter.city));
            if (conditions.length > 0) {
                // @ts-ignore
                query = query.where((0, drizzle_orm_1.and)(...conditions));
            }
            const results = yield query.limit(filter.limit || 100);
            return results;
        });
    },
    // --- HOSPITALS ---
    getHospitals(filter) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = db_1.db.select().from(schema_1.hospitals);
            const conditions = [];
            if (filter === null || filter === void 0 ? void 0 : filter.city)
                conditions.push((0, drizzle_orm_1.ilike)(schema_1.hospitals.city, filter.city));
            if (filter === null || filter === void 0 ? void 0 : filter.search)
                conditions.push((0, drizzle_orm_1.ilike)(schema_1.hospitals.name, `%${filter.search}%`));
            if (conditions.length > 0) {
                // @ts-ignore
                query = query.where((0, drizzle_orm_1.and)(...conditions));
            }
            return yield query;
        });
    },
    getHospitalById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield db_1.db.select().from(schema_1.hospitals).where((0, drizzle_orm_1.eq)(schema_1.hospitals.id, id));
            return results[0] || null;
        });
    },
    // --- DOCTORS ---
    getDoctorsByHospital(hospitalId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield db_1.db.select().from(schema_1.doctors).where((0, drizzle_orm_1.eq)(schema_1.doctors.hospitalId, hospitalId));
        });
    },
    // --- APPOINTMENTS ---
    getAppointmentsByPatient(patientId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield db_1.db.select().from(schema_1.appointments).where((0, drizzle_orm_1.eq)(schema_1.appointments.patientId, patientId)).orderBy((0, drizzle_orm_1.desc)(schema_1.appointments.createdAt));
        });
    },
    createAppointment(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = data.id || (0, uuid_1.v4)();
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
            yield db_1.db.insert(schema_1.appointments).values(payload);
            const created = yield db_1.db.select().from(schema_1.appointments).where((0, drizzle_orm_1.eq)(schema_1.appointments.id, id));
            return created[0];
        });
    }
};
