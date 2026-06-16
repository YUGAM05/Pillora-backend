import { Request, Response } from 'express';
import Hospital from '../models/Hospital';
import Doctor from '../models/Doctor'; // ✅ Added
import { AuthRequest } from '../middleware/authMiddleware';
import { v2 as cloudinary } from 'cloudinary'; // ✅ Added
import slugify from 'slugify';
import mongoose from 'mongoose';
import { logActivity } from '../utils/activityLogger';

// ✅ Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djlttfqje',
    api_key: process.env.CLOUDINARY_API_KEY || '372769319742221',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'JZ88aoet4iKXegIT19PKqDoL2nU',
});

// @desc    Get all unique cities
// @route   GET /api/hospitals/cities
// @access  Public
export const getCities = async (req: Request, res: Response): Promise<void> => {
    try {
        const cities = await Hospital.distinct('city');
        res.json(cities);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get all hospitals
// @route   GET /api/hospitals
// @access  Public
export const getHospitals = async (req: Request, res: Response): Promise<void> => {
    try {
        const { 
            city, 
            speciality, 
            pmjay, 
            govtSchemes, 
            hospitalType, 
            bedCapacity, 
            emergency, 
            booking, 
            minRating,
            sortBy
        } = req.query;
        
        let query: any = {};

        if (city) {
            query.city = { $regex: new RegExp(`^${String(city).trim()}$`, 'i') };
        }
        if (pmjay === 'true') {
            query.governmentSchemes = { $regex: 'PM-JAY|Ayushman Bharat', $options: 'i' };
        }
        if (govtSchemes) {
            const schemesArr = String(govtSchemes).split(',').map(s => s.trim()).filter(Boolean);
            if (schemesArr.length > 0) {
                query.governmentSchemes = { $in: schemesArr.map(s => new RegExp(s, 'i')) };
            }
        }
        if (hospitalType) {
            const typesArr = String(hospitalType).split(',').map(t => t.trim()).filter(Boolean);
            if (typesArr.length > 0) {
                query.hospitalType = { $in: typesArr.map(t => new RegExp(`^${t}$`, 'i')) };
            }
        }
        if (bedCapacity) {
            const capacityRanges = String(bedCapacity).split(',').map(c => c.trim()).filter(Boolean);
            if (capacityRanges.length > 0) {
                const orConditions: any[] = [];
                capacityRanges.forEach(range => {
                    if (range === '<50') {
                        orConditions.push({ bedCapacity: { $lt: 50 } });
                    } else if (range === '50-200') {
                        orConditions.push({ bedCapacity: { $gte: 50, $lte: 200 } });
                    } else if (range === '200-500') {
                        orConditions.push({ bedCapacity: { $gte: 200, $lte: 500 } });
                    } else if (range === '500+') {
                        orConditions.push({ bedCapacity: { $gt: 500 } });
                    }
                });
                if (orConditions.length > 0) {
                    query.$or = orConditions;
                }
            }
        }
        if (emergency === 'true') {
            query.isOpen24Hours = true;
        }
        if (minRating) {
            query.rating = { $gte: Number(minRating) };
        }

        let hospitals = await Hospital.find(query);

        if (speciality) {
            const specList = String(speciality).split(',').map(s => s.trim()).filter(Boolean);
            if (specList.length > 0) {
                const specRegexes = specList.map(s => new RegExp(s, 'i'));
                const doctors = await Doctor.find({
                    $or: [
                        { specialty: { $in: specRegexes } },
                        { department: { $in: specRegexes } }
                    ]
                });
                const hospitalIds = doctors.map(d => d.hospital.toString());
                hospitals = hospitals.filter(h => {
                    const hasSpecInDoc = hospitalIds.includes(h._id.toString());
                    const hasSpecInHosp = h.specialities && h.specialities.some(s => specList.some(f => s.toLowerCase().includes(f.toLowerCase())));
                    return hasSpecInDoc || hasSpecInHosp;
                });
            }
        }

        if (booking === 'true') {
            const doctors = await Doctor.find({ is_active: true });
            const hospitalIdsWithDoctors = new Set(doctors.map(d => d.hospital.toString()));
            hospitals = hospitals.filter(h => hospitalIdsWithDoctors.has(h._id.toString()) || (h.doctors && h.doctors.length > 0));
        }

        if (sortBy) {
            if (sortBy === 'rating') {
                hospitals.sort((a, b) => b.rating - a.rating);
            } else if (sortBy === 'beds') {
                hospitals.sort((a, b) => (b.bedCapacity || 0) - (a.bedCapacity || 0));
            } else if (sortBy === 'name') {
                hospitals.sort((a, b) => a.name.localeCompare(b.name));
            }
        }

        res.json(hospitals);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Get single hospital
// @route   GET /api/hospitals/:id
// @access  Public
export const getHospitalById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const querySlug = req.query.slug as string;
        const queryId = req.query.id as string;

        let hospital;
        if (querySlug) {
            hospital = await Hospital.findOne({ slug: querySlug });
        } else if (queryId) {
            hospital = await Hospital.findById(queryId);
        } else if (id) {
            if (mongoose.isValidObjectId(id)) {
                hospital = await Hospital.findById(id);
            } else {
                hospital = await Hospital.findOne({ slug: id });
            }
        }

        if (hospital) {
            // Fetch real doctors from Doctor model that are linked to this hospital
            const dbDoctors = await Doctor.find({ hospital: hospital._id, is_active: { $ne: false } });
            
            // Convert Mongoose document to plain object to allow modifying
            const hospitalObj = hospital.toObject();
            
            // Map the Doctor collection fields to match the structure expected by the frontend
            hospitalObj.doctors = dbDoctors.map(doc => ({
                _id: doc._id,
                name: doc.name,
                specialization: doc.specialty,
                fee: doc.fee,
                daysAvailable: doc.availability?.map(a => a.day) || [],
                timing: doc.availability && doc.availability.length > 0
                    ? `${doc.availability[0].startTime} - ${doc.availability[0].endTime}`
                    : 'Flexible timings',
                isSpecialtyGroup: doc.isSpecialtyGroup,
                department: doc.department,
                maxAppointmentsPerSlot: doc.maxAppointmentsPerSlot,
                doctorsCount: doc.doctorsCount,
                description: doc.description
            }));

            res.json(hospitalObj);
        } else {
            res.status(404).json({ message: 'Hospital not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Seed hospitals (Temporary for data population)
// @route   POST /api/hospitals/seed
// @access  Public (Should be private in prod)
export const seedHospitals = async (req: Request, res: Response): Promise<void> => {
    try {
        // Clear both Hospital and Doctor collections for a clean, deterministic seeding state
        await Hospital.deleteMany({});
        await Doctor.deleteMany({});

        const hospitals = [
            {
                _id: new mongoose.Types.ObjectId("69e4a708fe1c90e1721baf78"),
                name: "Vrundavan Children Hospital",
                slug: "vrundavan-children-hospital",
                address: "2nd Floor, Ashirwad Avenue,Beside Dipak Petrol Pump, Opp. Kocharab Ashram, Pritamnagar, Ahmedabad",
                city: "Ahmedabad",
                image: "https://res.cloudinary.com/djlttfqje/image/upload/v1776592646/hospitals/smopdu5fgyaivcszsbog.jpg",
                images: [
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776592646/hospitals/smopdu5fgyaivcszsbog.jpg",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776591924/hospitals/mn7byimzu9lnrctxlxje.jpg"
                ],
                isOpen24Hours: false,
                consultationFee: 1000,
                governmentSchemes: ["MA Vatsalya"],
                isOnlinePaymentAvailable: true,
                ambulanceContact: "",
                contactNumber: "",
                phoneNumbers: ["94096 54006", "95589 51408"],
                description: "🏥  <b>Vrundavan Children Hospital</b>\n<br><div><b>Hospital Type : </b>Private \n\n<b>Departments &amp; Services</b>\n\n1).🩺 General Pediatrics\n2).💉 Vaccination\n3).🧠 Epilepsy in Children\n4).🦠 Infectious Disease\n5).🫁 Respiratory Disease<div><br></div><div><b>Charges</b></div><div><b>Charges for Old Case :</b> 500\n<b>Charges for New Case :</b> 1000</div><div><br></div><div>Emergency OPD is Available on Sunday </div><div> </div><div><b>Total beds :</b> 19 Beds\n\n<br><div><br></div></div></div>",
                rating: 4.4,
                doctors: [],
                management_type: "SELF" as const,
                is_verified: false,
                plan: "Standard" as const,
                is_featured: false,
                has_govt_schemes: true,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                hospitalType: "Private" as const,
                bedCapacity: 19,
                specialities: ["Paediatrics"],
                user: new mongoose.Types.ObjectId("6a06d7b6036cb833da973567")
            },
            {
                _id: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796822"),
                name: "Sahaj Clinic ",
                slug: "sahaj-clinic",
                address: " I, Block 240, TITANIUM CITY CENTER BUSINESS PARK, Mall, 100 Feet Anand Nagar Rd, Satellite, Ahmedabad, Gujarat 380015",
                city: "Ahmedabad",
                image: "https://res.cloudinary.com/djlttfqje/image/upload/v1779291416/pillora-seller/bhwjckvornjkfjzdzfp0.webp",
                images: [
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1779291658/pillora-seller/o7ri6k5tjz4dxi3zskbd.webp",
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1779291658/pillora-seller/wijvfokghllnwkvnlig1.webp"
                ],
                isOpen24Hours: false,
                consultationFee: 700,
                governmentSchemes: [],
                isOnlinePaymentAvailable: true,
                ambulanceContact: " 63513 53722",
                phoneNumbers: [],
                description: "Sahaj Clinic Description(about their Clinic)\nDaily OPD Timings (Monday – Friday, excluding Wednesday evening alterations)\nMorning: 10:30 AM to 1:00 PM\nEvening: 5:00 PM to 7:30 PM\n\nWednesday \"Corporate Friendly\" Timings\nEvening: 5:00 PM to 8:30 PM (Extended for working professionals)",
                rating: 4,
                doctors: [],
                management_type: "SELF" as const,
                is_verified: true,
                plan: "Standard" as const,
                is_featured: false,
                has_govt_schemes: false,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                hospitalType: "Private" as const,
                bedCapacity: 10,
                specialities: ["General Medicine"],
                user: new mongoose.Types.ObjectId("6a0dd6a76d74f8c57879681f"),
                tempPassword: "2cce11e57859be5b"
            },
            {
                _id: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796833"),
                name: "Pillora Civil General Hospital",
                slug: "pillora-civil-general-hospital",
                address: "Asarwa, Near Haripura, Ahmedabad, Gujarat 380016",
                city: "Ahmedabad",
                image: "/premium-hospital.png",
                images: ["/premium-hospital.png"],
                isOpen24Hours: true,
                consultationFee: 0,
                governmentSchemes: ["Ayushman Bharat (PM-JAY)", "CGHS", "ESI"],
                isOnlinePaymentAvailable: false,
                ambulanceContact: "108",
                phoneNumbers: ["079 2268 3721"],
                description: "Pillora Civil General Hospital is a large government-run healthcare facility offering free or subsidized medical procedures under PM-JAY and state health schemes. Offers multi-specialty diagnostics, surgeries, and 24/7 trauma care.",
                rating: 4.2,
                doctors: [],
                management_type: "PILLORA" as const,
                is_verified: true,
                plan: "Premium" as const,
                is_featured: true,
                has_govt_schemes: true,
                has_custom_page: true,
                is_spotlight: true,
                priority_support: true,
                hospitalType: "Government" as const,
                bedCapacity: 1200,
                specialities: ["Cardiology", "Orthopaedics", "Gynaecology", "Neurology", "General Surgery"],
                user: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796810")
            },
            {
                _id: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796844"),
                name: "Sharda Charitable Trust Hospital",
                slug: "sharda-charitable-trust-hospital",
                address: "Ellis Bridge, Opp. Town Hall, Ahmedabad, Gujarat 380006",
                city: "Ahmedabad",
                image: "/premium-hospital.png",
                images: ["/premium-hospital.png"],
                isOpen24Hours: true,
                consultationFee: 150,
                governmentSchemes: ["Ayushman Bharat (PM-JAY)"],
                isOnlinePaymentAvailable: true,
                ambulanceContact: "079 2657 7621",
                phoneNumbers: ["079 2657 7621"],
                description: "Providing affordable, high-quality medical services to all sections of the community. Run by Sharda Charitable Trust, this hospital offers emergency services and accommodates Ayushman Bharat PM-JAY cardholders.",
                rating: 3.8,
                doctors: [],
                management_type: "SELF" as const,
                is_verified: true,
                plan: "Standard" as const,
                is_featured: false,
                has_govt_schemes: true,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                hospitalType: "Trust" as const,
                bedCapacity: 85,
                specialities: ["Paediatrics", "General Surgery"],
                user: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796811")
            },
            {
                _id: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796855"),
                name: "Baroda Mediverse Hospital",
                slug: "baroda-mediverse-hospital",
                address: "RC Dutt Rd, Alkapuri, Vadodara, Gujarat 390007",
                city: "Vadodara",
                image: "/premium-hospital.png",
                images: ["/premium-hospital.png"],
                isOpen24Hours: true,
                consultationFee: 800,
                governmentSchemes: ["Ayushman Bharat (PM-JAY)", "MA Vatsalya"],
                isOnlinePaymentAvailable: true,
                ambulanceContact: "0265 235 6000",
                phoneNumbers: ["0265 235 6000"],
                description: "State of the art tertiary care hospital in Vadodara (Baroda). Known for exceptional cardiology, orthopaedics, and gynaecology department services with online booking available on Pillora.",
                rating: 4.6,
                doctors: [],
                management_type: "SELF" as const,
                is_verified: true,
                plan: "Premium" as const,
                is_featured: true,
                has_govt_schemes: true,
                has_custom_page: true,
                is_spotlight: false,
                priority_support: false,
                hospitalType: "Private" as const,
                bedCapacity: 250,
                specialities: ["Cardiology", "Orthopaedics", "Gynaecology"],
                user: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796812")
            },
            {
                _id: new mongoose.Types.ObjectId("6a25013623badca91c49968a"),
                name: "Ami Clinic",
                slug: "ami-clinic",
                address: "Opposite Yagnik Hall, Near Bhidbhanjan Hanuman, Bapunagar, Ahmedabad, Gujarat 380024",
                city: "Ahmedabad",
                image: "https://res.cloudinary.com/djlttfqje/image/upload/v1776592646/hospitals/smopdu5fgyaivcszsbog.jpg",
                images: [
                    "https://res.cloudinary.com/djlttfqje/image/upload/v1776592646/hospitals/smopdu5fgyaivcszsbog.jpg"
                ],
                isOpen24Hours: false,
                consultationFee: 500,
                governmentSchemes: [],
                isOnlinePaymentAvailable: true,
                ambulanceContact: "",
                phoneNumbers: ["079 2274 3808"],
                description: "🏥 <b>Ami Clinic</b><br><div><b>Hospital Type :</b> Private\n\nProvide general check-ups, child care, vaccination, and family medicine services. Led by experienced healthcare professionals committed to family health and community wellness.</div>",
                rating: 4.5,
                doctors: [],
                management_type: "SELF" as const,
                is_verified: true,
                plan: "Standard" as const,
                is_featured: false,
                has_govt_schemes: false,
                has_custom_page: false,
                is_spotlight: false,
                priority_support: false,
                hospitalType: "Private" as const,
                bedCapacity: 15,
                specialities: ["General Medicine", "Paediatrics"],
                user: new mongoose.Types.ObjectId("6a25013623badca91c499680")
            }
        ];

        // Seed Hospitals
        await Hospital.insertMany(hospitals);

        // Seed separate Doctors in Doctor collection
        const doctorsToSeed = [
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e301"),
                hospital: new mongoose.Types.ObjectId("69e4a708fe1c90e1721baf78"), // Vrundavan
                name: "Dr. Hashmukh D Shah",
                specialty: "M.D(Gold Medalist)",
                fee: 1000,
                availability: [
                    { day: 'Monday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Tuesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Wednesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Thursday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Friday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Saturday', startTime: '10:00', endTime: '13:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 1,
                doctorsCount: 1
            },
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e302"),
                hospital: new mongoose.Types.ObjectId("69e4a708fe1c90e1721baf78"), // Vrundavan
                name: "Dr. JIgnesh Modi",
                specialty: "M.D.D.Ped.DNB",
                fee: 1000,
                availability: [
                    { day: 'Monday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Saturday', startTime: '17:00', endTime: '19:30' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 1,
                doctorsCount: 1
            },
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e2f4"),
                hospital: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796822"), // Sahaj Clinic
                name: "Dr Dhaivat Desai",
                specialty: "M.D.MEDICINE",
                fee: 700,
                availability: [
                    { day: 'Monday', startTime: '10:30', endTime: '13:00' },
                    { day: 'Saturday', startTime: '10:30', endTime: '15:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 1,
                doctorsCount: 1
            },
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e311"),
                hospital: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796833"), // Civil Hospital
                name: "Dr. Rajesh Verma",
                specialty: "M.D. Cardiology",
                department: "Cardiology",
                fee: 0,
                availability: [
                    { day: 'Monday', startTime: '09:00', endTime: '14:00' },
                    { day: 'Wednesday', startTime: '09:00', endTime: '14:00' },
                    { day: 'Friday', startTime: '09:00', endTime: '14:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 20,
                doctorsCount: 1
            },
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e312"),
                hospital: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796833"), // Civil Hospital
                name: "Dr. Sunita Patel",
                specialty: "M.S. Gynaecology",
                department: "Gynaecology",
                fee: 0,
                availability: [
                    { day: 'Tuesday', startTime: '09:00', endTime: '14:00' },
                    { day: 'Thursday', startTime: '09:00', endTime: '14:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 20,
                doctorsCount: 1
            },
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e313"),
                hospital: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796844"), // Sharda Trust
                name: "Dr. Amit Mehta",
                specialty: "D.Ch. Paediatrics",
                department: "Paediatrics",
                fee: 150,
                availability: [
                    { day: 'Monday', startTime: '10:00', endTime: '12:30' },
                    { day: 'Tuesday', startTime: '10:00', endTime: '12:30' },
                    { day: 'Wednesday', startTime: '10:00', endTime: '12:30' },
                    { day: 'Thursday', startTime: '10:00', endTime: '12:30' },
                    { day: 'Friday', startTime: '10:00', endTime: '12:30' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 5,
                doctorsCount: 1
            },
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e314"),
                hospital: new mongoose.Types.ObjectId("6a0dd6a76d74f8c578796855"), // Baroda Mediverse
                name: "Dr. Vijay Shah",
                specialty: "M.D. Cardiology",
                department: "Cardiology",
                fee: 800,
                availability: [
                    { day: 'Monday', startTime: '11:00', endTime: '16:00' },
                    { day: 'Tuesday', startTime: '11:00', endTime: '16:00' },
                    { day: 'Wednesday', startTime: '11:00', endTime: '16:00' },
                    { day: 'Thursday', startTime: '11:00', endTime: '16:00' },
                    { day: 'Friday', startTime: '11:00', endTime: '16:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 8,
                doctorsCount: 1
            },
            {
                _id: new mongoose.Types.ObjectId("6a0e94371ab452da0a38e315"),
                hospital: new mongoose.Types.ObjectId("6a25013623badca91c49968a"), // Ami Clinic
                name: "Dr. Dilip Deliwala",
                specialty: "M.B.B.S",
                fee: 500,
                availability: [
                    { day: 'Monday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Tuesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Wednesday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Thursday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Friday', startTime: '10:00', endTime: '13:00' },
                    { day: 'Saturday', startTime: '10:00', endTime: '13:00' }
                ],
                is_active: true,
                isSpecialtyGroup: false,
                maxAppointmentsPerSlot: 5,
                doctorsCount: 1
            }
        ];

        await Doctor.insertMany(doctorsToSeed);

        res.json({ message: 'Hospitals and Doctors seeded successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// @desc    Create hospital (Admin)
// @route   POST /api/hospitals
// @access  Private/Admin
export const createHospital = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const {
            name,
            address,
            city,
            image,
            images,
            isOpen24Hours,
            consultationFee,
            governmentSchemes,
            isOnlinePaymentAvailable,
            ambulanceContact,
            contactNumber,
            phoneNumbers,
            description,
            rating,
            doctors,
            hospitalType,
            bedCapacity,
            specialities
        } = req.body;

        if (!name || !address || !city || (!image && (!images || images.length === 0)) || !consultationFee) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }

        let imagesArr: string[] = [];
        if (Array.isArray(images)) {
            imagesArr = images.filter(Boolean);
        }

        // Build phoneNumbers array (prefer the array, fall back to single contactNumber)
        let phoneNumbersArr: string[] = [];
        if (Array.isArray(phoneNumbers)) {
            phoneNumbersArr = phoneNumbers.filter((p: string) => p && p.trim() !== '');
        } else if (typeof phoneNumbers === 'string' && phoneNumbers.trim()) {
            phoneNumbersArr = [phoneNumbers.trim()];
        }

        let baseSlug = slugify(name, { lower: true, strict: true, trim: true });
        let currentSlug = baseSlug;
        let counter = 2;
        while (await Hospital.findOne({ slug: currentSlug })) {
            currentSlug = `${baseSlug}-${counter}`;
            counter++;
        }

        const hospital = await Hospital.create({
            name,
            slug: currentSlug,
            address,
            city,
            image,
            images: imagesArr,
            isOpen24Hours: Boolean(isOpen24Hours),
            consultationFee: Number(consultationFee),
            governmentSchemes: Array.isArray(governmentSchemes)
                ? governmentSchemes
                : typeof governmentSchemes === 'string'
                    ? governmentSchemes.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : [],
            isOnlinePaymentAvailable: Boolean(isOnlinePaymentAvailable),
            ambulanceContact,
            contactNumber,
            phoneNumbers: phoneNumbersArr,
            description: description || '',
            rating: rating ? Number(rating) : 0,
            doctors: Array.isArray(doctors) ? doctors : [],
            hospitalType: hospitalType || 'Private',
            bedCapacity: bedCapacity ? Number(bedCapacity) : 50,
            specialities: Array.isArray(specialities)
                ? specialities
                : typeof specialities === 'string'
                    ? specialities.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : []
        });

        res.status(201).json(hospital);

        // Log Platform Activity
        const io = req.app.get('io');
        logActivity(io, {
            title: 'New Hospital Registered',
            description: `${name} has been added to the network in ${city}.`,
            type: 'hospital'
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
};

// @desc    Update hospital (Admin)
// @route   PUT /api/hospitals/:id
// @access  Private/Admin
export const updateHospital = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updateData = { ...req.body };

        if (updateData.consultationFee !== undefined) {
            updateData.consultationFee = Number(updateData.consultationFee);
        }
        if (updateData.isOpen24Hours !== undefined) {
            updateData.isOpen24Hours = Boolean(updateData.isOpen24Hours);
        }
        if (updateData.isOnlinePaymentAvailable !== undefined) {
            updateData.isOnlinePaymentAvailable = Boolean(updateData.isOnlinePaymentAvailable);
        }
        if (updateData.governmentSchemes && typeof updateData.governmentSchemes === 'string') {
            updateData.governmentSchemes = updateData.governmentSchemes.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        if (updateData.images && typeof updateData.images === 'string') {
            updateData.images = updateData.images.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        if (updateData.bedCapacity !== undefined) {
            updateData.bedCapacity = Number(updateData.bedCapacity);
        }
        if (updateData.specialities && typeof updateData.specialities === 'string') {
            updateData.specialities = updateData.specialities.split(',').map((s: string) => s.trim()).filter(Boolean);
        }

        const hospital = await Hospital.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        res.json(hospital);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
};

// @desc    Delete hospital (Admin)
// @route   DELETE /api/hospitals/:id
// @access  Private/Admin
export const deleteHospital = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const hospital = await Hospital.findByIdAndDelete(req.params.id);
        if (!hospital) {
            res.status(404).json({ message: 'Hospital not found' });
            return;
        }
        res.json({ message: 'Hospital deleted' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
};

// @desc    Upload hospital images
// @route   POST /api/hospitals/upload-images
// @access  Private/Admin
export const uploadHospitalImages = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const files = (req as any).files as Express.Multer.File[];
        if (!files || files.length === 0) {
            res.status(400).json({ message: 'No files uploaded' });
            return;
        }

        // ✅ Upload each file buffer to Cloudinary
        const uploadPromises = files.map((file) => {
            return new Promise<string>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'hospitals' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result!.secure_url); // ✅ Cloudinary URL
                    }
                );
                stream.end(file.buffer); // ✅ Push buffer to Cloudinary
            });
        });

        const urls = await Promise.all(uploadPromises);
        res.json({ urls }); // ✅ Returns Cloudinary URLs
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Server Error', error });
    }
};

// @desc    Search hospitals (Autocomplete)
// @route   GET /api/hospitals/search?q=query
// @access  Public
export const searchHospitals = async (req: Request, res: Response): Promise<void> => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            res.json([]);
            return;
        }

        const hospitals = await Hospital.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { city: { $regex: q, $options: 'i' } },
                { address: { $regex: q, $options: 'i' } }
            ]
        })
            .select('name city address image images rating')
            .limit(5);

        res.json(hospitals);
    } catch (error) {
        res.status(500).json({ message: 'Error searching hospitals', error });
    }
};