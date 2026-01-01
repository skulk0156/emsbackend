import Attendance from "../models/Attendance.js";

/**
 * CREATE / PUNCH IN
 * POST /api/attendance
 */
export const createAttendance = async (req, res) => {
  try {
    const { employeeId, name, date, punch_in } = req.body;

    // Validate required fields
    if (!employeeId || !name || !date || !punch_in) {
      return res.status(400).json({ 
        message: "All fields are required: employeeId, name, date, punch_in" 
      });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ 
        message: "Invalid date format. Use YYYY-MM-DD" 
      });
    }

    // Check for existing attendance record
    const existing = await Attendance.findOne({ employeeId, date });

    if (existing) {
      return res.status(400).json({ 
        message: "Attendance already marked for this date" 
      });
    }

    // Create new attendance record
    const attendance = await Attendance.create({
      employeeId,
      name,
      date,
      punch_in,
      status: "Present",
    });

    res.status(201).json(attendance);
  } catch (error) {
    console.error("Error creating attendance:", error);
    res.status(500).json({ 
      message: "Server error while creating attendance record",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * LOGOUT / PUNCH OUT
 * PUT /api/attendance/logout
 */
export const logoutAttendance = async (req, res) => {
  try {
    const { employeeId, date, punch_out, workingHours } = req.body;

    // Validate required fields
    if (!employeeId || !date || !punch_out || !workingHours) {
      return res.status(400).json({ 
        message: "All fields are required: employeeId, date, punch_out, workingHours" 
      });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ 
        message: "Invalid date format. Use YYYY-MM-DD" 
      });
    }

    // Find existing attendance record
    const attendance = await Attendance.findOne({ employeeId, date });

    if (!attendance) {
      return res.status(404).json({ 
        message: "No attendance record found for this date" 
      });
    }

    // Check if already punched out
    if (attendance.punch_out) {
      return res.status(400).json({ 
        message: "Attendance already punched out for this date" 
      });
    }

    // Update punch out details
    attendance.punch_out = punch_out;
    attendance.workingHours = workingHours;
    await attendance.save();

    res.json(attendance);
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({ 
      message: "Server error while updating attendance record",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET ALL ATTENDANCE
 * GET /api/attendance
 */
export const getAllAttendance = async (req, res) => {
  try {
    // Support pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Support filtering by date range
    const { startDate, endDate } = req.query;
    let filter = {};
    
    if (startDate && endDate) {
      filter.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    // Get records with pagination
    const records = await Attendance.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const total = await Attendance.countDocuments(filter);
    
    res.json({
      records,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ 
      message: "Server error while fetching attendance records",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET ATTENDANCE BY EMPLOYEE ID
 * GET /api/attendance/employee/:employeeId
 */
export const getAttendanceByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    
    let filter = { employeeId };
    
    if (startDate && endDate) {
      filter.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    const records = await Attendance.find(filter).sort({ date: -1 });
    
    res.json(records);
  } catch (error) {
    console.error("Error fetching employee attendance:", error);
    res.status(500).json({ 
      message: "Server error while fetching employee attendance",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * MARK ABSENT / LEAVE
 * PUT /api/attendance/mark
 */
export const markAttendance = async (req, res) => {
  try {
    const { employeeId, name, date, status } = req.body;

    // Validate required fields
    if (!employeeId || !name || !date || !status) {
      return res.status(400).json({ 
        message: "All fields are required: employeeId, name, date, status" 
      });
    }

    // Validate status
    if (!["Absent", "Leave"].includes(status)) {
      return res.status(400).json({ 
        message: "Invalid status. Must be 'Absent' or 'Leave'" 
      });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ 
        message: "Invalid date format. Use YYYY-MM-DD" 
      });
    }

    // Check for existing attendance record
    const existing = await Attendance.findOne({ employeeId, date });

    if (existing) {
      return res.status(400).json({ 
        message: "Attendance already marked for this date" 
      });
    }

    // Create new attendance record
    const attendance = await Attendance.create({
      employeeId,
      name,
      date,
      status,
      punch_in: null,
      punch_out: null,
      workingHours: null,
    });

    res.status(201).json(attendance);
  } catch (error) {
    console.error("Error marking attendance:", error);
    res.status(500).json({ 
      message: "Server error while marking attendance",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};