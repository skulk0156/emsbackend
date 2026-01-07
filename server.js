import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import userRoutes from "./routes/userRoutes.js";
import teamRoutes from './routes/teamRoutes.js';
import dashboardRoute from './routes/dashboardRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import attendanceRouter from './routes/attendanceRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';   
import taskRoutes from './routes/tasks.Routes.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();

// Check if MONGO_URI is defined
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not defined in .env file");
  console.log("Please add MONGO_URI to your .env file with your MongoDB connection string");
  process.exit(1);
}

// Trust proxy for Render
app.set('trust proxy', 1);

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://ems.wordlanetech.com'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-HTTP-Method-Override'],
  exposedHeaders: ['X-Total-Count']
};

// Apply CORS middleware (this handles preflight requests automatically)
app.use(cors(corsOptions));

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies with increased limit for file uploads

// Static files - IMPORTANT for serving profile images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const fs = await import('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.default.existsSync(uploadsDir)) {
  fs.default.mkdirSync(uploadsDir, { recursive: true });
}

// ✅ Mount all user routes
app.use("/api/users", userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/dashboard', dashboardRoute);
app.use('/api/projects', projectRoutes);
app.use('/api/attendance', attendanceRouter);
app.use('/api/leaves', leaveRoutes);
app.use('/api/tasks', taskRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// Test CORS endpoint
app.get('/test-cors', (req, res) => {
  res.json({ 
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      message: 'CORS error: Origin not allowed',
      error: err.message,
      origin: req.headers.origin
    });
  }
  
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Your Database is Connected to your Server ✅");
    
    // Test a simple operation to verify the connection is working
    mongoose.connection.db.listCollections().toArray(function(err, names) {
      if (err) {
        console.error('Error listing collections:', err);
      } else {
        console.log('Collections in database:', names.map(n => n.name));
      }
    });
  })
  .catch((err) => console.error("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS enabled for: https://ems.wordlanetech.com`);
  console.log(`📊 Health check: http://localhost:5000/api/health`);
});