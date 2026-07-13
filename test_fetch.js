const axios = require('axios');

async function testFetch() {
    try {
        const url = 'https://res.cloudinary.com/djlttfqje/raw/upload/v1783659485/pillora-prescriptions/prescription-6a3c16b98d5c20fe6ad86ea3-c42d41f2c0b326956f7e91da79ddfed6.pdf';
        console.log('Fetching', url);
        const res = await axios.get(url, { responseType: 'text' });
        console.log('Status:', res.status);
        console.log('Content-Type:', res.headers['content-type']);
        console.log('First 200 characters of content:');
        console.log(res.data.substring(0, 200));
    } catch (err) {
        console.error('Fetch failed:');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Headers:', err.response.headers);
            console.error('Data:', err.response.data);
        } else {
            console.error(err.message);
        }
    }
}

testFetch();
