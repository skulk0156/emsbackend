import Notification from "../models/Notification.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Team from "../models/Team.js";

/* ================================
  ✅ Helper: Send Notification (DB + Socket)
================================ */
const sendNotification = async ({
  receiverIds,
  senderId,
  title,
  message,
  type = "general",
  priority = "normal",
  link = "/tasks",
  io,
}) => {
  // Ensure receiverIds is an array
  const targets = Array.isArray(receiverIds) ? receiverIds : [receiverIds];

  targets.forEach(async (id) => {
    if (!id) return;
    
    try {
      // 1. Save to DB
      const notif = await Notification.create({
        receiverId: id,
        senderId: senderId,
        title,
        message,
        type,
        priority,
        link,
      });

      // 2. Emit Real-time via Socket
      if (io) {
        io.to(id.toString()).emit("newNotification", notif);
      }
    } catch (err) {
      console.error("Notification Error:", err);
    }
  });
};

/* ================================
  ✅ Helper: Generate Unique Task ID
================================ */
const generateTaskId = async () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");

  const datePrefix = year + month + day;

  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  const taskId = parseInt(datePrefix + randomDigits);

  const existingTask = await Task.findOne({ taskId });
  if (existingTask) return generateTaskId();

  return taskId;
};

/* ================================
  ✅ GET TASKS (Role Based)
================================ */
export const getTasks = async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;

    const {
      status,
      priority,
      assignedTo,
      team,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    let filter = {};
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (team) filter.team = team;

    let tasks;

    if (userRole === "admin") {
      filter.createdBy = userId;
      tasks = await Task.find(filter)
        .populate("assignedTo", "name email employeeId")
        .populate("team", "team_name")
        .populate("createdBy", "name email")
        .populate("reviewers", "name email")
        .sort(sortOptions);
    } else if (userRole === "manager") {
      const managedTeams = await Team.find({ team_leader: userId }).select("_id");
      const managedTeamIds = managedTeams.map((t) => t._id);

      tasks = await Task.find({
        $or: [{ createdBy: userId }, { team: { $in: managedTeamIds } }],
        ...(Object.keys(filter).length > 0 && { $and: [filter] }),
      })
        .populate("assignedTo", "name email employeeId")
        .populate("team", "team_name")
        .populate("createdBy", "name email")
        .populate("reviewers", "name email")
        .sort(sortOptions);
    } else {
      filter.assignedTo = { $in: [userId] };
      tasks = await Task.find(filter)
        .populate("assignedTo", "name email employeeId")
        .populate("team", "team_name")
        .populate("createdBy", "name email")
        .populate("reviewers", "name email")
        .sort(sortOptions);
    }

    res.status(200).json(tasks);
  } catch (error) {
    console.error("Get Tasks Error:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

/* ================================
  ✅ GET MY TASKS
================================ */
export const getMyTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, priority, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    let filter = { assignedTo: { $in: [userId] } };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const tasks = await Task.find(filter)
      .populate("assignedTo", "name email employeeId")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .populate("reviewers", "name email")
      .sort(sortOptions);

    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch your tasks" });
  }
};

/* ================================
  ✅ GET TASK BY ID
================================ */
export const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id)
      .populate("assignedTo", "name email employeeId")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .populate("reviewers", "name email");

    if (!task) return res.status(404).json({ error: "Task not found" });

    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;

    const isCreator = task.createdBy?._id?.toString() === userId;
    const isAssignee = task.assignedTo?.some((a) => a._id.toString() === userId);
    const isReviewer = task.reviewers?.some((r) => r._id.toString() === userId);

    if (userRole === "employee" && !isAssignee) {
      return res.status(403).json({ error: "Not authorized to view this task" });
    }

    if ((userRole === "manager" || userRole === "admin") && !isCreator && !isReviewer) {
      return res.status(403).json({ error: "Not authorized to view this task" });
    }

    res.status(200).json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
};

/* ================================
  ✅ ADD TASK (Admin/Manager)
================================ */
/* ================================
  ✅ ADD TASK (Admin/Manager) with Admin Notification
================================ */
export const addTask = async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    if (!["admin", "manager"].includes(userRole)) {
      return res.status(403).json({ error: "Not authorized to create tasks" });
    }

    const taskId = await generateTaskId();
    const io = req.app.get("io");

    const {
      title,
      description,
      assignedTo,
      team,
      dueDate,
      estimatedHours,
      priority,
      category,
      tags,
      notes,
      notifyAssignee,
      additionalReviewers,
    } = req.body;

    // ... (Previous parsing logic remains same) ...
    let parsedAssignedTo = assignedTo;
    if (typeof assignedTo === "string") {
      try {
        parsedAssignedTo = JSON.parse(assignedTo);
      } catch (e) {
        return res.status(400).json({ error: "Invalid assignedTo format" });
      }
    }

    if (!Array.isArray(parsedAssignedTo) || parsedAssignedTo.length === 0) {
      return res.status(400).json({ error: "At least one employee must be assigned" });
    }

    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map((file) => ({
        filename: file.originalname,
        path: file.path,
      }));
    }

    let reviewers = [req.user.id];
    if (additionalReviewers) {
      const additional = Array.isArray(additionalReviewers)
        ? additionalReviewers
        : [additionalReviewers];
      reviewers.push(...additional.filter((id) => id !== req.user.id));
    }

    // Save Task
    const newTask = new Task({
      taskId,
      title,
      description,
      assignedTo: parsedAssignedTo,
      team,
      dueDate,
      estimatedHours,
      priority,
      category,
      tags,
      notes,
      attachments,
      notifyAssignee,
      createdBy: req.user.id,
      reviewers,
    });

    const savedTask = await newTask.save();

    // ✅ 1. Notify Assigned Employees
    if (notifyAssignee === true || notifyAssignee === "true") {
      await sendNotification({
        receiverIds: parsedAssignedTo,
        senderId: req.user.id,
        title: "New Task Assigned 🎯",
        message: `You have been assigned a new task: ${title}`,
        type: "general",
        io,
      });
    }

    // ✅ 2. Notify ALL ADMINS (Oversight)
    try {
      const admins = await User.find({ role: "admin" }).select("_id");
      const adminIds = admins.map((admin) => admin._id);

      // Don't notify yourself if you are an admin creating the task
      const adminTargets = adminIds.filter((id) => id.toString() !== req.user.id.toString());

      if (adminTargets.length > 0) {
        await sendNotification({
          receiverIds: adminTargets,
          senderId: req.user.id,
          title: "New Task Created in System 📝",
          message: `A new task "${title}" was created by ${req.user.name}.`,
          type: "general",
          priority: "normal",
          link: "/tasks",
          io,
        });
      }
    } catch (err) {
      console.error("Error notifying admins:", err);
    }

    const populatedTask = await Task.findById(savedTask._id)
      .populate("assignedTo", "name email employeeId")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .populate("reviewers", "name email");

    res.status(201).json({
      message: "Task created successfully ✅",
      task: populatedTask,
    });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: error.message || "Failed to create task" });
  }
};
/* ================================
  ✅ UPDATE TASK
================================ */
export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: "You are not authorized to edit this task" });
    }

    const updateData = { ...req.body };
    delete updateData.attachments;

    if (updateData.assignedTo && typeof updateData.assignedTo === "string") {
      try {
        updateData.assignedTo = JSON.parse(updateData.assignedTo);
      } catch (e) {
        return res.status(400).json({ error: "Invalid assignedTo format" });
      }
    }

    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map((file) => ({
        filename: file.originalname,
        path: file.path,
      }));
      updateData.attachments = [...(task.attachments || []), ...newAttachments];
    }

    if (req.body.attachments === "[]") {
      updateData.attachments = [];
    }

    const updatedTask = await Task.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", "name email employeeId")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .populate("reviewers", "name email");

    // ✅ Notify Assignees about the update
    const io = req.app.get("io");
    if (io) {
      await sendNotification({
        receiverIds: updatedTask.assignedTo,
        senderId: req.user.id,
        title: "Task Updated 📝",
        message: `Task "${updatedTask.title}" details have been updated.`,
        type: "general",
        io,
      });
    }

    res.status(200).json({ message: "Task updated successfully ✅", task: updatedTask });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: error.message || "Failed to update task" });
  }
};

/* ================================
  ✅ DELETE TASK
================================ */
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: "You are not authorized to delete this task" });
    }

    await Task.findByIdAndDelete(id);

    // ✅ Notify Assignees that task is deleted
    const io = req.app.get("io");
    if (io) {
      await sendNotification({
        receiverIds: task.assignedTo,
        senderId: req.user.id,
        title: "Task Deleted 🗑️",
        message: `Task "${task.title}" has been deleted by Admin.`,
        type: "general",
        priority: "high",
        io,
      });
    }

    res.status(200).json({ message: "Task deleted successfully ✅" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete task" });
  }
};

/* ================================
  ✅ WORKFLOW ACTIONS
================================ */

// --- Accept Task ---
export const acceptTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const task = await Task.findById(id);

    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.assignedTo.some((assignee) => assignee.toString() === userId)) {
      return res.status(403).json({ error: "You can only accept your assigned tasks" });
    }
    if (!["Not Started", "Reverted"].includes(task.status)) {
      return res.status(400).json({ error: "Task cannot be accepted in its current status" });
    }

    task.progressStatus = "Pending";
    task.status = "In Progress";
    await task.save();

    // ✅ Notify Creator and Reviewers
    const io = req.app.get("io");
    const receivers = [task.createdBy, ...task.reviewers];
    
    await sendNotification({
      receiverIds: receivers,
      senderId: userId,
      title: "Task Started 🚀",
      message: `${req.user.name} has started working on task: ${task.title}`,
      type: "general",
      io,
    });

    res.status(200).json({ message: "Task accepted. Status is now 'In Progress'.", task });
  } catch (error) {
    res.status(500).json({ error: "Failed to accept task" });
  }
};

// --- Submit for Review ---
export const submitTaskForReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const task = await Task.findById(id);

    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.assignedTo.some((assignee) => assignee.toString() === userId)) {
      return res.status(403).json({ error: "You can only submit your assigned tasks" });
    }
    if (task.status !== "In Progress") {
      return res.status(400).json({ error: "Task must be 'In Progress' before submission" });
    }

    task.progressStatus = "In Review";
    task.status = "In Review";
    await task.save();

    // ✅ Notify Creator and Reviewers
    const io = req.app.get("io");
    const receivers = [task.createdBy, ...task.reviewers];

    await sendNotification({
      receiverIds: receivers,
      senderId: userId,
      title: "Task Submitted for Review 📤",
      message: `${req.user.name} submitted task "${task.title}" for review.`,
      type: "general",
      priority: "high",
      io,
    });

    res.status(200).json({ message: "Task submitted for review.", task });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit task" });
  }
};

// --- Review Task (Approve/Revert) ---
export const reviewTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body; // action: 'approve' or 'revert'
    const userId = req.user.id;
    const userRole = req.user.role?.toLowerCase();

    if (!["admin", "manager"].includes(userRole)) {
      return res.status(403).json({ error: "Not authorized to review tasks" });
    }

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status !== "In Review") {
      return res.status(400).json({ error: "Task is not currently 'In Review'" });
    }

    const isCreator = task.createdBy.toString() === userId;
    const isReviewer = task.reviewers.some((r) => r.toString() === userId);
    if (!isCreator && !isReviewer) {
      return res.status(403).json({ error: "You are not authorized to review this task" });
    }

    const io = req.app.get("io");

    if (action === "approve") {
      task.progressStatus = "Completed";
      task.status = "Completed";

      // ✅ Notify Assignees
      await sendNotification({
        receiverIds: task.assignedTo,
        senderId: userId,
        title: "Task Approved ✅",
        message: `Great work! Your task "${task.title}" was approved.`,
        type: "general",
        io,
      });

    } else if (action === "revert") {
      task.progressStatus = "Reverted";
      task.status = "Reverted";
      if (comment)
        task.notes =
          (task.notes ? task.notes + "\n\n" : "") +
          `Reverted by ${req.user.name}: ${comment}`;

      // ✅ Notify Assignees
      await sendNotification({
        receiverIds: task.assignedTo,
        senderId: userId,
        title: "Task Reverted 🔄",
        message: `Your task "${task.title}" has been reverted. Please check comments.`,
        type: "general",
        priority: "high",
        io,
      });

    } else {
      return res.status(400).json({ error: "Invalid review action" });
    }

    await task.save();
    res.status(200).json({ message: `Task ${action}d.`, task });
  } catch (error) {
    res.status(500).json({ error: "Failed to review task" });
  }
};

/* ================================
  ✅ GET TEAM MEMBERS
================================ */
export const getTeamMembers = async (req, res) => {
  try {
    const members = await User.find({ isActive: true })
      .select("name email _id role employeeId")
      .sort({ name: 1 });

    res.status(200).json(members);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch team members" });
  }
};