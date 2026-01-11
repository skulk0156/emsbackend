import Attendance from "../models/Attendance.js";

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
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   AUTO PUNCH-OUT CRON
================================ */
export const autoPunchOutCron = async () => {
  try {
    const date = getISTDate();
    const punch_out = "06:01:00 PM";

    const activeRecords = await Attendance.find({
      date,
      punch_out: null,
    });

    for (const record of activeRecords) {
      record.punch_out = punch_out;
      record.workingHours = "0h";
      record.status = "Absent";
      await record.save();
    }

    console.log(`Auto punch-out completed for ${activeRecords.length} users`);
  } catch (err) {
    console.error("Auto punch-out error:", err.message);
  }
};
