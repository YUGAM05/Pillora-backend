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
                // Atomically release hold: set status to 'available' if it was 'locked'
                const slot = yield Slot_1.default.findOneAndUpdate({ _id: slotId, status: 'locked', hold_count: { $gt: 0 } }, {
                    $set: { status: 'available' },
                    $inc: { hold_count: -1 }
                }, { new: true });
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
                            maxAppointments: slot.max_appointments,
                            status: 'available'
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
        return { success: true, message: 'Slot already held by you', expiryMs: 180 * 1000 };
    }
    // Resolve doctor and slot to check config
    const tempSlot = yield Slot_1.default.findById(slotId).populate('doctor');
    if (!tempSlot) {
        return { success: false, message: 'Slot not found' };
    }
    if (tempSlot.status === 'cancelled') {
        return { success: false, message: 'Slot cancelled by admin' };
    }
    let maxAppts = tempSlot.max_appointments || 1;
    if (tempSlot.doctor && tempSlot.doctor.maxAppointmentsPerSlot) {
        maxAppts = tempSlot.doctor.maxAppointmentsPerSlot;
    }
    // Atomically find and update the slot to 'locked' if it's currently 'available'
    // This atomic query acts as a row-level lock equivalent to prevent two users from claiming it at the same moment.
    const slot = yield Slot_1.default.findOneAndUpdate({
        _id: slotId,
        status: 'available',
        booked_count: { $lt: maxAppts },
        hold_count: 0
    }, {
        $set: { status: 'locked', max_appointments: maxAppts },
        $inc: { hold_count: 1 }
    }, { new: true }).populate('doctor');
    if (!slot) {
        // Find slot to see why it failed and report accurate error
        const existingSlot = yield Slot_1.default.findById(slotId);
        if (!existingSlot) {
            return { success: false, message: 'Slot not found' };
        }
        if (existingSlot.status === 'cancelled') {
            return { success: false, message: 'Slot cancelled by admin' };
        }
        if (existingSlot.status === 'booked' || existingSlot.booked_count >= maxAppts) {
            return { success: false, message: 'Slot just became full' };
        }
        if (existingSlot.status === 'locked' || existingSlot.hold_count > 0) {
            return { success: false, message: 'Slot on temporary hold' };
        }
        return { success: false, message: 'Slot not available' };
    }
    // Set in Redis with 3 minutes (180 seconds) TTL
    yield redisMock_1.default.setex(holdKey, 180, 'active');
    // Store global socket handle
    if (io) {
        global.socketIO = io;
        io.emit('slotHeld', {
            slotId,
            doctorId: slot.doctor._id,
            date: new Date(slot.startTime).toISOString().split('T')[0],
            bookedCount: slot.booked_count,
            holdCount: slot.hold_count,
            maxAppointments: maxAppts,
            status: 'locked'
        });
    }
    return { success: true, message: 'Slot successfully held', expiryMs: 180 * 1000 };
});
exports.createHold = createHold;
const releaseHold = (slotId, userId, io) => __awaiter(void 0, void 0, void 0, function* () {
    const holdKey = `hold:${slotId}:${userId}`;
    const deleted = yield redisMock_1.default.del(holdKey);
    if (deleted > 0) {
        const slot = yield Slot_1.default.findOneAndUpdate({ _id: slotId, status: 'locked', hold_count: { $gt: 0 } }, {
            $set: { status: 'available' },
            $inc: { hold_count: -1 }
        }, { new: true });
        if (slot && io) {
            io.emit('slotHoldReleased', {
                slotId,
                doctorId: slot.doctor,
                date: new Date(slot.startTime).toISOString().split('T')[0],
                bookedCount: slot.booked_count,
                holdCount: slot.hold_count,
                maxAppointments: slot.max_appointments,
                status: 'available'
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
                if (actualHoldCount === 0 && slot.status === 'locked') {
                    slot.status = 'available';
                }
                yield slot.save();
                if (io) {
                    io.emit('slotHoldReleased', {
                        slotId: slot._id,
                        doctorId: slot.doctor,
                        date: new Date(slot.startTime).toISOString().split('T')[0],
                        bookedCount: slot.booked_count,
                        holdCount: slot.hold_count,
                        maxAppointments: slot.max_appointments,
                        status: slot.status
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
