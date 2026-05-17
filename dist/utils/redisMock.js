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
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const events_1 = require("events");
class RedisMock extends events_1.EventEmitter {
    constructor() {
        super();
        this.store = new Map();
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
    set(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            // No expiry by default
            this.store.set(key, { value, expiry: Infinity });
            return 'OK';
        });
    }
    setex(key, seconds, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const expiry = Date.now() + seconds * 1000;
            this.store.set(key, { value, expiry });
            return 'OK';
        });
    }
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = this.store.get(key);
            if (!item)
                return null;
            if (Date.now() > item.expiry) {
                this.store.delete(key);
                return null;
            }
            return item.value;
        });
    }
    del(key) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.store.has(key)) {
                this.store.delete(key);
                return 1;
            }
            return 0;
        });
    }
    keys(pattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            const now = Date.now();
            const results = [];
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
        });
    }
    flushall() {
        return __awaiter(this, void 0, void 0, function* () {
            this.store.clear();
            return 'OK';
        });
    }
    // Expose size for debugging
    get size() {
        return this.store.size;
    }
}
exports.redis = new RedisMock();
exports.default = exports.redis;
