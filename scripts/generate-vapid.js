const webpush = require('web-push');

try {
    const vapidKeys = webpush.generateVAPIDKeys();
    console.log('=========================================');
    console.log('   GENERATED SECURE VAPID KEYS           ');
    console.log('=========================================');
    console.log('Public Key:');
    console.log(vapidKeys.publicKey);
    console.log('-----------------------------------------');
    console.log('Private Key:');
    console.log(vapidKeys.privateKey);
    console.log('=========================================');
} catch (error) {
    console.error('Error generating VAPID keys. Make sure web-push is installed:', error.message);
}
