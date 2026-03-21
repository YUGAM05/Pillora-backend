import { Request, Response } from 'express';
import Medicine from '../models/Medicine';
import { AuthRequest } from '../middleware/authMiddleware';

export const sellerAddMedicine = async (req: AuthRequest, res: Response) => {
    try {
        const seller_id = req.user._id;
        const { name, generic_name, brand, category, price, stock, dosage, expiry_date, requires_prescription } = req.body;

        let image_url = '';
        if (req.file) {
            image_url = req.file.path;
        }

        const medicine = await Medicine.create({
            seller_id,
            name,
            generic_name,
            brand,
            category,
            price,
            stock,
            dosage,
            expiry_date,
            requires_prescription,
            image_url,
            admin_approved: 'pending'
        });

        res.status(201).json(medicine);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sellerGetMyMedicines = async (req: AuthRequest, res: Response) => {
    try {
        const medicines = await Medicine.find({ seller_id: req.user._id });
        res.status(200).json(medicines);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sellerUpdateMedicine = async (req: AuthRequest, res: Response) => {
    try {
        const medicine = await Medicine.findOneAndUpdate(
            { _id: req.params.id, seller_id: req.user._id },
            req.body,
            { new: true }
        );

        if (!medicine) {
            return res.status(404).json({ message: 'Medicine not found or unauthorized' });
        }

        res.status(200).json(medicine);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sellerDeleteMedicine = async (req: AuthRequest, res: Response) => {
    try {
        const medicine = await Medicine.findOneAndDelete({ _id: req.params.id, seller_id: req.user._id });
        if (!medicine) {
            return res.status(404).json({ message: 'Medicine not found' });
        }
        res.status(200).json({ message: 'Medicine deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const adminGetAllMedicines = async (req: Request, res: Response) => {
    try {
        const medicines = await Medicine.find()
            .populate('seller_id', 'name pharmacy_name'); // Assumes pharmacy_name exists on User
        res.status(200).json(medicines);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const adminApproveMedicine = async (req: Request, res: Response) => {
    try {
        const { admin_approved, rejection_reason } = req.body;
        const medicine = await Medicine.findByIdAndUpdate(
            req.params.id,
            { admin_approved, rejection_reason },
            { new: true }
        );

        if (!medicine) {
            return res.status(404).json({ message: 'Medicine not found' });
        }

        res.status(200).json(medicine);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getApprovedMedicines = async (req: Request, res: Response) => {
    try {
        let query: any = { admin_approved: 'approved', stock: { $gt: 0 } };

        if (req.query.name) {
            query.name = { $regex: req.query.name, $options: 'i' };
        }

        const medicines = await Medicine.find(query);
        res.status(200).json(medicines);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const searchMedicinesByNames = async (req: Request, res: Response) => {
    try {
        const { names } = req.body;
        if (!Array.isArray(names)) {
            return res.status(400).json({ message: 'Names must be an array' });
        }

        const regexes = names.map(name => new RegExp(name, 'i'));
        const medicines = await Medicine.find({
            admin_approved: 'approved',
            name: { $in: regexes }
        });

        // Group by name for easier UI handling
        const grouped = names.reduce((acc: any, name: string) => {
            acc[name] = medicines.filter(m => new RegExp(name, 'i').test(m.name));
            return acc;
        }, {});

        res.status(200).json(grouped);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
