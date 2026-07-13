const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

async function runTest() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to database.');

        // 1. Get the user for clinic@gmail.com
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const userDoc = await User.findOne({ email: 'clinic@gmail.com' });
        if (!userDoc) {
            console.error('Hospital user clinic@gmail.com not found!');
            return;
        }
        console.log('Found user:', userDoc._id, 'Role:', userDoc.role);

        // 2. Find the Hospital profile
        const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
        const hospitalDoc = await Hospital.findOne({ user: userDoc._id });
        if (!hospitalDoc) {
            console.error('Hospital profile not found for user clinic@gmail.com!');
            return;
        }
        console.log('Found hospital:', hospitalDoc._id, 'Name:', hospitalDoc.name);

        // 3. Find an appointment for this hospital
        const Appointment = mongoose.model('Appointment', new mongoose.Schema({}, { strict: false }));
        let appointmentDoc = await Appointment.findOne({ hospital: hospitalDoc._id });
        if (!appointmentDoc) {
            console.log('No appointment found for this hospital, creating a mock appointment for testing...');
            appointmentDoc = await Appointment.create({
                hospital: hospitalDoc._id,
                doctor: new mongoose.Types.ObjectId(), // dummy doctor
                patient: new mongoose.Types.ObjectId(), // dummy patient
                patientName: 'Test Patient',
                patientEmail: 'testpatient@gmail.com',
                bookingDate: new Date(),
                bookingTime: '10:00 AM',
                status: 'completed',
                fee: 500
            });
            console.log('Created mock appointment:', appointmentDoc._id);
        } else {
            console.log('Found existing appointment:', appointmentDoc._id);
        }

        // 4. Directly sign a token for clinic@gmail.com
        const secret = process.env.JWT_SECRET || 'supersecretkey_dev_only';
        const token = jwt.sign({ id: userDoc._id.toString(), role: userDoc.role }, secret, { expiresIn: '1d' });
        console.log('Token generated directly.');

        // 5. Create a valid dummy PDF file (we need %PDF header)
        const pdfPath = path.join(__dirname, 'test_prescription.pdf');
        fs.writeFileSync(pdfPath, '%PDF-1.4\n%...\n%%EOF');

        // 6. Upload the PDF to the prescription endpoint
        console.log(`Uploading prescription to /api/hospital/dashboard/appointments/${appointmentDoc._id}/prescription...`);
        const form = new FormData();
        form.append('prescription', fs.createReadStream(pdfPath));

        const res = await axios.post(`http://localhost:5000/api/hospital/dashboard/appointments/${appointmentDoc._id}/prescription`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Upload Result Status:', res.status);
        console.log('Upload Result Data:', JSON.stringify(res.data, null, 2));

        // Clean up
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
        }
    } catch (err) {
        console.error('Test failed!');
        if (err.response) {
            console.error('Response Status:', err.response.status);
            console.error('Response Data:', err.response.data);
        } else {
            console.error('Error message:', err.message);
        }
    } finally {
        await mongoose.connection.close();
        console.log('DB Connection closed.');
    }
}

runTest();
