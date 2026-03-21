const Tesseract = require('tesseract.js');
const path = require('path');

async function testOCR() {
    try {
        const imagePath = path.join(__dirname, 'uploads', '1c64232668f65d310c4ad12524a9076b');
        console.log('Testing OCR on:', imagePath);
        const result = await Tesseract.recognize(imagePath, 'eng');
        console.log('OCR Result length:', result.data.text.length);
        console.log('OCR Preview:', result.data.text.substring(0, 100));
        process.exit(0);
    } catch (error) {
        console.error('OCR Error:', error);
        process.exit(1);
    }
}

testOCR();
