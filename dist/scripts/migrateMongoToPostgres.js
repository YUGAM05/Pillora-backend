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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const User_1 = __importDefault(require("../models/User"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Appointment_1 = __importDefault(require("../models/Appointment"));
const BloodDonor_1 = __importDefault(require("../models/BloodDonor"));
dotenv_1.default.config();
function migrate() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Starting MongoDB to PostgreSQL Data Migration...');
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is missing in environment variables');
        }
        yield mongoose_1.default.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        // 1. Migrate Users
        const mongoUsers = yield User_1.default.find({}).lean();
        console.log(`📦 Fetched ${mongoUsers.length} Users from MongoDB`);
        const validUserIds = new Set();
        const userRows = mongoUsers.map((u) => {
            const id = u._id.toString();
            validUserIds.add(id);
            return {
                id,
                name: u.name || 'Unnamed',
                email: u.email || `${id}@placeholder.com`,
                passwordHash: u.passwordHash || null,
                googleId: u.googleId || null,
                profilePicture: u.profilePicture || null,
                role: u.role || 'customer',
                status: u.status || 'approved',
                isPasswordResetRequired: Boolean(u.isPasswordResetRequired),
                phone: u.phone || null,
                pharmacyName: u.pharmacy_name || null,
                address: u.address || null,
                otp: u.otp || null,
                otpExpiresAt: u.otpExpiresAt ? new Date(u.otpExpiresAt) : null,
                bankDetails: u.bankDetails || null,
                pharmacyCertificate: u.pharmacyCertificate || null,
                location: u.location || null,
                kycStatus: u.kyc_status || 'Pending',
                aadhaarNumber: u.aadhaarNumber || null,
                aadhaarCardUrl: u.aadhaarCardUrl || null,
                ownerPhotoUrl: u.ownerPhotoUrl || null,
                ownerPan: u.ownerPan || null,
                panCardUrl: u.panCardUrl || null,
                businessPan: u.businessPan || null,
                businessType: u.businessType || null,
                yearsInOperation: u.yearsInOperation || null,
                retailDrugLicense: u.retailDrugLicense || null,
                drugLicenseNumber: u.drugLicenseNumber || null,
                licenseExpiryDate: u.licenseExpiryDate ? new Date(u.licenseExpiryDate) : null,
                pharmacistCertificate: u.pharmacistCertificate || null,
                gstNumber: u.gstNumber || null,
                cancelledChequeUrl: u.cancelledChequeUrl || null,
                shopEstablishmentUrl: u.shopEstablishmentUrl || null,
                rentAgreementUrl: u.rentAgreementUrl || null,
                shopPhotoFrontUrl: u.shopPhotoFrontUrl || null,
                shopPhotoInsideUrl: u.shopPhotoInsideUrl || null,
                whatsappNumber: u.whatsappNumber || null,
                alternateContact: u.alternateContact || null,
                operatingHours: u.operatingHours || null,
                agreedToTerms: u.agreedToTerms || null,
                agreedToCompliance: u.agreedToCompliance || null,
                agreedToNoBannedDrugs: u.agreedToNoBannedDrugs || null,
                selfDeclarationValidLicenses: u.selfDeclarationValidLicenses || null,
                dob: u.dob ? new Date(u.dob) : null,
                gender: u.gender || null,
                aadhaarBackUrl: u.aadhaarBackUrl || null,
                vehicleType: u.vehicleType || null,
                vehicleRegNumber: u.vehicleRegNumber || null,
                dlNumber: u.dlNumber || null,
                dlExpiryDate: u.dlExpiryDate ? new Date(u.dlExpiryDate) : null,
                dlFrontUrl: u.dlFrontUrl || null,
                dlBackUrl: u.dlBackUrl || null,
                rcUrl: u.rcUrl || null,
                insuranceUrl: u.insuranceUrl || null,
                emergencyContactName: u.emergencyContactName || null,
                emergencyContactNumber: u.emergencyContactNumber || null,
                upiId: u.upiId || null,
                preferredZones: u.preferredZones || null,
                availableHours: u.availableHours || null,
                daysAvailable: u.daysAvailable || null,
                employmentType: u.employmentType || null,
                noCriminalRecord: u.noCriminalRecord || null,
                policeVerificationUrl: u.policeVerificationUrl || null,
                referenceContact: u.referenceContact || null,
                agreedToGpsTracking: u.agreedToGpsTracking || null,
                agreedToHandleMeds: u.agreedToHandleMeds || null,
                acknowledgeSla: u.acknowledgeSla || null,
                consentBackgroundCheck: u.consentBackgroundCheck || null,
                mfaSecret: u.mfaSecret || null,
                isMfaEnabled: Boolean(u.isMfaEnabled),
                createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
                updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date(),
            };
        });
        if (userRows.length > 0) {
            yield db_1.db.insert(schema_1.users).values(userRows).onConflictDoNothing();
        }
        console.log(`✅ Inserted ${userRows.length} Users into PostgreSQL`);
        // 2. Migrate Hospitals
        const mongoHospitals = yield Hospital_1.default.find({}).lean();
        console.log(`📦 Fetched ${mongoHospitals.length} Hospitals from MongoDB`);
        const validHospitalIds = new Set();
        const hospitalRows = mongoHospitals.map((h) => {
            var _a;
            const id = h._id.toString();
            validHospitalIds.add(id);
            const userIdStr = h.user ? h.user.toString() : null;
            return {
                id,
                name: h.name || 'Unnamed Hospital',
                slug: h.slug || id,
                address: h.address || 'Address Not Provided',
                city: h.city || 'City Not Provided',
                email: h.email || null,
                image: h.image || null,
                images: h.images || [],
                isOpen24Hours: Boolean(h.isOpen24Hours),
                consultationFee: String(h.consultationFee || 0),
                governmentSchemes: h.governmentSchemes || [],
                isOnlinePaymentAvailable: Boolean((_a = h.isOnlinePaymentAvailable) !== null && _a !== void 0 ? _a : true),
                ambulanceContact: h.ambulanceContact || null,
                contactNumber: h.contactNumber || null,
                phoneNumbers: h.phoneNumbers || [],
                description: h.description || null,
                rating: String(h.rating || 0),
                doctors: h.doctors || [],
                managementType: h.management_type || 'SELF',
                isVerified: Boolean(h.is_verified),
                plan: h.plan || 'Standard',
                isFeatured: Boolean(h.is_featured),
                hasGovtSchemes: Boolean(h.has_govt_schemes),
                hasCustomPage: Boolean(h.has_custom_page),
                isSpotlight: Boolean(h.is_spotlight),
                prioritySupport: Boolean(h.priority_support),
                userId: userIdStr && validUserIds.has(userIdStr) ? userIdStr : null,
                tempPassword: h.tempPassword || null,
                hospitalType: h.hospitalType || 'Private',
                bedCapacity: h.bedCapacity || 50,
                specialities: h.specialities || [],
                trialEndDate: h.trialEndDate ? new Date(h.trialEndDate) : null,
                bankDetails: h.bankDetails || null,
                createdAt: h.createdAt ? new Date(h.createdAt) : new Date(),
                updatedAt: h.updatedAt ? new Date(h.updatedAt) : new Date(),
            };
        });
        if (hospitalRows.length > 0) {
            yield db_1.db.insert(schema_1.hospitals).values(hospitalRows).onConflictDoNothing();
        }
        console.log(`✅ Inserted ${hospitalRows.length} Hospitals into PostgreSQL`);
        // 3. Migrate Doctors
        const mongoDoctors = yield Doctor_1.default.find({}).lean();
        console.log(`📦 Fetched ${mongoDoctors.length} Doctors from MongoDB`);
        const validDoctorIds = new Set();
        const doctorRows = mongoDoctors
            .filter((d) => d.hospital && validHospitalIds.has(d.hospital.toString()))
            .map((d) => {
            var _a;
            const id = d._id.toString();
            validDoctorIds.add(id);
            return {
                id,
                hospitalId: d.hospital.toString(),
                name: d.name || 'Unnamed Doctor',
                email: d.email || null,
                phone: d.phone || null,
                specialty: d.specialty || 'General',
                fee: String(d.fee || 0),
                availability: d.availability || [],
                isActive: Boolean((_a = d.is_active) !== null && _a !== void 0 ? _a : true),
                isSpecialtyGroup: Boolean(d.isSpecialtyGroup),
                department: d.department || null,
                maxAppointmentsPerSlot: d.maxAppointmentsPerSlot || 1,
                doctorsCount: d.doctorsCount || 1,
                description: d.description || null,
                createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
                updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
            };
        });
        if (doctorRows.length > 0) {
            yield db_1.db.insert(schema_1.doctors).values(doctorRows).onConflictDoNothing();
        }
        console.log(`✅ Inserted ${doctorRows.length} Doctors into PostgreSQL`);
        // 4. Migrate Slots
        const mongoSlots = yield Slot_1.default.find({}).lean();
        console.log(`📦 Fetched ${mongoSlots.length} Slots from MongoDB`);
        const validSlotIds = new Set();
        const slotRows = mongoSlots
            .filter((s) => s.doctor && validDoctorIds.has(s.doctor.toString()) && s.hospital && validHospitalIds.has(s.hospital.toString()))
            .map((s) => {
            const id = s._id.toString();
            validSlotIds.add(id);
            const cancelledByStr = s.cancelledBy ? s.cancelledBy.toString() : null;
            return {
                id,
                doctorId: s.doctor.toString(),
                hospitalId: s.hospital.toString(),
                startTime: new Date(s.startTime),
                endTime: new Date(s.endTime),
                status: s.status || 'available',
                appointmentId: s.appointment ? s.appointment.toString() : null,
                cancelledAt: s.cancelledAt ? new Date(s.cancelledAt) : null,
                cancellationReason: s.cancellationReason || null,
                cancelledBy: cancelledByStr && validUserIds.has(cancelledByStr) ? cancelledByStr : null,
                bookedCount: s.booked_count || 0,
                maxAppointments: s.max_appointments || 1,
                holdCount: s.hold_count || 0,
                createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
                updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
            };
        });
        if (slotRows.length > 0) {
            yield db_1.db.insert(schema_1.slots).values(slotRows).onConflictDoNothing();
        }
        console.log(`✅ Inserted ${slotRows.length} Slots into PostgreSQL`);
        // 5. Migrate Appointments
        const mongoAppointments = yield Appointment_1.default.find({}).lean();
        console.log(`📦 Fetched ${mongoAppointments.length} Appointments from MongoDB`);
        const appointmentRows = mongoAppointments
            .filter((a) => a.patient && validUserIds.has(a.patient.toString()) &&
            a.doctor && validDoctorIds.has(a.doctor.toString()) &&
            a.hospital && validHospitalIds.has(a.hospital.toString()))
            .map((a) => {
            const id = a._id.toString();
            const slotIdStr = a.slot ? a.slot.toString() : null;
            const updatedByStr = a.paymentUpdatedBy ? a.paymentUpdatedBy.toString() : null;
            return {
                id,
                patientId: a.patient.toString(),
                doctorId: a.doctor.toString(),
                hospitalId: a.hospital.toString(),
                slotId: slotIdStr && validSlotIds.has(slotIdStr) ? slotIdStr : null,
                slotTime: a.slotTime ? new Date(a.slotTime) : new Date(),
                status: a.status || 'pending',
                paymentStatus: a.paymentStatus || 'unpaid',
                paymentSource: a.paymentSource || 'manual',
                paymentUpdatedAt: a.paymentUpdatedAt ? new Date(a.paymentUpdatedAt) : null,
                paymentUpdatedBy: updatedByStr && validUserIds.has(updatedByStr) ? updatedByStr : null,
                bookingDate: a.bookingDate ? new Date(a.bookingDate) : new Date(),
                notes: a.notes || null,
                prescriptionUrl: a.prescriptionUrl || null,
                prescriptionBase64: a.prescriptionBase64 || null,
                prescriptionUploadedAt: a.prescriptionUploadedAt ? new Date(a.prescriptionUploadedAt) : null,
                invoiceUrl: a.invoiceUrl || null,
                tokenNumber: a.tokenNumber || null,
                patientName: a.patientName || null,
                patientPhone: a.patientPhone || null,
                patientEmail: a.patientEmail || null,
                patientAge: a.patientAge || null,
                doctorName: a.doctorName || null,
                hospitalName: a.hospitalName || null,
                consultationFee: a.consultationFee ? String(a.consultationFee) : null,
                appointmentDate: a.appointmentDate || null,
                appointmentTime: a.appointmentTime || null,
                createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
                updatedAt: a.updatedAt ? new Date(a.updatedAt) : new Date(),
            };
        });
        if (appointmentRows.length > 0) {
            yield db_1.db.insert(schema_1.appointments).values(appointmentRows).onConflictDoNothing();
        }
        console.log(`✅ Inserted ${appointmentRows.length} Appointments into PostgreSQL`);
        // 6. Migrate Donors
        const mongoDonors = yield BloodDonor_1.default.find({}).lean();
        console.log(`📦 Fetched ${mongoDonors.length} BloodDonors from MongoDB`);
        const donorRows = mongoDonors.map((d) => {
            var _a;
            const id = d._id.toString();
            const userIdStr = d.user ? d.user.toString() : null;
            return {
                id,
                userId: userIdStr && validUserIds.has(userIdStr) ? userIdStr : null,
                name: d.name || 'Unnamed Donor',
                email: d.email || null,
                bloodGroup: d.bloodGroup || 'O+',
                gender: d.gender || 'Other',
                age: d.age || 18,
                phone: d.phone || null,
                address: d.address || 'Address Not Provided',
                area: d.area || 'Area Not Provided',
                city: d.city || 'City Not Provided',
                lastDonationDate: d.lastDonationDate ? new Date(d.lastDonationDate) : null,
                isAvailable: Boolean((_a = d.isAvailable) !== null && _a !== void 0 ? _a : true),
                source: d.source || 'user_panel',
                location: d.location || null,
                createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
                updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
            };
        });
        if (donorRows.length > 0) {
            yield db_1.db.insert(schema_1.donors).values(donorRows).onConflictDoNothing();
        }
        console.log(`✅ Inserted ${donorRows.length} BloodDonors into PostgreSQL`);
        // Verification Summary
        console.log('\n📊 Migration Count Summary:');
        console.table({
            Users: { MongoDB: mongoUsers.length, PostgreSQL: userRows.length },
            Hospitals: { MongoDB: mongoHospitals.length, PostgreSQL: hospitalRows.length },
            Doctors: { MongoDB: mongoDoctors.length, PostgreSQL: doctorRows.length },
            Slots: { MongoDB: mongoSlots.length, PostgreSQL: slotRows.length },
            Appointments: { MongoDB: mongoAppointments.length, PostgreSQL: appointmentRows.length },
            BloodDonors: { MongoDB: mongoDonors.length, PostgreSQL: donorRows.length },
        });
        yield mongoose_1.default.disconnect();
        console.log('\n🎉 Data Migration Completed Successfully!');
        process.exit(0);
    });
}
migrate().catch((err) => {
    console.error('❌ Migration Error:', err);
    process.exit(1);
});
