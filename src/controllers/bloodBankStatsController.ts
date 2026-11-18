import { Request, Response } from 'express';
import BloodDonor from '../models/BloodDonor';

/**
 * Public, read-only, AGGREGATE donor statistics per city, used by the
 * www.pillora.in city pages (/blood-donors/[city]).
 *
 * Privacy:
 *  - Returns counts only. Never names, phone numbers, addresses, ages or IDs.
 *  - The per-blood-group breakdown is returned only for cities at or above
 *    MIN_DONORS_FOR_BREAKDOWN, so small cities cannot reveal individuals.
 */
export const MIN_DONORS_FOR_BREAKDOWN = 10;

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const slugify = (city: string) =>
    city.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Small in-process cache: the numbers change slowly and the pages use ISR.
let cache: { at: number; data: unknown } | null = null;
const CACHE_MS = 10 * 60 * 1000;

// @desc    Registered donor counts per city (aggregate only)
// @route   GET /api/blood-bank/stats/cities
// @access  Public
export const getCityDonorStats = async (_req: Request, res: Response): Promise<void> => {
    try {
        if (cache && Date.now() - cache.at < CACHE_MS) {
            res.set('Cache-Control', 'public, max-age=600');
            res.json(cache.data);
            return;
        }

        const rows = await BloodDonor.aggregate([
            { $match: { city: { $type: 'string', $ne: '' } } },
            {
                $group: {
                    _id: { city: { $toLower: { $trim: { input: '$city' } } }, bloodGroup: '$bloodGroup' },
                    total: { $sum: 1 },
                    available: { $sum: { $cond: ['$isAvailable', 1, 0] } },
                    updatedAt: { $max: '$updatedAt' },
                },
            },
        ]);

        const byCity = new Map<string, { donors: number; available: number; groups: Record<string, number>; updatedAt?: Date }>();
        for (const r of rows) {
            const key = r._id.city as string;
            const entry = byCity.get(key) || { donors: 0, available: 0, groups: {}, updatedAt: undefined };
            entry.donors += r.total;
            entry.available += r.available;
            if (BLOOD_GROUPS.includes(r._id.bloodGroup)) entry.groups[r._id.bloodGroup] = (entry.groups[r._id.bloodGroup] || 0) + r.total;
            if (!entry.updatedAt || (r.updatedAt && r.updatedAt > entry.updatedAt)) entry.updatedAt = r.updatedAt;
            byCity.set(key, entry);
        }

        const data = [...byCity.entries()]
            .map(([city, e]) => ({
                city: titleCase(city),
                slug: slugify(city),
                donors: e.donors,
                available: e.available,
                updatedAt: e.updatedAt,
                byBloodGroup: e.donors >= MIN_DONORS_FOR_BREAKDOWN ? e.groups : undefined,
            }))
            .filter((c) => c.slug)
            .sort((a, b) => b.donors - a.donors);

        cache = { at: Date.now(), data };
        res.set('Cache-Control', 'public, max-age=600');
        res.json(data);
    } catch (error) {
        console.error('City donor stats error:', error);
        res.status(500).json({ message: 'Could not load donor statistics' });
    }
};
