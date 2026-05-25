import { Request, Response } from 'express';
import HealthTip from '../models/HealthTip';

export const createHealthTip = async (req: Request, res: Response) => {
    try {
        const { title, description, imageUrl, date } = req.body;
        const newTip = new HealthTip({
            title,
            description,
            imageUrl,
            date: date || new Date()
        });
        const savedTip = await newTip.save();
        res.status(201).json(savedTip);
    } catch (error) {
        res.status(500).json({ message: 'Error creating health tip', error });
    }
};

export const getAllHealthTips = async (req: Request, res: Response) => {
    try {
        const mongoose = require('mongoose');
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DB connection timeout')), 5000)
        );

        if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
            throw new Error('Database not connected');
        }

        await Promise.race([
            mongoose.connection.db.admin().ping(),
            timeoutPromise
        ]);

        const tips = await HealthTip.find().sort({ date: -1 });
        res.status(200).json(tips);
    } catch (error: any) {
        console.error('Health hub error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export const deleteHealthTip = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const deletedTip = await HealthTip.findByIdAndDelete(id);
        if (!deletedTip) {
            return res.status(404).json({ message: 'Health tip not found' });
        }
        res.status(200).json({ message: 'Health tip deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting health tip', error });
    }
};

export const getHealthTipById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const tip = await HealthTip.findById(id);
        if (!tip) {
            return res.status(404).json({ message: 'Health tip not found' });
        }
        res.status(200).json(tip);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching health tip details', error });
    }
};
