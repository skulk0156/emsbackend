import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // ✅ Receiver
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // change to "Employee" if you use Employee model
      required: true,
      index: true,
    },

    // ✅ Who triggered it (admin/system)
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    type: {
      type: String,
      enum: ["leave", "attendance", "salary", "general", "announcement", "system"],
      default: "general",
      index: true,
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true,
    },

    // ✅ UI redirect link
    link: {
      type: String,
      default: "",
    },

    // ✅ Read tracking
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    // ✅ Extra data for frontend
    meta: {
      type: Object,
      default: {},
    },

    // ✅ Soft delete optional
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
