import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Blog from '../models/Blog';

// Slug Generation Function
export function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')   // remove special chars
        .replace(/\s+/g, '-')       // spaces to hyphens
        .replace(/-+/g, '-')        // collapse multiple hyphens
        .trim()
        .slice(0, 80);              // max 80 characters
}

// Generate Unique Slug Helper
export const getUniqueSlug = async (slug: string, currentId?: string): Promise<string> => {
    let uniqueSlug = generateSlug(slug);
    const query: any = { slug: uniqueSlug };
    if (currentId && mongoose.Types.ObjectId.isValid(currentId)) {
        query._id = { $ne: currentId };
    }
    let existingBlog = await Blog.findOne(query);
    let suffix = 2;
    while (existingBlog) {
        uniqueSlug = `${generateSlug(slug)}-${suffix}`;
        query.slug = uniqueSlug;
        existingBlog = await Blog.findOne(query);
        suffix++;
    }
    return uniqueSlug;
};

// @desc    Get all blogs
// @route   GET /api/blogs
// @access  Public
export const getBlogs = async (req: Request, res: Response) => {
    try {
        const blogs = await Blog.find().sort({ createdAt: -1 });
        res.status(200).json(blogs);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching blogs', error });
    }
};

// @desc    Get single blog by ID or slug
// @route   GET /api/blogs/:id
// @access  Public
export const getBlogById = async (req: Request, res: Response) => {
    try {
        const param = req.params.id;
        let blog = await Blog.findOne({ slug: param });
        if (!blog && mongoose.Types.ObjectId.isValid(param)) {
            blog = await Blog.findById(param);
        }
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching blog', error });
    }
};

// @desc    Create new blog
// @route   POST /api/blogs
// @access  Private/Admin
export const createBlog = async (req: Request, res: Response) => {
    try {
        const { title, description, content, category, imageUrl, author, authorRole, readTime, slug } = req.body;

        const uniqueSlug = slug ? await getUniqueSlug(slug) : await getUniqueSlug(title);

        const blog = await Blog.create({
            title,
            description,
            content,
            category,
            imageUrl,
            author,
            authorRole,
            readTime,
            slug: uniqueSlug
        });

        res.status(201).json(blog);
    } catch (error) {
        res.status(500).json({ message: 'Error creating blog', error });
    }
};

// @desc    Update blog
// @route   PUT /api/blogs/:id
// @access  Private/Admin
export const updateBlog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (req.body.slug) {
            req.body.slug = await getUniqueSlug(req.body.slug, id);
        }

        const blog = await Blog.findByIdAndUpdate(
            id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: 'Error updating blog', error });
    }
};

// @desc    Update blog slug only
// @route   PATCH /api/blogs/:id/slug
// @access  Private/Admin
export const updateBlogSlug = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { slug } = req.body;

        if (!slug) {
            return res.status(400).json({ message: 'Slug is required' });
        }

        const uniqueSlug = await getUniqueSlug(slug, id);

        const blog = await Blog.findByIdAndUpdate(
            id,
            { slug: uniqueSlug },
            { new: true, runValidators: true }
        );

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: 'Error updating blog slug', error });
    }
};

// @desc    Delete blog
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
export const deleteBlog = async (req: Request, res: Response) => {
    try {
        const blog = await Blog.findByIdAndDelete(req.params.id);
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json({ message: 'Blog deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting blog', error });
    }
};
