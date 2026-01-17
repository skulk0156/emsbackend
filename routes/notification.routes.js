import express from "express";
import protect from "../middleware/authMiddleware.js"; // ✅ your path

import { authorizeRoles } from "../middleware/authMiddleware.js";

import {
  createNotification,
  broadcastNotification,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../controllers/notification.controller.js";

const router = express.Router();

// ✅ create one (admin only)
router.post("/create", protect, authorizeRoles("admin"), createNotification);

// ✅ broadcast (admin only)
router.post("/broadcast", protect, authorizeRoles("admin"), broadcastNotification);

// ✅ get my notifications
router.get("/my", protect, getMyNotifications);

// ✅ unread count
router.get("/unread-count", protect, getUnreadCount);

// ✅ mark read
router.put("/read/:id", protect, markAsRead);

// ✅ mark all read
router.put("/read-all", protect, markAllAsRead);

// ✅ delete notification
router.delete("/:id", protect, deleteNotification);

export default router;
