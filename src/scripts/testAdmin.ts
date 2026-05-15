import mongoose from 'mongoose';
import User from '../models/User';

mongoose.connect('mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster').then(async () => {
    const users = await User.find({ role: 'admin' });
    console.log(users);
    process.exit(0);
});
