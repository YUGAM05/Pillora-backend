import { EventEmitter } from 'events';

class RedisMock extends EventEmitter {
    private store: Map<string, { value: string; expiry: number }> = new Map();
    private checkInterval: NodeJS.Timeout;

    constructor() {
        super();
        // Periodically evict expired keys from memory
        this.checkInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, item] of this.store.entries()) {
                if (now > item.expiry) {
                    this.store.delete(key);
                    this.emit('expired', key);
                }
            }
        }, 1000);
        // Avoid keeping the process active in tests or short scripts
        if (this.checkInterval.unref) {
            this.checkInterval.unref();
        }
    }

    async set(key: string, value: string): Promise<'OK'> {
        // No expiry by default
        this.store.set(key, { value, expiry: Infinity });
        return 'OK';
    }

    async setex(key: string, seconds: number, value: string): Promise<'OK'> {
        const expiry = Date.now() + seconds * 1000;
        this.store.set(key, { value, expiry });
        return 'OK';
    }

    async get(key: string): Promise<string | null> {
        const item = this.store.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.store.delete(key);
            return null;
        }
        return item.value;
    }

    async del(key: string): Promise<number> {
        if (this.store.has(key)) {
            this.store.delete(key);
            return 1;
        }
        return 0;
    }

    async keys(pattern: string): Promise<string[]> {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const now = Date.now();
        const results: string[] = [];
        for (const [key, item] of this.store.entries()) {
            if (now > item.expiry) {
                this.store.delete(key);
                continue;
            }
            if (regex.test(key)) {
                results.push(key);
            }
        }
        return results;
    }

    async flushall(): Promise<'OK'> {
        this.store.clear();
        return 'OK';
    }

    // Expose size for debugging
    get size(): number {
        return this.store.size;
    }
}

export const redis = new RedisMock();
export default redis;
