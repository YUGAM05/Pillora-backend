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
exports.logActivity = void 0;
const PlatformActivity_1 = __importDefault(require("../models/PlatformActivity"));
const logActivity = (io, data) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const activity = yield PlatformActivity_1.default.create(Object.assign(Object.assign({}, data), { timestamp: new Date() }));
        if (io) {
            io.emit('platform_activity', activity);
            console.log(`[ActivityBroadcast] Emitted: ${data.title}`);
        }
        return activity;
    }
    catch (error) {
        console.error('Error logging activity:', error);
    }
});
exports.logActivity = logActivity;
