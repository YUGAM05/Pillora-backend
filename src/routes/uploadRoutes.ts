import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { protect, AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// ✅ Configure Cloudinary
// TODO(owner): set CLOUDINARY_* on Vercel, rotate the secret, then remove these fallbacks.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djlttfqje',
    api_key: process.env.CLOUDINARY_API_KEY || '372769319742221',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'JZ88aoet4iKXegIT19PKqDoL2nU'
});

// Who uploads here (audit P-16 / ADM-13):
//  - logged-in patients: blood request ID document (image) on pillora.in/blood-bank
//  - admin: hospital photos (AddHospitalForm), Health Hub images and videos
// Login is required. Images and PDFs for every logged-in user; videos for admins only.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (Vercel also caps request bodies at ~4.5 MB)
const IMAGE_PDF_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        const isAdmin = (req as AuthRequest).user?.role === 'admin';
        if (IMAGE_PDF_MIME.includes(file.mimetype) || (isAdmin && VIDEO_MIME.includes(file.mimetype))) {
            cb(null, true);
        } else {
            cb(new Error(isAdmin
                ? 'Only JPG, PNG, WEBP, GIF, PDF, MP4, WEBM or MOV files are allowed'
                : 'Only JPG, PNG, WEBP, GIF or PDF files are allowed'));
        }
    },
});

// Wrap multer so size/type errors return 400 instead of a 500
const singleFile = (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
        if (err) {
            res.status(400).json({
                message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message,
            });
            return;
        }
        next();
    });
};

// Helper function to upload buffer directly to Cloudinary using stream
const uploadStream = (fileBuffer: Buffer, folder: string, isVideo: boolean): Promise<any> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: isVideo ? 'video' : 'image',
                allowed_formats: isVideo
                    ? ['mp4', 'webm', 'mov']
                    : ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'],
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

router.post('/', protect, singleFile, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const isVideo = VIDEO_MIME.includes(req.file.mimetype);
        // Upload to Cloudinary using stream
        const result = await uploadStream(req.file.buffer, 'pillora-seller', isVideo);

        // Return the Cloudinary URL
        res.status(200).json({ url: result.secure_url });

    } catch (error: any) {
        console.error('Upload error:', error?.message || error);
        res.status(500).json({ message: 'Upload failed' });
    }
});

export default router;
