import Task from "../models/Task.js";
import User from "../models/User.js";
import Team from "../models/Team.js";

// Helper function to generate a unique task ID in format YYMMDDXXXXX
const generateTaskId = async () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // YY
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // MM
  const day = now.getDate().toString().padStart(2, '0'); // DD
  const datePrefix = year + month + day;
  
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  const taskId = parseInt(datePrefix + randomDigits);
  
  const existingTask = await Task.findOne({ taskId });
  if (existingTask) {
    return generateTaskId(); // Recurse if a collision occurs
  }
  
  return taskId;
};

// @desc    Get all tasks (with role-based filtering)
// @route   GET /api/tasks
// @access  Private
export const getTasks = async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;
    const { status, priority, assignedTo, team, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    let filter = {};
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Apply filters from query params
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (team) filter.team = team;

    let tasks;
    
    if (userRole === "admin") {
      // Admins see all tasks they created
      filter.createdBy = userId;
      tasks = await Task.find(filter)
        .populate("assignedTo", "name email employeeId")
        .populate("team", "team_name")
        .populate("createdBy", "name email")
        .populate("reviewers", "name email")
        .sort(sortOptions);
    } 
    else if (userRole === "manager") {
      // Managers see tasks they created OR tasks assigned to their teams
      const managedTeams = await Team.find({ team_leader: userId }).select('_id');
      const managedTeamIds = managedTeams.map(team => team._id);
      
      tasks = await Task.find({
        $or: [
          { createdBy: userId },
          { team: { $in: managedTeamIds } }
        ],
        ...Object.keys(filter).length > 0 && { $and: [filter] } // Apply other filters
      })
        .populate("assignedTo", "name email employeeId")
        .populate("team", "team_name")
        .populate("createdBy", "name email")
        .populate("reviewers", "name email")
        .sort(sortOptions);
    } 
    else {
      // Employees only see tasks assigned to them
      filter.assignedTo = userId;
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

// @desc    Get tasks assigned to the current user
// @route   GET /api/tasks/my-tasks
// @access  Private
export const getMyTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, priority, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    let filter = { assignedTo: userId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

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

// @desc    Get a single task by ID
// @route   GET /api/tasks/:id
// @access  Private
export const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await Task.findById(id)
      .populate("assignedTo", "name email employeeId")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .populate("reviewers", "name email");

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user.id;
    const isCreator = task.createdBy._id.toString() === userId;
    const isAssignee = task.assignedTo._id.toString() === userId;
    const isReviewer = task.reviewers.some(r => r._id.toString() === userId);

    // Authorization check
    if (userRole === 'employee' && !isAssignee) {
        return res.status(403).json({ error: "Not authorized to view this task" });
    }
    if ((userRole === 'manager' || userRole === 'admin') && !isCreator && !isReviewer) {
        return res.status(403).json({ error: "Not authorized to view this task" });
    }

    res.status(200).json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private (Admin/Manager)
export const addTask = async (req, res) => {
  try {
    const userRole = req.user.role?.toLowerCase();
    if (!["admin", "manager"].includes(userRole)) {
      return res.status(403).json({ error: "Not authorized to create tasks" });
    }

    const taskId = await generateTaskId();
    const {
      title, description, assignedTo, team, dueDate, estimatedHours,
      priority, category, tags, notes, notifyAssignee, additionalReviewers
    } = req.body;
    
    // Create attachments array if files were uploaded
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.path,
      }));
    }
    
    // Create reviewers array, always including the creator
    let reviewers = [req.user.id];
    if (additionalReviewers) {
      const additional = Array.isArray(additionalReviewers) ? additionalReviewers : [additionalReviewers];
      reviewers.push(...additional.filter(id => id !== req.user.id)); // Avoid duplicates
    }

    const newTask = new Task({
      taskId, title, description, assignedTo, team, dueDate,
      estimatedHours, priority, category, tags, notes, attachments,
      notifyAssignee, createdBy: req.user.id, reviewers
    });

    const savedTask = await newTask.save();
    
    const populatedTask = await Task.findById(savedTask._id)
      .populate("assignedTo", "name email employeeId")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .populate("reviewers", "name email");

    res.status(201).json({ message: "Task created successfully", task: populatedTask });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message || "Failed to create task" });
  }
};

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Private (Creator only)
export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: "You are not authorized to edit this task" });
    }
    
    // Prepare update data
    const updateData = { ...req.body };
    delete updateData.attachments; // Handle attachments separately

    // Handle attachments
    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.path,
      }));
      updateData.attachments = [...(task.attachments || []), ...newAttachments];
    }
    
    // If attachments are sent as an empty array from the frontend, it means they should be cleared
    if (req.body.attachments === '[]') {
        updateData.attachments = [];
    }

    const updatedTask = await Task.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .populate("assignedTo", "name email employeeId")
      .populate("team", "team_name")
      .populate("createdBy", "name email")
      .populate("reviewers", "name email");

    res.status(200).json({ message: "Task updated successfully", task: updatedTask });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: error.message || "Failed to update task" });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (Creator only)
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: "You are not authorized to delete this task" });
    }

    await Task.findByIdAndDelete(id);
    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete task" });
  }
};

// --- WORKFLOW CONTROLLERS ---

// @desc    Employee accepts a task
// @route   PUT /api/tasks/:id/accept
// @access  Private (Assigned Employee)
export const acceptTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const task = await Task.findById(id);

    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.assignedTo.toString() !== userId) return res.status(403).json({ error: "You can only accept your assigned tasks" });
    if (!["Not Started", "Reverted"].includes(task.status)) return res.status(400).json({ error: "Task cannot be accepted in its current status" });

    task.progressStatus = "Pending";
    task.status = "In Progress"; // Keep main status in sync
    await task.save();
    
    res.status(200).json({ message: "Task accepted. Status is now 'In Progress'.", task });
  } catch (error) {
    res.status(500).json({ error: "Failed to accept task" });
  }
};

// @desc    Employee submits a task for review
// @route   PUT /api/tasks/:id/submit
// @access  Private (Assigned Employee)
export const submitTaskForReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const task = await Task.findById(id);

    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.assignedTo.toString() !== userId) return res.status(403).json({ error: "You can only submit your assigned tasks" });
    if (task.status !== "In Progress") return res.status(400).json({ error: "Task must be 'In Progress' before submission" });

    task.progressStatus = "In Review";
    task.status = "In Review";
    await task.save();

    res.status(200).json({ message: "Task submitted for review.", task });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit task" });
  }
};

// @desc    Manager/Admin reviews a task
// @route   PUT /api/tasks/:id/review
// @access  Private (Creator or Reviewer)
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
    if (task.status !== "In Review") return res.status(400).json({ error: "Task is not currently 'In Review'" });

    const isCreator = task.createdBy.toString() === userId;
    const isReviewer = task.reviewers.some(r => r.toString() === userId);
    if (!isCreator && !isReviewer) {
        return res.status(403).json({ error: "You are not authorized to review this task" });
    }
    
    if (action === 'approve') {
        task.progressStatus = "Completed";
        task.status = "Completed";
    } else if (action === 'revert') {
        task.progressStatus = "Reverted";
        task.status = "Reverted"; // Fixed: Set status to "Reverted" instead of "On Hold"
        if (comment) task.notes = (task.notes ? task.notes + '\n\n' : '') + `Reverted by ${req.user.name}: ${comment}`;
    } else {
        return res.status(400).json({ error: "Invalid review action" });
    }

    await task.save();
    res.status(200).json({ message: `Task ${action}d.`, task });
  } catch (error) {
    res.status(500).json({ error: "Failed to review task" });
  }
};

// @desc    Get all team members (for assigning tasks)
// @route   GET /api/tasks/team-members
// @access  Private
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