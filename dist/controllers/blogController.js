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
exports.deleteBlog = exports.updateBlog = exports.createBlog = exports.getBlogById = exports.getBlogs = void 0;
const Blog_1 = __importDefault(require("../models/Blog"));
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
// @desc    Get single blog by ID
// @route   GET /api/blogs/:id
// @access  Public
const getBlogById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blog = yield Blog_1.default.findById(req.params.id);
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
        const { title, description, content, category, imageUrl, author, authorRole, readTime } = req.body;
        const blog = yield Blog_1.default.create({
            title,
            description,
            content,
            category,
            imageUrl,
            author,
            authorRole,
            readTime
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
        const blog = yield Blog_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
