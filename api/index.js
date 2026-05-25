require('dotenv').config(); // MUST BE FIRST LINE
const express = require('express');
const cors = require('cors');

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://pillora.in',
  'https://pillora-hospital.vercel.app',
  'https://apex-backend-theta.vercel.app'
];

app.use(cors({
  origin: function(origin, callback) {
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

// Handle preflight OPTIONS requests explicitly
app.options('*splat', cors());

// Add a health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Import and use main app
let mainApp;
try {
  // Use try-catch for importing the main app to prevent startup crashes
  mainApp = require('../src/app').default || require('../src/app');
} catch (err) {
  console.error('CRITICAL BOOT ERROR loading main app:', err.message);
  // Fallback handler if main app crashes
  app.use((req, res) => {
    res.status(500).json({
      message: 'CRITICAL BOOT ERROR',
      error: err.message,
      stack: err.stack
    });
  });
}

if (mainApp) {
  app.use(mainApp);
}

module.exports = app;
