import Attendance from "../models/Attendance.js";

// --- HELPER: Time Parsing ---
// Converts "10:30:00 AM" to a number representing the hour (10) for comparison
const getHoursFromTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 25; // Return invalid hour if missing
  const [time, period] = timeStr.split(' ');
  if (!time || !period) return 25;

  const [hours] = time.split(':').map(Number);
  let hour24 = hours;

  if (period === 'PM' && hours !== 12) hour24 += 12;
  if (period === 'AM' && hours === 12) hour24 = 0;

  return hour24;
};

// --- HELPER: Determine Status based on Punch In ---
// 10-11: Present | 11-14: Late | 14-15: Half Day | >15: Absent
const calculateStatus = (punchInTime) => {
  const hour = getHoursFromTime(punchInTime);

  if (hour >= 10 && hour < 11) return "Present";
  if (hour >= 11 && hour < 14) return "Late";
  if (hour >= 14 && hour < 15) return "Half Day";
  return "Absent";
};

// @desc    Create Attendance (Punch In)
// @route   POST /api/attendance
// @access  Private (Employee)
export const createAttendance = async (req, res) => {
  try {
    const { employeeId, name, date, punch_in } = req.body;

    if (!employeeId || !date || !punch_in) {
      return res.status(400).json({ message: "Missing required fields (employeeId, date, punch_in)" });
    }

    // Check if record already exists for this date
    const existing = await Attendance.findOne({ employeeId, date });
    if (existing) {
      return res.status(400).json({ message: "Already punched in for today." });
    }

    // Apply Strict Time Logic for Initial Status
    const status = calculateStatus(punch_in);

    const newRecord = new Attendance({
      employeeId,
      name,
      date,
      punch_in,
      status, // Status set based on punch_in time
    });

    const savedRecord = await newRecord.save();
    res.status(201).json(savedRecord);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Punch Out
// @route   PUT /api/attendance/logout
// @access  Private (Employee)
export const logoutAttendance = async (req, res) => {
  try {
    const { employeeId, date, punch_out, workingHours } = req.body;

    const record = await Attendance.findOne({ employeeId, date });
    if (!record) {
      return res.status(404).json({ message: "No active session found for this date." });
    }

    // Update times
    record.punch_out = punch_out;
    record.workingHours = workingHours;

    // --- STRICT PUNCH OUT LOGIC ---
    // If punch out is after 18:01, mark as Absent
    const hour = getHoursFromTime(punch_out);
    const [timeStr] = punch_out.split(' ');
    const [hours, minutes] = timeStr.split(':').map(Number);

    // Check if time is past 18:00 (6:00 PM)
    if (hour > 18 || (hour === 18 && minutes > 0)) {
      record.status = "Absent";
    }

    await record.save();
    res.status(200).json(record);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get All Attendance Records
// @route   GET /api/attendance
// @access  Private (Admin/HR)
export const getAllAttendance = async (req, res) => {
  try {
    const records = await Attendance.find().sort({ date: -1 });
    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Attendance by Employee
// @route   GET /api/attendance/employee/:employeeId
// @access  Private
export const getAttendanceByEmployee = async (req, res) => {
  try {
    const records = await Attendance.find({ employeeId: req.params.employeeId }).sort({ date: -1 });
    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark Attendance (Manual - Absent/Leave)
// @route   PUT /api/attendance/mark
// @access  Private (Admin/HR)
export const markAttendance = async (req, res) => {
  try {
    const { employeeId, date, status, name } = req.body;

    // Check if record exists
    let record = await Attendance.findOne({ employeeId, date });

    if (record) {
      // Update existing record
      record.status = status;
      if (status === 'Absent' || status === 'Leave') {
        record.punch_in = null;
        record.punch_out = null;
        record.workingHours = null;
      }
      await record.save();
      return res.status(200).json(record);
    } else {
      // Create new manual record
      const newRecord = new Attendance({
        employeeId,
        name,
        date,
        status,
        punch_in: null,
        punch_out: null,
      });
      await newRecord.save();
      return res.status(201).json(newRecord);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update Specific Record (Edit)
// @route   PUT /api/attendance/:id
// @access  Private (Admin/HR)
export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Optional: Re-calculate status if times are changed manually
    // Or just trust the admin input. Here we trust the input but update fields.
    
    const updatedRecord = await Attendance.findByIdAndUpdate(id, req.body, { new: true });
    
    if (!updatedRecord) {
      return res.status(404).json({ message: "Record not found" });
    }
    
    res.status(200).json(updatedRecord);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete Attendance Record
// @route   DELETE /api/attendance/:id
// @access  Private (Admin/HR)
export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRecord = await Attendance.findByIdAndDelete(id);
    
    if (!deletedRecord) {
      return res.status(404).json({ message: "Record not found" });
    }
    
    res.status(200).json({ message: "Record deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- CRON JOB HELPER: Auto Punch Out ---
// Run this function daily at 18:05 (or just after 18:01)
// Import this in your server.js and use with node-cron
export const autoPunchOutCron = async () => {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    console.log(`Running Auto Punch-Out for ${today}...`);

    // Find all records for today where punch_out is null
    const activeRecords = await Attendance.find({ date: today, punch_out: null });

    if (activeRecords.length === 0) {
      console.log("No active sessions to auto punch-out.");
      return;
    }

    for (const record of activeRecords) {
      record.punch_out = "06:01:00 PM"; // Auto set time
      record.status = "Absent"; // Enforce Absent rule
      record.workingHours = "0h"; // Or calculate hours up to 18:00 if preferred
      await record.save();
      console.log(`Auto punched out employee: ${record.employeeId}`);
    }

    console.log(`Auto punch-out completed for ${activeRecords.length} records.`);
  } catch (error) {
    console.error("Auto punch-out error:", error);
  }
};