import express from "express";
import {
  createAttendance,
  logoutAttendance,
  getAllAttendance,
  getAttendanceByEmployee,
  markAttendance,
} from "../controllers/attendanceController.js";

const router = express.Router();

/**
 * @route   GET /api/attendance
 * @desc    Get all attendance records with pagination and filtering
 * @access  Public
 * 
 * @query   {Number} page - Page number (default: 1)
 * @query   {Number} limit - Records per page (default: 50)
 * @query   {String} startDate - Start date for filtering (YYYY-MM-DD)
 * @query   {String} endDate - End date for filtering (YYYY-MM-DD)
 * 
 * @example GET /api/attendance?page=1&limit=10&startDate=2023-01-01&endDate=2023-01-31
 */
router.get("/", getAllAttendance);

/**
 * @route   GET /api/attendance/employee/:employeeId
 * @desc    Get attendance records for a specific employee
 * @access  Public
 * 
 * @param   {String} employeeId - Employee ID
 * @query   {String} startDate - Start date for filtering (YYYY-MM-DD)
 * @query   {String} endDate - End date for filtering (YYYY-MM-DD)
 * 
 * @example GET /api/attendance/employee/EMP001?startDate=2023-01-01&endDate=2023-01-31
 */
router.get("/employee/:employeeId", getAttendanceByEmployee);

/**
 * @route   POST /api/attendance
 * @desc    Create a new attendance record (punch in)
 * @access  Public
 * 
 * @body    {String} employeeId - Employee ID
 * @body    {String} name - Employee name
 * @body    {String} date - Date (YYYY-MM-DD)
 * @body    {String} punch_in - Punch in time (HH:MM:SS AM/PM)
 * 
 * @example POST /api/attendance
 * {
 *   "employeeId": "EMP001",
 *   "name": "John Doe",
 *   "date": "2023-06-15",
 *   "punch_in": "09:00:00 AM"
 * }
 */
router.post("/", createAttendance);

/**
 * @route   PUT /api/attendance/logout
 * @desc    Update attendance record with punch out time
 * @access  Public
 * 
 * @body    {String} employeeId - Employee ID
 * @body    {String} date - Date (YYYY-MM-DD)
 * @body    {String} punch_out - Punch out time (HH:MM:SS AM/PM)
 * @body    {String} workingHours - Formatted working hours (e.g., "8h 30m 15s")
 * 
 * @example PUT /api/attendance/logout
 * {
 *   "employeeId": "EMP001",
 *   "date": "2023-06-15",
 *   "punch_out": "05:30:00 PM",
 *   "workingHours": "8h 30m 0s"
 * }
 */
router.put("/logout", logoutAttendance);

/**
 * @route   PUT /api/attendance/mark
 * @desc    Mark employee as Absent or on Leave
 * @access  Public
 * 
 * @body    {String} employeeId - Employee ID
 * @body    {String} name - Employee name
 * @body    {String} date - Date (YYYY-MM-DD)
 * @body    {String} status - Status ("Absent" or "Leave")
 * 
 * @example PUT /api/attendance/mark
 * {
 *   "employeeId": "EMP001",
 *   "name": "John Doe",
 *   "date": "2023-06-15",
 *   "status": "Leave"
 * }
 */
router.put("/mark", markAttendance);

export default router;