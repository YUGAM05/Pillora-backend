"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const blogController_1 = require("../controllers/blogController");
const router = express_1.default.Router();
// Public routes
router.get('/', blogController_1.getBlogs);
router.get('/:id', blogController_1.getBlogById);
// Admin only routes
router.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, blogController_1.createBlog);
router.put('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, blogController_1.updateBlog);
router.delete('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, blogController_1.deleteBlog);
exports.default = router;
