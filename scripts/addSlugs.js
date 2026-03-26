require('dotenv').config();
const mongoose = require('mongoose');
const slugify = require('slugify');

const hospitalSchema = new mongoose.Schema({
    name: String,
    slug: String
}, { strict: false });

const Hospital = mongoose.model('Hospital', hospitalSchema);

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        
        const hospitals = await Hospital.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] });
        console.log(`Found ${hospitals.length} hospitals without a slug`);
        
        for (const hospital of hospitals) {
            let baseSlug = slugify(hospital.name, { lower: true, strict: true, trim: true });
            let currentSlug = baseSlug;
            let counter = 2;
            
            while (await Hospital.findOne({ slug: currentSlug })) {
                currentSlug = `${baseSlug}-${counter}`;
                counter++;
            }
            
            hospital.slug = currentSlug;
            await hospital.save();
            console.log(`Updated hospital ID ${hospital._id} with slug: ${currentSlug}`);
        }
        
        console.log('Migration complete.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
