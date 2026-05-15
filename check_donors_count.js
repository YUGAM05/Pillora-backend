const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function checkDonors() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        const bloodDonorCount = await mongoose.connection.db.collection('blooddonors').countDocuments();
        const donorCount = await mongoose.connection.db.collection('donors').countDocuments();

        console.log('BloodDonor count (blooddonors):', bloodDonorCount);
        console.log('Donor count (donors):', donorCount);

        const sampleDonors = await mongoose.connection.db.collection('donors').find({}).limit(5).toArray();
        console.log('Sample donors:', JSON.stringify(sampleDonors, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDonors();
