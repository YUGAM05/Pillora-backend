import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { seedHospitals } from '../controllers/hospitalController';
import { Request, Response } from 'express';
import { getMongoUri } from '../config/env';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = getMongoUri();

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
