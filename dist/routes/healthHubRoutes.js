"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const healthHubController_1 = require("../controllers/healthHubController");
const router = express_1.default.Router();
router.post('/', healthHubController_1.createHealthTip);
router.get('/', healthHubController_1.getAllHealthTips);
router.get('/:id', healthHubController_1.getHealthTipById);
router.delete('/:id', healthHubController_1.deleteHealthTip);
exports.default = router;
