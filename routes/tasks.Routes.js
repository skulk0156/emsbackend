import express from "express";
import { 
  getTasks, 
  getMyTasks, 
  getTeamMembers, 
  addTask, 
  updateTask, 
  deleteTask, 
  getTaskById, 
  deleteAttachment, 
  updateProgressStatus,
  // Add the new workflow functions
  acceptTask,
  submitTaskForReview,
  reviewTask
} from "../controllers/taskController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import multer from "multer";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ storage: storage });

router.get("/", authMiddleware, getTasks);
router.get("/my-tasks", authMiddleware, getMyTasks);
router.get("/team-members", authMiddleware, getTeamMembers);
router.get("/:id", authMiddleware, getTaskById);
router.post("/", authMiddleware, upload.array('attachments', 5), addTask);
router.post("/add", authMiddleware, upload.array('attachments', 5), addTask);
router.put("/:id", authMiddleware, upload.array('attachments', 5), updateTask);
router.put("/:id/progress", authMiddleware, updateProgressStatus);

// Add the new workflow routes
router.put("/:id/accept", authMiddleware, acceptTask);
router.put("/:id/submit", authMiddleware, submitTaskForReview);
router.put("/:id/review", authMiddleware, reviewTask);

router.delete("/:id", authMiddleware, deleteTask);
router.delete("/:id/attachments/:attachmentId", authMiddleware, deleteAttachment);

export default router;