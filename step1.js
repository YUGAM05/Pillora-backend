const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const DonorSchema = new mongoose.Schema({}, { strict: false, collection: 'blooddonors' });
const Donor = mongoose.model('Donor', DonorSchema);

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Exact snippet requested by the user:
        const allDonors = await Donor.find({});
        console.log('EXACT COUNT IN DB:', allDonors.length);
        allDonors.forEach(d => console.log(d._id, d.name, d.bloodGroup, d.city));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
