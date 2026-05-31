try {
  require('dotenv').config();
  console.log('=== BOOT START ===');

  const express = require('express');
  const mongoose = require('mongoose');
  const cors = require('cors');

  console.log('=== MODULES LOADED ===');

  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const isOriginAllowed = (origin: string): boolean => {
    if (!origin) return true;
    const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    const isVercel = origin.endsWith('.vercel.app');
    const isPillora = origin.includes('pillora.in') ||
                      origin.includes('pillora-admin') ||
                      origin.includes('pillora-hospital') ||
                      origin.includes('pillora-seller') ||
                      origin.includes('pillorahospital.in');
    return isLocal || isVercel || isPillora;
  };

  app.use(cors({
    origin: function(origin: any, callback: any) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
  }));

  // Handle preflight OPTIONS requests explicitly using *splat wildcard
  app.options('*splat', cors());

  console.log('=== MIDDLEWARE SET ===');

  // Verify and require the main app containing all routes and controller bindings
  const mainApp = require('../src/app').default || require('../src/app');
  app.use(mainApp);

  console.log('=== ROUTES SET ===');

  // Add health check route
  app.get('/health', (req: any, res: any) => {
    res.status(200).json({ status: 'ok', message: 'Server is running' });
  });

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (mongoUri) {
    mongoose.connect(mongoUri, { dbName: 'e-pharmacy' })
      .then(() => console.log('=== DB CONNECTED to database:', mongoose.connection.name, '==='))
      .catch((err: any) => console.error('=== DB FAILED ===', err.message));
  } else {
    console.error('=== DB FAILED === MONGO_URI/MONGODB_URI environment variable is missing');
  }

  module.exports = app;

} catch (fatalError: any) {
  console.error('=== FATAL BOOT ERROR ===', fatalError.message);
  console.error(fatalError.stack);
}
