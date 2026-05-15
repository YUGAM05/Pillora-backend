import { Request, Response } from 'express';
import Analytics from '../models/Analytics';
import UAParser from 'ua-parser-js';
import crypto from 'crypto';

export const trackEvent = async (req: Request, res: Response) => {
    try {
        const { type, eventName, path, referrer, bandwidth, metadata } = req.body;
        console.log(`[Analytics] Tracking ${type} for ${path} (Bandwidth: ${bandwidth}b)`);
        
        const ua = req.headers['user-agent'] || '';
        const parser = new UAParser(ua);
        const result = parser.getResult();
        
        const ip = (req.headers['x-forwarded-for'] as string || req.ip || '0.0.0.0').split(',')[0].trim();
        const dateStr = new Date().toISOString().split('T')[0];
        
        // Create an anonymous visitor hash (IP + User Agent + Date)
        const visitorHash = crypto.createHash('sha256')
            .update(`${ip}-${ua}-${dateStr}`)
            .digest('hex');

        const analyticsEntry = new Analytics({
            type,
            eventName,
            path,
            referrer,
            browser: result.browser.name || 'Unknown',
            os: result.os.name || 'Unknown',
            device: result.device.type || 'desktop',
            bandwidth: bandwidth || 0,
            visitorHash,
            metadata,
            timestamp: new Date()
        });

        await analyticsEntry.save();
        console.log(`[Analytics] Saved successfully: ${path}`);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Analytics tracking error:', error);
        res.status(500).json({ success: false, error: 'Failed to track event' });
    }
};

export const getAnalyticsStats = async (req: Request, res: Response) => {
    try {
        const { timeframe = '24h' } = req.query;
        let startDate = new Date();
        
        if (timeframe === '1h') startDate.setHours(startDate.getHours() - 1);
        else if (timeframe === '24h') startDate.setHours(startDate.getHours() - 24);
        else if (timeframe === '7d') startDate.setDate(startDate.getDate() - 7);
        else if (timeframe === '30d') startDate.setDate(startDate.getDate() - 30);

        console.log(`[Analytics] Fetching stats since ${startDate.toISOString()} (Timeframe: ${timeframe})`);

        // Basic stats
        const totalPageViews = await Analytics.countDocuments({ 
            type: 'pageview', 
            timestamp: { $gte: startDate } 
        });

        const uniqueVisitors = await Analytics.distinct('visitorHash', { 
            timestamp: { $gte: startDate } 
        });

        console.log(`[Analytics] Stats found: ${totalPageViews} views, ${uniqueVisitors.length} unique visitors`);

        // Top pages
        const topPages = await Analytics.aggregate([
            { $match: { type: 'pageview', timestamp: { $gte: startDate } } },
            { $group: { _id: '$path', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Device breakdown
        const deviceBreakdown = await Analytics.aggregate([
            { $match: { timestamp: { $gte: startDate } } },
            { $group: { _id: '$device', count: { $sum: 1 } } }
        ]);

        // Bandwidth usage
        const totalBandwidth = await Analytics.aggregate([
            { $match: { timestamp: { $gte: startDate } } },
            { $group: { _id: null, total: { $sum: '$bandwidth' } } }
        ]);

        // Real-time (Active users in last 5 minutes)
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activeUsers = await Analytics.distinct('visitorHash', { 
            timestamp: { $gte: fiveMinsAgo } 
        });

        // Traffic over time (hourly)
        const trafficOverTime = await Analytics.aggregate([
            { $match: { type: 'pageview', timestamp: { $gte: startDate } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" },
                        hour: { $hour: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 } }
        ]);

        // Last record
        const lastRecord = await Analytics.findOne().sort({ timestamp: -1 });
 
        res.status(200).json({
            success: true,
            stats: {
                totalPageViews,
                uniqueVisitors: uniqueVisitors.length,
                activeUsers: activeUsers.length,
                totalBandwidth: totalBandwidth[0]?.total || 0,
                topPages,
                deviceBreakdown,
                trafficOverTime,
                lastRecordAt: lastRecord?.timestamp || null
            }
        });
    } catch (error) {
        console.error('Analytics fetch error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
};
