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
                // Atomically release hold: set status to 'available' if it was 'locked'
                const slot = await Slot.findOneAndUpdate(
                    { _id: slotId, status: 'locked', hold_count: { $gt: 0 } },
                    { 
                        $set: { status: 'available' },
                        $inc: { hold_count: -1 } 
                    },
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
                            maxAppointments: slot.max_appointments,
                            status: 'available'
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
        return { success: true, message: 'Slot already held by you', expiryMs: 120 * 1000 };
    }

    // Resolve doctor and slot to check config
    const tempSlot = await Slot.findById(slotId).populate('doctor');
    if (!tempSlot) {
        return { success: false, message: 'Slot not found' };
    }

    if (tempSlot.status === 'cancelled') {
        return { success: false, message: 'Slot cancelled by admin' };
    }

    let maxAppts = tempSlot.max_appointments || 1;
    if (tempSlot.doctor && (tempSlot.doctor as any).maxAppointmentsPerSlot) {
        maxAppts = (tempSlot.doctor as any).maxAppointmentsPerSlot;
    }

    // Atomically find and update the slot to 'locked' if it's currently 'available'
    // This atomic query acts as a row-level lock equivalent to prevent two users from claiming it at the same moment.
    const slot = await Slot.findOneAndUpdate(
        { 
            _id: slotId, 
            status: 'available',
            booked_count: { $lt: maxAppts },
            hold_count: 0
        },
        { 
            $set: { status: 'locked', max_appointments: maxAppts },
            $inc: { hold_count: 1 }
        },
        { new: true }
    ).populate('doctor');

    if (!slot) {
        // Find slot to see why it failed and report accurate error
        const existingSlot = await Slot.findById(slotId);
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

    // Set in Redis with 2 minutes (120 seconds) TTL
    await redis.setex(holdKey, 120, 'active');

    // Store global socket handle
    if (io) {
        (global as any).socketIO = io;
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

    return { success: true, message: 'Slot successfully held', expiryMs: 120 * 1000 };
};

export const releaseHold = async (slotId: string, userId: string, io: any): Promise<boolean> => {
    const holdKey = `hold:${slotId}:${userId}`;
    const deleted = await redis.del(holdKey);
    
    if (deleted > 0) {
        const slot = await Slot.findOneAndUpdate(
            { _id: slotId, status: 'locked', hold_count: { $gt: 0 } },
            { 
                $set: { status: 'available' },
                $inc: { hold_count: -1 } 
            },
            { new: true }
        );
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
                if (actualHoldCount === 0 && slot.status === 'locked') {
                    slot.status = 'available';
                }
                
                await slot.save();
                
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
    } catch (err) {
        console.error('[HoldCleanup] Error in background hold cleanup:', err);
    }
};
