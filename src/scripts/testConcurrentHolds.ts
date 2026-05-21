import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Slot from '../models/Slot';
import Doctor from '../models/Doctor';
import Hospital from '../models/Hospital';
import { createHold } from '../utils/holdManager';

dotenv.config();

async function runTest() {
    console.log('--- Starting Concurrent Hold Verification Test ---');
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI is missing from env variables!');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('[DB] Connected to MongoDB.');

    // 1. Find or create a dummy Hospital, Doctor, and Slot
    let hospital = await Hospital.findOne();
    if (!hospital) {
        hospital = await Hospital.create({
            name: 'Test Hospital',
            city: 'Ahmedabad',
            address: '123 Test St',
            management_type: 'Self-Managed'
        });
    }

    let doctor = await Doctor.findOne();
    if (!doctor) {
        doctor = await Doctor.create({
            name: 'Test Doctor',
            specialty: 'Cardiologist',
            hospital: hospital._id,
            fee: 500,
            maxAppointmentsPerSlot: 1
        });
    }

    // Create a pristine slot specifically for this test
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 mins later
    
    const slot = await Slot.create({
        doctor: doctor._id,
        hospital: hospital._id,
        startTime,
        endTime,
        status: 'available',
        max_appointments: 1,
        booked_count: 0,
        hold_count: 0
    });

    console.log(`[SlotCreated] ID: ${slot._id}, status: ${slot.status}, booked_count: 0, hold_count: 0`);

    // 2. Simulate 5 users trying to hold this slot simultaneously
    const users = [
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString()
    ];

    console.log(`[Simulating] 5 concurrent users requesting temporary lock on slot ${slot._id}...`);

    // Create a mock socket server reference
    const mockIo = {
        emit: (event: string, data: any) => {
            console.log(`  -> [SocketEmit] ${event}: slotId=${data.slotId}, status=${data.status}, holdCount=${data.holdCount}`);
        }
    };

    // Execute concurrently using Promise.all
    const results = await Promise.all(
        users.map(async (userId, idx) => {
            try {
                const res = await createHold(slot._id.toString(), userId, mockIo);
                return { userId, success: res.success, message: res.message };
            } catch (err: any) {
                return { userId, success: false, error: err.message };
            }
        })
    );

    // 3. Output results
    console.log('\n--- Hold Results Summary ---');
    let successCount = 0;
    let failCount = 0;
    
    results.forEach((res, idx) => {
        if (res.success) {
            successCount++;
            console.log(`User ${idx + 1} (${res.userId.substring(0, 8)}): SUCCESS - ${res.message}`);
        } else {
            failCount++;
            console.log(`User ${idx + 1} (${res.userId.substring(0, 8)}): FAILED - ${res.message || res.error}`);
        }
    });

    console.log('\n--- Final Checks ---');
    console.log(`Successful Holds: ${successCount} (Expected: 1)`);
    console.log(`Failed Holds: ${failCount} (Expected: 4)`);

    // Fetch the slot state from DB to verify it is 'locked' and hold_count is 1
    const updatedSlot = await Slot.findById(slot._id);
    if (updatedSlot) {
        console.log(`DB Slot Status: '${updatedSlot.status}' (Expected: 'locked')`);
        console.log(`DB Slot Hold Count: ${updatedSlot.hold_count} (Expected: 1)`);
        
        if (successCount === 1 && failCount === 4 && updatedSlot.status === 'locked' && updatedSlot.hold_count === 1) {
            console.log('\n✅ CONCURRENCY TEST PASSED PERFECTLY!');
        } else {
            console.log('\n❌ CONCURRENCY TEST FAILED ON ALIGNMENT CHECKS.');
        }
    }

    // Clean up our test slot
    await Slot.deleteOne({ _id: slot._id });
    console.log('[Cleanup] Test slot removed.');

    await mongoose.disconnect();
    console.log('[DB] Disconnected.');
    process.exit(0);
}

runTest().catch(err => {
    console.error('Fatal error in test:', err);
    process.exit(1);
});
