const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('--- DATABASE INSPECTION ---');
        
        const blooddonorsCol = mongoose.connection.db.collection('blooddonors');
        const donorsCol = mongoose.connection.db.collection('donors');
        
        const bDonors = await blooddonorsCol.find({}).toArray();
        const lDonors = await donorsCol.find({}).toArray();
        
        console.log(`EXACT COUNT IN 'blooddonors': ${bDonors.length}`);
        bDonors.forEach(d => {
            console.log(`- ID: ${d._id}, Name: ${d.name || d.donor_name}, Group: ${d.bloodGroup || d.blood_group}, Phone: ${d.phone || d.donor_phone}, City: ${d.city}, Area: ${d.area}`);
        });
        
        console.log(`\nEXACT COUNT IN 'donors': ${lDonors.length}`);
        lDonors.forEach(d => {
            console.log(`- ID: ${d._id}, Name: ${d.name || d.donor_name}, Group: ${d.bloodGroup || d.blood_group}, Phone: ${d.phone || d.donor_phone}, City: ${d.city}, Area: ${d.area}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
