import Attendance from "../models/Attendance.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

/* ================================
   ✅ Helper: Send Notification (DB + Socket)
================================ */
const sendNotification = async ({
  receiverIds,
  senderId,
  title,
  message,
  type = "attendance",
  priority = "normal",
  link = "/attendance",
  io,
}) => {
  const targets = Array.isArray(receiverIds) ? receiverIds : [receiverIds];

  targets.forEach(async (id) => {
    if (!id) return;
    try {
      const notif = await Notification.create({
        receiverId: id,
        senderId: senderId,
        title,
        message,
        type,
        priority,
        link,
      });

      if (io) {
        io.to(id.toString()).emit("newNotification", notif);
      }
    } catch (err) {
      console.error("Notification Error:", err);
    }
  });
};

/* ================================
   TIME HELPERS (IST ONLY)
================================ */

// Current IST Date (YYYY-MM-DD)
const getISTDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Current IST Time (hh:mm:ss AM/PM)
const getISTTime = () =>
  new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// Convert "10:30:00 AM" → 24h hour number
const getHoursFromTime = (timeStr) => {
  if (!timeStr) return 25;
  const [time, period] = timeStr.split(" ");
  if (!time || !period) return 25;

  let [hours] = time.split(":").map(Number);
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours;
};

// Convert time string → Date object (IST base)
const parseTimeToDate = (timeStr) => {
  const [time, period] = timeStr.split(" ");
  let [h, m, s] = time.split(":").map(Number);

  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;

  return new Date(2000, 0, 1, h, m, s || 0);
};

// Calculate working hours safely
const calculateWorkingHours = (punchIn, punchOut) => {
  if (!punchIn || !punchOut) return "0h";

  const diffMs = parseTimeToDate(punchOut) - parseTimeToDate(punchIn);
  if (diffMs <= 0) return "0h";

  const totalSeconds = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);

  return `${h}h ${m}m`;
};

/* ================================
   STATUS RULE ENGINE (STRICT)
================================ */

// Punch-in based status
const calculateStatusFromPunchIn = (punchIn) => {
  const hour = getHoursFromTime(punchIn);

  if (hour >= 10 && hour < 11) return "Present";
  if (hour >= 11 && hour < 14) return "Late";
  if (hour >= 14 && hour < 15) return "Half Day";
  return "Absent";
};

// Punch-out override rule
const applyPunchOutRule = (punchOut, currentStatus) => {
  const hour = getHoursFromTime(punchOut);
  const [time] = punchOut.split(" ");
  const [, minutes] = time.split(":").map(Number);

  if (hour > 18 || (hour === 18 && minutes > 0)) {
    return "Absent";
  }
  return currentStatus;
};

/* ================================
   PUNCH IN
================================ */
// POST /api/attendance
export const createAttendance = async (req, res) => {
  try {
    const { employeeId, name } = req.body;
    if (!employeeId || !name) {
      return res.status(400).json({ message: "employeeId & name required" });
    }

    const date = getISTDate();
    const punch_in = getISTTime();

    // Prevent double punch-in
    const existing = await Attendance.findOne({ employeeId, date });
    if (existing) {
      return res.status(400).json({ message: "Already punched in today" });
    }

    const status = calculateStatusFromPunchIn(punch_in);

    const record = await Attendance.create({
      employeeId,
      name,
      date,
      punch_in,
      status,
    });

    // ✅ Notify Admins/HR/Managers that user punched in
    const io = req.app.get("io");
    if (io) {
      try {
        const supervisors = await User.find({
          role: { $in: ["admin", "hr", "manager"] },
        }).select("_id");
        const supervisorIds = supervisors.map((s) => s._id);

        await sendNotification({
          receiverIds: supervisorIds,
          senderId: req.user ? req.user._id : null, // If self-service, null
          title: "Punch In 🟢",
          message: `${name} has punched in at ${punch_in}.`,
          type: "attendance",
          io,
        });
      } catch (err) {
        console.error("Error notifying supervisors:", err);
      }
    }

    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   PUNCH OUT
================================ */
// PUT /api/attendance/logout
export const logoutAttendance = async (req, res) => {
  try {
    const { employeeId } = req.body;
    const date = getISTDate();
    const punch_out = getISTTime();

    const record = await Attendance.findOne({ employeeId, date });
    if (!record || record.punch_out) {
      return res.status(404).json({ message: "No active session found" });
    }

    const workingHours = calculateWorkingHours(record.punch_in, punch_out);
    const finalStatus = applyPunchOutRule(punch_out, record.status);

    record.punch_out = punch_out;
    record.workingHours = workingHours;
    record.status = finalStatus;

    await record.save();

    // ✅ Notify Admins/HR/Managers that user punched out
    const io = req.app.get("io");
    if (io) {
      try {
        const supervisors = await User.find({
          role: { $in: ["admin", "hr", "manager"] },
        }).select("_id");
        const supervisorIds = supervisors.map((s) => s._id);

        await sendNotification({
          receiverIds: supervisorIds,
          senderId: req.user ? req.user._id : null,
          title: "Punch Out 🔴",
          message: `${record.name} has punched out at ${punch_out}. Duration: ${workingHours}`,
          type: "attendance",
          io,
        });
      } catch (err) {
        console.error("Error notifying supervisors:", err);
      }
    }

    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   GET RECORDS
================================ */

export const getAllAttendance = async (req, res) => {
  try {
    const records = await Attendance.find().sort({ date: -1 });
    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAttendanceByEmployee = async (req, res) => {
  try {
    const records = await Attendance.find({
      employeeId: req.params.employeeId,
    }).sort({ date: -1 });

    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   ADMIN / HR MANUAL MARK
================================ */
// PUT /api/attendance/mark
export const markAttendance = async (req, res) => {
  try {
    const { employeeId, date, status, name } = req.body;

    let record = await Attendance.findOne({ employeeId, date });

    if (!record) {
      record = new Attendance({ employeeId, name, date });
    }

    record.status = status;

    if (status === "Absent" || status === "Leave") {
      record.punch_in = null;
      record.punch_out = null;
      record.workingHours = null;
    }

    await record.save();

    // ✅ Notify Employee that attendance was marked manually
    const io = req.app.get("io");
    if (io) {
      try {
        // Find user Mongo ID from string employeeId
        const user = await User.findOne({ employeeId: employeeId });
        if (user) {
          await sendNotification({
            receiverIds: user._id,
            senderId: req.user._id,
            title: "Attendance Updated 📅",
            message: `Admin marked your attendance for ${date} as: ${status}.`,
            type: "attendance",
            io,
          });
        }
      } catch (err) {
        console.error("Error notifying user:", err);
      }
    }

    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   ADMIN EDIT RECORD
================================ */
// PUT /api/attendance/:id
export const updateAttendance = async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Record not found" });
    }

    Object.assign(record, req.body);

    // Recalculate if times changed
    if (record.punch_in) {
      record.status = calculateStatusFromPunchIn(record.punch_in);
    }
    if (record.punch_in && record.punch_out) {
      record.workingHours = calculateWorkingHours(
        record.punch_in,
        record.punch_out
      );
      record.status = applyPunchOutRule(record.punch_out, record.status);
    }

    await record.save();

    // ✅ Notify Employee that record was edited
    const io = req.app.get("io");
    if (io) {
      try {
        const user = await User.findOne({ employeeId: record.employeeId });
        if (user) {
          await sendNotification({
            receiverIds: user._id,
            senderId: req.user._id,
            title: "Attendance Record Modified ✏️",
            message: `Your attendance for ${record.date} has been updated.`,
            type: "attendance",
            io,
          });
        }
      } catch (err) {
        console.error("Error notifying user:", err);
      }
    }

    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   DELETE RECORD
================================ */
// DELETE /api/attendance/:id
export const deleteAttendance = async (req, res) => {
  try {
    const deleted = await Attendance.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Record not found" });
    }

    // ✅ Notify Admins about deletion
    const io = req.app.get("io");
    if (io) {
      try {
        const admins = await User.find({ role: { $in: ["admin", "hr", "manager"] } }).select("_id");
        const adminIds = admins.map((a) => a._id).filter((id) => id.toString() !== req.user._id.toString());

        if (adminIds.length > 0) {
          await sendNotification({
            receiverIds: adminIds,
            senderId: req.user._id,
            title: "Attendance Record Deleted 🗑️",
            message: `Attendance for ${deleted.name} (${deleted.date}) was deleted.`,
            priority: "high",
            type: "attendance",
            io,
          });
        }
      } catch (err) {
        console.error("Error notifying admins:", err);
      }
    }

    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
/* ================================
   AUTO PUNCH-OUT CRON (Updated)
================================ */
export const autoPunchOutCron = async (io) => {
  // Note: You must pass the 'io' instance from server.js when calling this cron job.
  // e.g., cron.schedule('0 18 * * *', () => autoPunchOutCron(io));
  
  try {
    const date = getISTDate();
    const punch_out_time = "06:01:00 PM"; // Slightly after 6 PM

    // Find active sessions (Users who punched in but forgot to punch out)
    const activeRecords = await Attendance.find({
      date,
      punch_out: null,
    });

    for (const record of activeRecords) {
      // 1. Set Punch Out Time
      record.punch_out = punch_out_time;

      // 2. Calculate Real Working Hours (Punch In to 6 PM)
      // No longer forcing "0h"
      const workingHours = calculateWorkingHours(
        record.punch_in,
        punch_out_time
      );
      record.workingHours = workingHours;

      // 3. Set Status to "Auto Punch Out"
      record.status = "Auto Punch Out";

      await record.save();

      console.log(
        `Auto punch-out for ${record.name}: ${workingHours} - Status: Auto Punch Out`
      );

      // ✅ Notify Employee (Optional)
      // To make this work, ensure 'io' is passed from server.js
      if (io) {
        try {
          const user = await User.findOne({ employeeId: record.employeeId });
          if (user) {
            const notif = await Notification.create({
              receiverId: user._id,
              senderId: null, // System message
              title: "Auto Punch Out ⏰",
              message: `You forgot to punch out. We have auto-logged you out at 6:01 PM. Hours: ${workingHours}`,
              type: "attendance",
              priority: "high",
              link: "/attendance",
            });

            io.to(user._id.toString()).emit("newNotification", notif);
          }
        } catch (err) {
          console.error("Cron notification error:", err);
        }
      }
    }

    console.log(`Auto punch-out completed for ${activeRecords.length} users`);
  } catch (err) {
    console.error("Auto punch-out error:", err.message);
  }
};