import express from "express";
import { 
  getTasks, 
  getMyTasks, 
  getTaskById,
  addTask, 
  updateTask, 
  deleteTask, 
  acceptTask,
  submitTaskForReview,
  reviewTask,
  getTeamMembers
} from "../controllers/taskController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import multer from "multer";

const router = express.Router();

// Configure Multer for file uploads
const upload = multer({
  dest: 'uploads/', // Save files to the 'uploads' directory
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit file size to 5MB
  },
  fileFilter: (req, file, cb) => {
    // Optional: Add file type filter if needed
    cb(null, true);
  }
});

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Main CRUD and filtering routes
router.route("/")
  .get(getTasks)
  .post(upload.array('attachments', 5), addTask); // Allow up to 5 attachments

router.get("/my-tasks", getMyTasks);
router.get("/team-members", getTeamMembers);

// Routes for a specific task by ID
router.route("/:id")
  .get(getTaskById)
  .put(upload.array('attachments', 5), updateTask) // Allow attachments on update
  .delete(deleteTask);

// Workflow-specific routes
router.put("/:id/accept", acceptTask);
router.put("/:id/submit", submitTaskForReview);
router.put("/:id/review", reviewTask);

export default router;