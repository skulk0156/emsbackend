import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  taskId: {
    type: Number,
    required: true,
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team"
  },
  // Start Date field removed as requested
  dueDate: {
    type: Date,
    required: true
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High", "Critical"],
    default: "Medium"
  },
  status: {
    type: String,
    enum: ["Not Started", "In Progress", "On Hold", "Completed", "In Review", "Pending", "Reverted"],
    default: "Not Started"
  },
  category: {
    type: String,
    enum: ["Development", "Design", "Testing", "Documentation", "Meeting", "Research"],
    default: "Development"
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  progressStatus: {
    type: String,
    enum: ["Not Started", "Pending", "In Review", "Completed", "Reverted"],
    default: "Not Started"
  },
  tags: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  attachments: [{
    filename: String,
    path: String,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  notifyAssignee: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // NEW: Track which managers can review this ticket
  reviewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }]
}, {
  timestamps: true
});

export default mongoose.model("Task", taskSchema);