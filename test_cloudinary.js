const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test 1 - Connection
cloudinary.api.ping((error, result) => {
    if (error) {
        console.log('❌ Connection Error:', error.message);
    } else {
        console.log('✅ Connected:', result.status);
    }
});

// Test 2 - Actual Upload
const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

cloudinary.uploader.upload(testImage, { folder: 'test' }, (error, result) => {
    if (error) {
        console.log('❌ Upload Error:', error.message);
        console.log('Details:', JSON.stringify(error, null, 2));
    } else {
        console.log('✅ Upload Success! URL:', result.secure_url);
    }
});