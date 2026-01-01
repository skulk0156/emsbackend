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

// imported by me taskroutes
import taskRoutes from './routes/tasks.Routes.js'

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000' , 'https://ems.wordlanetech.com/'], // Add your frontend URLs
  credentials: true
}));
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

//added by me to use this routes.
app.use('/api/tasks', taskRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// FIXED: 404 handler - removed the problematic '*'
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
app.listen(PORT, () => console.log(`🚀 Server running on port http://localhost:${PORT} Congratulations`));