const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function listAll() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const collections = await mongoose.connection.db.listCollections().toArray();
        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            if (count > 0) {
                console.log(`Collection '${col.name}' has ${count} documents.`);
                if (col.name.toLowerCase().includes('donor')) {
                     const sample = await mongoose.connection.db.collection(col.name).findOne({});
                     console.log('Sample from ' + col.name + ':', JSON.stringify(sample, null, 2));
                }
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listAll();
