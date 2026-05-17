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
exports.runHoldCleanup = exports.isHeldByUser = exports.releaseHold = exports.createHold = void 0;
const redisMock_1 = __importDefault(require("./redisMock"));
const Slot_1 = __importDefault(require("../models/Slot"));
// Listen for TTL expiration in redis mock to automatically release database holds
redisMock_1.default.on('expired', (key) => __awaiter(void 0, void 0, void 0, function* () {
    if (key.startsWith('hold:')) {
        const parts = key.split(':');
        if (parts.length === 3) {
            const slotId = parts[1];
            const userId = parts[2];
            try {
                const slot = yield Slot_1.default.findOneAndUpdate({ _id: slotId, hold_count: { $gt: 0 } }, { $inc: { hold_count: -1 } }, { new: true });
                if (slot) {
                    // Emit real-time updates via socket.io
                    const io = global.socketIO;
                    if (io) {
                        io.emit('slotHoldReleased', {
                            slotId,
                            doctorId: slot.doctor,
                            date: new Date(slot.startTime).toISOString().split('T')[0],
                            bookedCount: slot.booked_count,
                            holdCount: slot.hold_count,
                            maxAppointments: slot.max_appointments
                        });
                    }
                }
            }
            catch (err) {
                console.error(`Error handling expired hold for slot ${slotId}:`, err);
            }
        }
    }
}));
const createHold = (slotId, userId, io) => __awaiter(void 0, void 0, void 0, function* () {
    const holdKey = `hold:${slotId}:${userId}`;
    // Check if user already holds it
    const existingHold = yield redisMock_1.default.get(holdKey);
    if (existingHold) {
        return { success: true, message: 'Slot already held by you', expiryMs: 300 * 1000 };
    }
    // Lock and check slot availability inside database
    const slot = yield Slot_1.default.findById(slotId).populate('doctor');
    if (!slot) {
        return { success: false, message: 'Slot not found' };
    }
    if (slot.status === 'cancelled') {
        return { success: false, message: 'Slot cancelled by admin' };
    }
    // Resolve max_appointments dynamically if not set
    let maxAppts = slot.max_appointments || 1;
    if (slot.doctor && slot.doctor.maxAppointmentsPerSlot) {
        maxAppts = slot.doctor.maxAppointmentsPerSlot;
    }
    // Check if full
    if (slot.booked_count >= maxAppts) {
        return { success: false, message: 'Slot just became full' };
    }
    // Check if available capacity left including active holds
    if (slot.booked_count + slot.hold_count >= maxAppts) {
        return { success: false, message: 'Slot on temporary hold' };
    }
    // Atomically increment hold_count
    yield Slot_1.default.updateOne({ _id: slotId }, { $inc: { hold_count: 1 }, max_appointments: maxAppts });
    // Set in Redis with 5 minutes (300 seconds) TTL
    yield redisMock_1.default.setex(holdKey, 300, 'active');
    // Store global socket handle
    if (io) {
        global.socketIO = io;
        io.emit('slotHeld', {
            slotId,
            doctorId: slot.doctor._id,
            date: new Date(slot.startTime).toISOString().split('T')[0],
            bookedCount: slot.booked_count,
            holdCount: slot.hold_count + 1,
            maxAppointments: maxAppts
        });
    }
    return { success: true, message: 'Slot successfully held', expiryMs: 300 * 1000 };
});
exports.createHold = createHold;
const releaseHold = (slotId, userId, io) => __awaiter(void 0, void 0, void 0, function* () {
    const holdKey = `hold:${slotId}:${userId}`;
    const deleted = yield redisMock_1.default.del(holdKey);
    if (deleted > 0) {
        const slot = yield Slot_1.default.findOneAndUpdate({ _id: slotId, hold_count: { $gt: 0 } }, { $inc: { hold_count: -1 } }, { new: true });
        if (slot && io) {
            io.emit('slotHoldReleased', {
                slotId,
                doctorId: slot.doctor,
                date: new Date(slot.startTime).toISOString().split('T')[0],
                bookedCount: slot.booked_count,
                holdCount: slot.hold_count,
                maxAppointments: slot.max_appointments
            });
        }
        return true;
    }
    return false;
});
exports.releaseHold = releaseHold;
const isHeldByUser = (slotId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const holdKey = `hold:${slotId}:${userId}`;
    const result = yield redisMock_1.default.get(holdKey);
    return result !== null;
});
exports.isHeldByUser = isHeldByUser;
// Fallback Cron Job logic (Run every 60 seconds)
const runHoldCleanup = (io) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const slotsWithHolds = yield Slot_1.default.find({ hold_count: { $gt: 0 } });
        for (const slot of slotsWithHolds) {
            const redisKeys = yield redisMock_1.default.keys(`hold:${slot._id}:*`);
            const actualHoldCount = redisKeys.length;
            if (slot.hold_count !== actualHoldCount) {
                console.log(`[HoldCleanup] Correcting hold_count for slot ${slot._id} from ${slot.hold_count} to ${actualHoldCount}`);
                slot.hold_count = actualHoldCount;
                yield slot.save();
                if (io) {
                    io.emit('slotHoldReleased', {
                        slotId: slot._id,
                        doctorId: slot.doctor,
                        date: new Date(slot.startTime).toISOString().split('T')[0],
                        bookedCount: slot.booked_count,
                        holdCount: slot.hold_count,
                        maxAppointments: slot.max_appointments
                    });
                }
            }
        }
    }
    catch (err) {
        console.error('[HoldCleanup] Error in background hold cleanup:', err);
    }
});
exports.runHoldCleanup = runHoldCleanup;
