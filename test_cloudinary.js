const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

cloudinary.api.ping((error, result) => {
    if (error) {
        console.log('❌ Error:', error.message);
    } else {
        console.log('✅ Connected:', result);
    }
});