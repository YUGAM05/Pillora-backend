import redis from './redisMock';
import Slot from '../models/Slot';
import Doctor from '../models/Doctor';
import mongoose from 'mongoose';

// Listen for TTL expiration in redis mock to automatically release database holds
redis.on('expired', async (key: string) => {
    if (key.startsWith('hold:')) {
        const parts = key.split(':');
        if (parts.length === 3) {
            const slotId = parts[1];
            const userId = parts[2];
            try {
                const slot = await Slot.findOneAndUpdate(
                    { _id: slotId, hold_count: { $gt: 0 } },
                    { $inc: { hold_count: -1 } },
                    { new: true }
                );
                
                if (slot) {
                    // Emit real-time updates via socket.io
                    const io = (global as any).socketIO;
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
            } catch (err) {
                console.error(`Error handling expired hold for slot ${slotId}:`, err);
            }
        }
    }
});

export const createHold = async (slotId: string, userId: string, io: any): Promise<{ success: boolean; message: string; expiryMs?: number }> => {
    const holdKey = `hold:${slotId}:${userId}`;
    
    // Check if user already holds it
    const existingHold = await redis.get(holdKey);
    if (existingHold) {
        return { success: true, message: 'Slot already held by you', expiryMs: 300 * 1000 };
    }

    // Lock and check slot availability inside database
    const slot = await Slot.findById(slotId).populate('doctor');
    if (!slot) {
        return { success: false, message: 'Slot not found' };
    }

    if (slot.status === 'cancelled') {
        return { success: false, message: 'Slot cancelled by admin' };
    }

    // Resolve max_appointments dynamically if not set
    let maxAppts = slot.max_appointments || 1;
    if (slot.doctor && (slot.doctor as any).maxAppointmentsPerSlot) {
        maxAppts = (slot.doctor as any).maxAppointmentsPerSlot;
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
    await Slot.updateOne({ _id: slotId }, { $inc: { hold_count: 1 }, max_appointments: maxAppts });
    
    // Set in Redis with 5 minutes (300 seconds) TTL
    await redis.setex(holdKey, 300, 'active');

    // Store global socket handle
    if (io) {
        (global as any).socketIO = io;
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
};

export const releaseHold = async (slotId: string, userId: string, io: any): Promise<boolean> => {
    const holdKey = `hold:${slotId}:${userId}`;
    const deleted = await redis.del(holdKey);
    
    if (deleted > 0) {
        const slot = await Slot.findOneAndUpdate(
            { _id: slotId, hold_count: { $gt: 0 } },
            { $inc: { hold_count: -1 } },
            { new: true }
        );
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
};

export const isHeldByUser = async (slotId: string, userId: string): Promise<boolean> => {
    const holdKey = `hold:${slotId}:${userId}`;
    const result = await redis.get(holdKey);
    return result !== null;
};

// Fallback Cron Job logic (Run every 60 seconds)
export const runHoldCleanup = async (io: any): Promise<void> => {
    try {
        const slotsWithHolds = await Slot.find({ hold_count: { $gt: 0 } });
        for (const slot of slotsWithHolds) {
            const redisKeys = await redis.keys(`hold:${slot._id}:*`);
            const actualHoldCount = redisKeys.length;
            
            if (slot.hold_count !== actualHoldCount) {
                console.log(`[HoldCleanup] Correcting hold_count for slot ${slot._id} from ${slot.hold_count} to ${actualHoldCount}`);
                slot.hold_count = actualHoldCount;
                await slot.save();
                
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
    } catch (err) {
        console.error('[HoldCleanup] Error in background hold cleanup:', err);
    }
};
