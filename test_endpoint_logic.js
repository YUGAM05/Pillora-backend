const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const UserSchema = new mongoose.Schema({
    name: String,
    email: String
}, { strict: false });

const BloodDonorSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    bloodGroup: String,
    gender: String,
    age: Number,
    phone: String,
    address: String,
    area: String,
    city: String,
    isAvailable: { type: Boolean, default: true },
    source: String,
    createdAt: Date
}, { timestamps: true, collection: 'blooddonors' });

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const BloodDonor = mongoose.models.BloodDonor || mongoose.model('BloodDonor', BloodDonorSchema);

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const totalDonors = await BloodDonor.countDocuments({});
        const totalAvailable = await BloodDonor.countDocuments({ isAvailable: true });
        
        const donors = await BloodDonor.find({})
            .sort({ createdAt: -1 })
            .populate('user', 'name email');
            
        const standardizedDonors = donors.map(d => ({
            _id: d._id,
            name: d.name,
            email: d.email || d.user?.email || 'N/A',
            bloodGroup: d.bloodGroup,
            age: d.age,
            gender: d.gender,
            phone: d.phone,
            city: d.city,
            area: d.area,
            address: d.address,
            isAvailable: d.isAvailable,
            source: d.source || 'user_panel',
            createdAt: d.createdAt
        }));
        
        const responseJson = {
            donors: standardizedDonors,
            pagination: {
                total: totalDonors,
                available: totalAvailable,
                page: 1,
                limit: 100,
                pages: Math.ceil(totalDonors / 100),
                hasMore: 1 * 100 < totalDonors
            }
        };
        
        console.log('JSON RESPONSE:');
        console.log(JSON.stringify(responseJson, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
