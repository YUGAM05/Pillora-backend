import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware';
import {
    getBlogs,
    getBlogById,
    createBlog,
    updateBlog,
    deleteBlog,
    updateBlogSlug
} from '../controllers/blogController';

const router = express.Router();

// Public routes
router.get('/', getBlogs);
router.get('/:id', getBlogById);

// Admin only routes
router.post('/', protect, adminOnly, createBlog);
router.put('/:id', protect, adminOnly, updateBlog);
router.patch('/:id/slug', protect, adminOnly, updateBlogSlug);
router.delete('/:id', protect, adminOnly, deleteBlog);

export default router;
