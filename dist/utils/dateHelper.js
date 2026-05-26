"use strict";
/**
 * IST (India Standard Time) Date Formatting Utilities
 *
 * All dates/times stored in MongoDB are UTC. These helpers convert
 * them to IST (UTC+5:30 / Asia/Kolkata) before displaying in emails.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTimeIST = exports.formatDateIST = exports.formatToIST = void 0;
/**
 * Format a date to a full IST date+time string.
 * Example: "26/05/2026, 09:14 am"
 */
const formatToIST = (date) => {
    const d = new Date(date);
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};
exports.formatToIST = formatToIST;
/**
 * Format a date to IST date string only.
 * Example: "26/05/2026"
 */
const formatDateIST = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};
exports.formatDateIST = formatDateIST;
/**
 * Format a date to IST time string only.
 * Example: "09:14 am"
 */
const formatTimeIST = (date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};
exports.formatTimeIST = formatTimeIST;
