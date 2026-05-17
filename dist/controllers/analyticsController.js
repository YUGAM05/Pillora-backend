"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsStats = exports.trackEvent = void 0;
const Analytics_1 = __importDefault(require("../models/Analytics"));
const ua_parser_js_1 = require("ua-parser-js");
const crypto_1 = __importDefault(require("crypto"));
const trackEvent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type, eventName, path, referrer, bandwidth, metadata } = req.body;
        console.log(`[Analytics] Tracking ${type} for ${path} (Bandwidth: ${bandwidth}b)`);
        const ua = req.headers['user-agent'] || '';
        const parser = new ua_parser_js_1.UAParser(ua);
        const result = parser.getResult();
        // Robust IP detection
        const forwarded = req.headers['x-forwarded-for'];
        const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.ip || '0.0.0.0').trim();
        const dateStr = new Date().toISOString().split('T')[0];
        // Create an anonymous visitor hash (IP + User Agent + Date)
        const visitorHash = crypto_1.default.createHash('sha256')
            .update(`${ip}-${ua}-${dateStr}`)
            .digest('hex');
        const analyticsEntry = new Analytics_1.default({
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
        yield analyticsEntry.save();
        console.log(`[Analytics] Saved successfully: ${path}`);
        res.status(200).json({ success: true });
    }
    catch (error) {
        console.error('Analytics tracking error:', error);
        res.status(500).json({ success: false, error: 'Failed to track event' });
    }
});
exports.trackEvent = trackEvent;
const getAnalyticsStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { timeframe = '24h' } = req.query;
        let startDate = new Date();
        if (timeframe === '1h')
            startDate.setHours(startDate.getHours() - 1);
        else if (timeframe === '24h')
            startDate.setHours(startDate.getHours() - 24);
        else if (timeframe === '7d')
            startDate.setDate(startDate.getDate() - 7);
        else if (timeframe === '30d')
            startDate.setDate(startDate.getDate() - 30);
        console.log(`[Analytics] Fetching stats since ${startDate.toISOString()} (Timeframe: ${timeframe})`);
        // Basic stats
        const totalPageViews = yield Analytics_1.default.countDocuments({
            type: 'pageview',
            timestamp: { $gte: startDate }
        });
        const uniqueVisitors = yield Analytics_1.default.distinct('visitorHash', {
            timestamp: { $gte: startDate }
        });
        console.log(`[Analytics] Stats found: ${totalPageViews} views, ${uniqueVisitors.length} unique visitors`);
        // Top pages
        const topPages = yield Analytics_1.default.aggregate([
            { $match: { type: 'pageview', timestamp: { $gte: startDate } } },
            { $group: { _id: '$path', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        // Device breakdown
        const deviceBreakdown = yield Analytics_1.default.aggregate([
            { $match: { timestamp: { $gte: startDate } } },
            { $group: { _id: '$device', count: { $sum: 1 } } }
        ]);
        // Bandwidth usage
        const totalBandwidth = yield Analytics_1.default.aggregate([
            { $match: { timestamp: { $gte: startDate } } },
            { $group: { _id: null, total: { $sum: '$bandwidth' } } }
        ]);
        // Real-time (Active users in last 5 minutes)
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activeUsers = yield Analytics_1.default.distinct('visitorHash', {
            timestamp: { $gte: fiveMinsAgo }
        });
        // Traffic over time (hourly)
        const trafficOverTime = yield Analytics_1.default.aggregate([
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
        const lastRecord = yield Analytics_1.default.findOne().sort({ timestamp: -1 });
        res.status(200).json({
            success: true,
            stats: {
                totalPageViews,
                uniqueVisitors: uniqueVisitors.length,
                activeUsers: activeUsers.length,
                totalBandwidth: ((_a = totalBandwidth[0]) === null || _a === void 0 ? void 0 : _a.total) || 0,
                topPages,
                deviceBreakdown,
                trafficOverTime,
                lastRecordAt: (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.timestamp) || null
            }
        });
    }
    catch (error) {
        console.error('Analytics fetch error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
});
exports.getAnalyticsStats = getAnalyticsStats;
