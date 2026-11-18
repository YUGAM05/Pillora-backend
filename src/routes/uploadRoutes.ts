import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import rateLimit from 'express-rate-limit';

const router = Router();

// ✅ Configure Cloudinary
cloudinary.config({
    cloud_name: (process.env.CLOUDINARY_CLOUD_NAME as string),
    api_key: (process.env.CLOUDINARY_API_KEY as string),
    api_secret: (process.env.CLOUDINARY_API_SECRET as string)
});

// ✅ Use memoryStorage — no local disk needed
// Limits: 5 MB, images/PDF only. This route stays public because sign-up
// flows upload KYC documents before an account exists, so it is rate-limited.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPG, PNG, WEBP, GIF or PDF files are allowed'));
    },
});
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many uploads. Please try again later.' },
});

// Wrap multer so size/type errors return 400 instead of a 500
const singleFile = (req: Request, res: Response, next: (err?: any) => void) => {
    upload.single('file')(req, res, (err: any) => {
        if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : err.message });
        next();
    });
};

// Helper function to upload buffer directly to Cloudinary using stream
const uploadStream = (fileBuffer: Buffer, folder: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'auto',
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf']
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );
        stream.write(fileBuffer);
        stream.end();
    });
};

router.post('/', uploadLimiter, singleFile, async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Upload to Cloudinary using stream
        const result = await uploadStream(req.file.buffer, 'pillora-seller');

        // Return the Cloudinary URL
        res.status(200).json({ url: result.secure_url });

    } catch (error: any) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Upload failed' });
    }
});

export default router;