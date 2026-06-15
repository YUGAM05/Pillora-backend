import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { seedHospitals } from '../controllers/hospitalController';
import { Request, Response } from 'express';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ApexCareAdmin:Admin123@apexcarecluster.vytzhzk.mongodb.net/e-pharmacy?retryWrites=true&w=majority&appName=ApexCareCluster';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB. Running seed...');
        
        // Mock req and res
        const req = {} as Request;
        const res = {
            json: (data: any) => {
                console.log('Seed success:', data);
                process.exit(0);
            },
            status: (code: number) => {
                return {
                    json: (data: any) => {
                        console.error('Seed failed with code', code, data);
                        process.exit(1);
                    }
                };
            }
        } as unknown as Response;

        await seedHospitals(req, res);
    })
    .catch((err) => {
        console.error('Connection error:', err);
        process.exit(1);
    });
