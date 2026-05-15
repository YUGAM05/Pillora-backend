const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function checkDonors() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('All Collections:', collections.map(c => c.name));

        for (const col of collections) {
            if (col.name.toLowerCase().includes('donor')) {
                const count = await mongoose.connection.db.collection(col.name).countDocuments();
                console.log(`Collection '${col.name}' has ${count} documents.`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDonors();
