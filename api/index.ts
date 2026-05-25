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

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://pillora.in',
    'https://pillora-hospital.vercel.app',
    'https://apex-backend-theta.vercel.app'
  ];

  app.use(cors({
    origin: function(origin: any, callback: any) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
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
