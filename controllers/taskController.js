import Task from "../models/Task.js";
import User from "../models/User.js";
import Team from "../models/Team.js";

// Generate a unique task ID in format YYMMDDXXXXX
const generateTaskId = async () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // YY
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // MM
  const day = now.getDate().toString().padStart(2, '0'); // DD
  const datePrefix = year + month + day;
  
  // Generate 5 random digits
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  const taskId = datePrefix + randomDigits;
  
  // Check if this ID already exists
  const existingTask = await Task.findOne({ taskId });
  if (existingTask) {
    // If it exists, generate a new one
    return generateTaskId();
  }
  
  return taskId;
};

// GET all tasks
export const getTasks = async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;

    let tasks;
    
    // Admin and Manager see all tasks
    if (userRole === "admin" || userRole === "manager") {
      tasks = await Task.find()
        .populate("assignedTo", "name email")
        .populate("team", "team_name")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 });
    } else {
      // Employees only see tasks assigned to them
      tasks = await Task.find({ assignedTo: userId })
        .populate("assignedTo", "name email")
        .populate("team", "team_name")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 });
    }

    res.json(tasks);
  } catch (error) {
    console.error("Get Tasks Error:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

// GET tasks by user
export const getMyTasks = async (req, res) => {
  try {
    const userId = req.user.id;

    const tasks = await Task.find({ assignedTo: userId })
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

// GET team members
export const getTeamMembers = async (req, res) => {
  try {
    const teamMembers = await User.find({ role: { $in: ['employee', 'manager'] } })
      .select("name email _id role");

    res.json(teamMembers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch team members" });
  }
};

// ADD new task
export const addTask = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("Request files:", req.files);
    
    // Generate a unique task ID
    const taskId = await generateTaskId();
    
    // Extract form data
    const {
      title,
      description,
      assignedTo,
      team,
      startDate,
      dueDate,
      estimatedHours,
      priority,
      category,
      progress,
      tags,
      notes,
      notifyAssignee
    } = req.body;
    
    // Create attachments array if files were uploaded
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.path,
        uploadDate: new Date()
      }));
    }
    
    const newTask = new Task({
      taskId,
      title,
      description,
      assignedTo,
      team: team || null,
      startDate: startDate || null,
      dueDate,
      estimatedHours: estimatedHours || null,
      priority: priority || "Medium",
      status: "Not Started", // Always start with Not Started
      category: category || "Development",
      progress: progress || 0,
      tags: tags || "",
      notes: notes || "",
      attachments,
      notifyAssignee: notifyAssignee === 'true' || notifyAssignee === true,
      createdBy: req.user.id,
      progressStatus: "Not Started" // Initialize with Not Started
    });

    await newTask.save();
    
    const populatedTask = await Task.findById(newTask._id)
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email");

    res.json({ message: "Task created successfully", task: populatedTask });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
};

// UPDATE task with attachments
export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Handle FormData if files are being uploaded
    let updateData = {};
    
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      console.log("Processing FormData update");
      
      // Extract form data
      const fields = ['title', 'description', 'assignedTo', 'team', 'startDate', 'dueDate', 
                      'estimatedHours', 'priority', 'status', 'category', 'progress', 
                      'tags', 'notes', 'notifyAssignee'];
      
      fields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });
      
      // Handle existing attachments
      if (req.body.existingAttachments) {
        try {
          const existingAttachmentIds = JSON.parse(req.body.existingAttachments);
          updateData.$push = { attachments: existingAttachmentIds };
        } catch (err) {
          console.error("Error parsing existing attachments:", err);
        }
      }
      
      // Add new attachments if any
      if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(file => ({
          filename: file.originalname,
          path: file.path,
          uploadDate: new Date()
        }));
        
        if (updateData.$push && updateData.$push.attachments) {
          updateData.$push.attachments.push(...newAttachments);
        } else {
          updateData.$push = { attachments: newAttachments };
        }
      }
    } else {
      // Regular JSON update
      updateData = req.body;
    }
    
    console.log("Update data:", updateData);
    
    const updatedTask = await Task.findByIdAndUpdate(id, updateData, { new: true })
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email");

    if (!updatedTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ message: "Task updated successfully", task: updatedTask });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE task
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedTask = await Task.findByIdAndDelete(id);

    if (!deletedTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete task" });
  }
};

// GET single task by ID
export const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await Task.findById(id)
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email");

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
};

// DELETE attachment from task
export const deleteAttachment = async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    // Remove attachment from task
    task.attachments = task.attachments.filter(att => att._id.toString() !== attachmentId);
    await task.save();
    
    res.json({ message: "Attachment deleted successfully" });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
};

// ===== NEW WORKFLOW FUNCTIONS =====

// Employee accepts a task: "Not Started" or "Reverted" -> "Pending"
export const acceptTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (userRole !== "employee" || task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({ error: "You can only accept your own assigned tasks" });
    }

    // Allow accepting if status is "Not Started" OR "Reverted"
    if (task.status !== "Not Started" && task.status !== "Reverted") {
      return res.status(400).json({ error: "Task can only be accepted if its status is 'Not Started' or 'Reverted'" });
    }

    task.status = "Pending";
    task.progressStatus = "Pending";
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email");

    res.json({ message: "Task accepted. Status is now Pending.", task: populatedTask });
  } catch (error) {
    console.error("Error accepting task:", error);
    res.status(500).json({ error: "Failed to accept task" });
  }
};

// Employee submits work for review: "Pending" -> "In Review"
export const submitTaskForReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (userRole !== "employee" || task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({ error: "You can only submit your own assigned tasks" });
    }

    if (task.status !== "Pending") {
      return res.status(400).json({ error: "Task can only be submitted if its status is 'Pending'" });
    }

    task.status = "In Review";
    task.progressStatus = "In Review";
    await task.save();
    
    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email");

    res.json({ message: "Task submitted for review. Status is now 'In Review'.", task: populatedTask });
  } catch (error) {
    console.error("Error submitting task:", error);
    res.status(500).json({ error: "Failed to submit task" });
  }
};

// Admin/Manager reviews a task: "In Review" -> "Completed" or "Reverted"
export const reviewTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'revert'
    const userRole = req.user.role?.toLowerCase();

    if (!["admin", "manager"].includes(userRole)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!["approve", "revert"].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Must be 'approve' or 'revert'." });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (task.status !== "In Review") {
      return res.status(400).json({ error: "Task can only be reviewed if its status is 'In Review'" });
    }

    if (action === "approve") {
      task.status = "Completed";
      task.progressStatus = "Completed";
    } else if (action === "revert") {
      task.status = "Reverted";
      task.progressStatus = "Reverted";
    }

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email");

    res.json({ 
      message: `Task ${action}d successfully. Status is now '${task.status}'.`, 
      task: populatedTask 
    });
  } catch (error) {
    console.error("Error reviewing task:", error);
    res.status(500).json({ error: "Failed to review task" });
  }
};

// You can keep the old updateProgressStatus function for backward compatibility
// but it's recommended to use the new specific functions instead
export const updateProgressStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { progressStatus } = req.body;
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;

    // Validate progressStatus
    if (!["Not Started", "Pending", "In Review", "Completed", "Reverted"].includes(progressStatus)) {
      return res.status(400).json({ error: "Invalid progress status" });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Employee can only mark their own tasks as Pending or In Review
    if (userRole === "employee") {
      if (task.assignedTo.toString() !== userId.toString()) {
        return res.status(403).json({ error: "You can only update your own tasks" });
      }
      if (progressStatus === "Completed") {
        return res.status(403).json({ error: "Only admin/manager can mark tasks as completed" });
      }
      if (progressStatus === "Not Started" && task.status !== "Pending" && task.status !== "Reverted") {
        return res.status(403).json({ error: "Cannot revert to Not Started" });
      }
      // Employee can set to Pending or In Review
      task.progressStatus = progressStatus;
      task.status = progressStatus; // Keep status in sync with progressStatus
    } 
    // Admin and Manager can mark any task as Not Started or Completed
    else if (userRole === "admin" || userRole === "manager") {
      if (progressStatus === "Pending") {
        return res.status(400).json({ error: "Admin/Manager cannot set status to Pending" });
      }
      if (progressStatus === "In Review") {
        return res.status(400).json({ error: "Admin/Manager cannot set status to In Review" });
      }
      // Admin/Manager can set to Not Started or Completed
      task.progressStatus = progressStatus;
      task.status = progressStatus; // Keep status in sync with progressStatus
    } else {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("team", "team_name")
      .populate("createdBy", "name email");

    res.json({ message: "Progress status updated successfully", task: populatedTask });
  } catch (error) {
    console.error("Error updating progress status:", error);
    res.status(500).json({ error: "Failed to update progress status" });
  }
};