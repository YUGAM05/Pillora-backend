import PlatformActivity from '../models/PlatformActivity';
import { Server } from 'socket.io';

export const logActivity = async (
    io: Server | undefined,
    data: {
        title: string;
        description: string;
        type: 'user' | 'hospital' | 'blood_donor' | 'blood_request' | 'partner' | 'system';
    }
) => {
    try {
        const activity = await PlatformActivity.create({
            ...data,
            timestamp: new Date()
        });

        if (io) {
            io.emit('platform_activity', activity);
            console.log(`[ActivityBroadcast] Emitted: ${data.title}`);
        }

        return activity;
    } catch (error) {
        console.error('Error logging activity:', error);
    }
};
