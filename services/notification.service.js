import mongoose from "mongoose";
import Notification from "../models/Notification.js";

// ✅ Create notification for one receiver
export const notifyUser = async ({
  receiverId,
  senderId = null,
  title,
  message,
  type = "general",
  priority = "normal",
  link = "",
  meta = {},
}) => {
  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    throw new Error("Invalid receiverId");
  }

  const notif = await Notification.create({
    receiverId,
    senderId,
    title,
    message,
    type,
    priority,
    link,
    meta,
  });

  return notif;
};

// ✅ Create notifications for multiple receivers (bulk)
export const notifyManyUsers = async ({
  receiverIds = [],
  senderId = null,
  title,
  message,
  type = "general",
  priority = "normal",
  link = "",
  meta = {},
}) => {
  const validIds = receiverIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    throw new Error("No valid receiverIds provided");
  }

  const docs = validIds.map((receiverId) => ({
    receiverId,
    senderId,
    title,
    message,
    type,
    priority,
    link,
    meta,
  }));

  const result = await Notification.insertMany(docs);
  return result;
};
