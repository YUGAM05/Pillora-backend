import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';
import Hospital from '../models/Hospital';
async function migrate() {
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster';
    await mongoose.connect(mongoUri);
    console.log('Connected to DB for subscription migration');

    const hospitals = await Hospital.find();
    console.log(`Found ${hospitals.length} hospitals`);

    for (const h of hospitals) {
        let changed = false;

        if (!h.joiningDate) {
            h.joiningDate = (h as any).createdAt || new Date();
            changed = true;
        }
        if (!h.subscriptionDurationDays) {
            h.subscriptionDurationDays = 30;
            changed = true;
        }
        if (!h.paymentStatus) {
            h.paymentStatus = 'Pending';
            changed = true;
        }
        if (!h.subscriptionStatus) {
            h.subscriptionStatus = 'Pending';
            changed = true;
        }

        if (changed) {
            await h.save();
            console.log(`Migrated ${h.name}: joiningDate=${h.joiningDate}, paymentStatus=${h.paymentStatus}, subscriptionStatus=${h.subscriptionStatus}`);
        } else {
            console.log(`${h.name} is already up to date`);
        }
    }

    console.log('Migration completed');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
