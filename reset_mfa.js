const mongoose = require('./Pillora-backend/node_modules/mongoose');
const dotenv = require('./Pillora-backend/node_modules/dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'Pillora-backend', '.env') });

const UserSchema = new mongoose.Schema({
    email: String,
    role: String,
    mfaSecret: String,
    isMfaEnabled: Boolean
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function resetMfa() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        
        const result = await User.updateOne(
            { email: 'admin@pillora.in' },
            { $unset: { mfaSecret: 1 }, $set: { isMfaEnabled: false } }
        );
        console.log('MFA reset successfully. Result:', result);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

resetMfa();
