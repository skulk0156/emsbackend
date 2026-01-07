import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },

    punch_in: {
      type: String,
      required: false, // Changed: Not required for Absent/Leave
    },

    punch_out: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["Present", "Absent", "Leave", "Late"],
      default: "Present",
    },

    workingHours: {
      type: String,
      default: null,
    },
  }, 
  { timestamps: true }
);

// one record per employee per day
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);