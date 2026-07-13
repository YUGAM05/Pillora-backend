const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function runTest() {
    try {
        // A minimal valid 1-page PDF file in base64
        const minPdfBase64 = 
            'JVBERi0xLjEKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA1OTUgODQyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCAyNAo+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDcwIDcwMCBUZCAoSGVsbG8pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTYgMDAwMDAgbCAKMDAwMDAwMDExMSAwMDAwMCBsIAowMDAwMDAwMjEyIDAwMDAwIGwgCnRyYWlsZXIKPDwKL1NpemUgNQovUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMjgzCiUlRU9GCg==';
        
        const dataUri = `data:application/pdf;base64,${minPdfBase64}`;

        console.log('Uploading PDF with resource_type: image...');
        const result = await cloudinary.uploader.upload(dataUri, {
            resource_type: 'image',
            folder: 'test-prescriptions',
            public_id: `test-pdf-${Date.now()}`,
            format: 'pdf'
        });

        console.log('Upload Success! URL:', result.secure_url);
        
        console.log('Testing access to the URL...');
        const res = await axios.get(result.secure_url, { responseType: 'arraybuffer' });
        console.log('Fetch Status:', res.status);
        console.log('Content-Type:', res.headers['content-type']);
        console.log('File size fetched:', res.data.length, 'bytes');

    } catch (error) {
        console.error('Test failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Error headers:', error.response.headers);
            console.error('Error data:', error.response.data.toString());
        } else {
            console.error(error.message);
        }
    }
}

runTest();
