import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { notifyUser, notifyManyUsers } from "../services/notification.service.js";
import User from "../models/User.js"; // if you want broadcast filters by role etc

// ✅ Create Notification (single employee)
export const createNotification = async (req, res) => {
  try {
    const senderId = req.user._id;

    const { receiverId, title, message, type, priority, link, meta } = req.body;

    const notif = await notifyUser({
      receiverId,
      senderId,
      title,
      message,
      type,
      priority,
      link,
      meta,
    });

    // ✅ OPTIONAL Real-time socket emit
    const io = req.app.get("io");
    if (io) io.to(receiverId.toString()).emit("newNotification", notif);

    res.status(201).json({
      success: true,
      message: "Notification created ✅",
      data: notif,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Broadcast to all users
export const broadcastNotification = async (req, res) => {
  try {
    const senderId = req.user._id;

    const { title, message, type, priority, link, meta } = req.body;

    // ✅ fetch all active users
    const users = await User.find({}).select("_id");

    const receiverIds = users.map((u) => u._id);

    const result = await notifyManyUsers({
      receiverIds,
      senderId,
      title,
      message,
      type,
      priority,
      link,
      meta,
    });

    // ✅ socket emit
    const io = req.app.get("io");
    if (io) {
      receiverIds.forEach((id) => {
        io.to(id.toString()).emit("newNotification", {
          title,
          message,
          type,
          priority,
          link,
        });
      });
    }

    res.status(201).json({
      success: true,
      message: "Broadcast sent ✅",
      count: result.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get My Notifications (Pagination + filter)
export const getMyNotifications = async (req, res) => {
  try {
    const receiverId = req.user._id;

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;

    const type = req.query.type; // optional filter
    const isRead = req.query.isRead; // true/false optional

    const query = {
      receiverId,
      isDeleted: false,
    };

    if (type) query.type = type;
    if (isRead === "true") query.isRead = true;
    if (isRead === "false") query.isRead = false;

    const total = await Notification.countDocuments(query);

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Unread Count
export const getUnreadCount = async (req, res) => {
  try {
    const receiverId = req.user._id;

    const count = await Notification.countDocuments({
      receiverId,
      isRead: false,
      isDeleted: false,
    });

    res.status(200).json({ success: true, unread: count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Mark one as read
export const markAsRead = async (req, res) => {
  try {
    const receiverId = req.user._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }

    const notif = await Notification.findOneAndUpdate(
      { _id: id, receiverId, isDeleted: false },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );

    if (!notif) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.status(200).json({
      success: true,
      message: "Marked as read ✅",
      data: notif,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Mark all as read
export const markAllAsRead = async (req, res) => {
  try {
    const receiverId = req.user._id;

    await Notification.updateMany(
      { receiverId, isRead: false, isDeleted: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read ✅",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Soft Delete one
export const deleteNotification = async (req, res) => {
  try {
    const receiverId = req.user._id;
    const { id } = req.params;

    const notif = await Notification.findOneAndUpdate(
      { _id: id, receiverId },
      { $set: { isDeleted: true } },
      { new: true }
    );

    if (!notif) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted ✅",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
