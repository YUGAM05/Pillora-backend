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
exports.deleteBlog = exports.updateBlogSlug = exports.updateBlog = exports.createBlog = exports.getBlogById = exports.getBlogs = exports.getUniqueSlug = void 0;
exports.generateSlug = generateSlug;
const mongoose_1 = __importDefault(require("mongoose"));
const Blog_1 = __importDefault(require("../models/Blog"));
// Slug Generation Function
function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // remove special chars
        .replace(/\s+/g, '-') // spaces to hyphens
        .replace(/-+/g, '-') // collapse multiple hyphens
        .trim()
        .slice(0, 80); // max 80 characters
}
// Generate Unique Slug Helper
const getUniqueSlug = (slug, currentId) => __awaiter(void 0, void 0, void 0, function* () {
    let uniqueSlug = generateSlug(slug);
    const query = { slug: uniqueSlug };
    if (currentId && mongoose_1.default.Types.ObjectId.isValid(currentId)) {
        query._id = { $ne: currentId };
    }
    let existingBlog = yield Blog_1.default.findOne(query);
    let suffix = 2;
    while (existingBlog) {
        uniqueSlug = `${generateSlug(slug)}-${suffix}`;
        query.slug = uniqueSlug;
        existingBlog = yield Blog_1.default.findOne(query);
        suffix++;
    }
    return uniqueSlug;
});
exports.getUniqueSlug = getUniqueSlug;
// @desc    Get all blogs
// @route   GET /api/blogs
// @access  Public
const getBlogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blogs = yield Blog_1.default.find().sort({ createdAt: -1 });
        res.status(200).json(blogs);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching blogs', error });
    }
});
exports.getBlogs = getBlogs;
// @desc    Get single blog by ID or slug
// @route   GET /api/blogs/:id
// @access  Public
const getBlogById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const param = req.params.id;
        let blog = yield Blog_1.default.findOne({ slug: param });
        if (!blog && mongoose_1.default.Types.ObjectId.isValid(param)) {
            blog = yield Blog_1.default.findById(param);
        }
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json(blog);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching blog', error });
    }
});
exports.getBlogById = getBlogById;
// @desc    Create new blog
// @route   POST /api/blogs
// @access  Private/Admin
const createBlog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, description, content, category, imageUrl, author, authorRole, readTime, slug } = req.body;
        const uniqueSlug = slug ? yield (0, exports.getUniqueSlug)(slug) : yield (0, exports.getUniqueSlug)(title);
        const blog = yield Blog_1.default.create({
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
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating blog', error });
    }
});
exports.createBlog = createBlog;
// @desc    Update blog
// @route   PUT /api/blogs/:id
// @access  Private/Admin
const updateBlog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (req.body.slug) {
            req.body.slug = yield (0, exports.getUniqueSlug)(req.body.slug, id);
        }
        const blog = yield Blog_1.default.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json(blog);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating blog', error });
    }
});
exports.updateBlog = updateBlog;
// @desc    Update blog slug only
// @route   PATCH /api/blogs/:id/slug
// @access  Private/Admin
const updateBlogSlug = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { slug } = req.body;
        if (!slug) {
            return res.status(400).json({ message: 'Slug is required' });
        }
        const uniqueSlug = yield (0, exports.getUniqueSlug)(slug, id);
        const blog = yield Blog_1.default.findByIdAndUpdate(id, { slug: uniqueSlug }, { new: true, runValidators: true });
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json(blog);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating blog slug', error });
    }
});
exports.updateBlogSlug = updateBlogSlug;
// @desc    Delete blog
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
const deleteBlog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blog = yield Blog_1.default.findByIdAndDelete(req.params.id);
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json({ message: 'Blog deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting blog', error });
    }
});
exports.deleteBlog = deleteBlog;
