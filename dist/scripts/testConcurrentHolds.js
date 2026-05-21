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
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const Slot_1 = __importDefault(require("../models/Slot"));
const Doctor_1 = __importDefault(require("../models/Doctor"));
const Hospital_1 = __importDefault(require("../models/Hospital"));
const holdManager_1 = require("../utils/holdManager");
dotenv_1.default.config();
function runTest() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('--- Starting Concurrent Hold Verification Test ---');
        const uri = process.env.MONGO_URI;
        if (!uri) {
            console.error('MONGO_URI is missing from env variables!');
            process.exit(1);
        }
        yield mongoose_1.default.connect(uri);
        console.log('[DB] Connected to MongoDB.');
        // 1. Find or create a dummy Hospital, Doctor, and Slot
        let hospital = yield Hospital_1.default.findOne();
        if (!hospital) {
            hospital = yield Hospital_1.default.create({
                name: 'Test Hospital',
                city: 'Ahmedabad',
                address: '123 Test St',
                management_type: 'Self-Managed'
            });
        }
        let doctor = yield Doctor_1.default.findOne();
        if (!doctor) {
            doctor = yield Doctor_1.default.create({
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
        const slot = yield Slot_1.default.create({
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
            new mongoose_1.default.Types.ObjectId().toString(),
            new mongoose_1.default.Types.ObjectId().toString(),
            new mongoose_1.default.Types.ObjectId().toString(),
            new mongoose_1.default.Types.ObjectId().toString(),
            new mongoose_1.default.Types.ObjectId().toString()
        ];
        console.log(`[Simulating] 5 concurrent users requesting temporary lock on slot ${slot._id}...`);
        // Create a mock socket server reference
        const mockIo = {
            emit: (event, data) => {
                console.log(`  -> [SocketEmit] ${event}: slotId=${data.slotId}, status=${data.status}, holdCount=${data.holdCount}`);
            }
        };
        // Execute concurrently using Promise.all
        const results = yield Promise.all(users.map((userId, idx) => __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield (0, holdManager_1.createHold)(slot._id.toString(), userId, mockIo);
                return { userId, success: res.success, message: res.message };
            }
            catch (err) {
                return { userId, success: false, error: err.message };
            }
        })));
        // 3. Output results
        console.log('\n--- Hold Results Summary ---');
        let successCount = 0;
        let failCount = 0;
        results.forEach((res, idx) => {
            if (res.success) {
                successCount++;
                console.log(`User ${idx + 1} (${res.userId.substring(0, 8)}): SUCCESS - ${res.message}`);
            }
            else {
                failCount++;
                console.log(`User ${idx + 1} (${res.userId.substring(0, 8)}): FAILED - ${res.message || res.error}`);
            }
        });
        console.log('\n--- Final Checks ---');
        console.log(`Successful Holds: ${successCount} (Expected: 1)`);
        console.log(`Failed Holds: ${failCount} (Expected: 4)`);
        // Fetch the slot state from DB to verify it is 'locked' and hold_count is 1
        const updatedSlot = yield Slot_1.default.findById(slot._id);
        if (updatedSlot) {
            console.log(`DB Slot Status: '${updatedSlot.status}' (Expected: 'locked')`);
            console.log(`DB Slot Hold Count: ${updatedSlot.hold_count} (Expected: 1)`);
            if (successCount === 1 && failCount === 4 && updatedSlot.status === 'locked' && updatedSlot.hold_count === 1) {
                console.log('\n✅ CONCURRENCY TEST PASSED PERFECTLY!');
            }
            else {
                console.log('\n❌ CONCURRENCY TEST FAILED ON ALIGNMENT CHECKS.');
            }
        }
        // Clean up our test slot
        yield Slot_1.default.deleteOne({ _id: slot._id });
        console.log('[Cleanup] Test slot removed.');
        yield mongoose_1.default.disconnect();
        console.log('[DB] Disconnected.');
        process.exit(0);
    });
}
runTest().catch(err => {
    console.error('Fatal error in test:', err);
    process.exit(1);
});
