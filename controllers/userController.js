import User from "../models/User.js";
import Notification from "../models/Notification.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";

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
  link = "/profile",
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

// ---------------- Multer Setup ----------------
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const upload = multer({ storage });

// ---------------- Login User ----------------
export const loginUser = async (req, res) => {
  try {
    const { employeeId, password, role } = req.body;

    const user = await User.findOne({ employeeId, role });
    if (!user)
      return res.status(404).json({ message: "Invalid employee ID or role" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, employeeId: user.employeeId, role: user.role },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "3h" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        email: user.email,
        department: user.department,
        location: user.location,
        address: user.address,
        designation: user.designation,
        phone: user.phone,
        dob: user.dob,
        gender: user.gender,
        joining_date: user.joining_date,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ---------------- Create User ----------------
/* ================================
  ✅ Create User with Admin Notification
================================ */
export const createUser = async (req, res) => {
  try {
    const {
      employeeId,
      name,
      email,
      role,
      password,
      department,
      designation,
      location,
      address,
      phone,
      joining_date,
    } = req.body;

    if (!employeeId || !name || !email || !role || !password)
      return res.status(400).json({ message: "Missing required fields" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      employeeId,
      name,
      email,
      role,
      password: hashedPassword,
      department: department || "",
      designation: designation || "",
      phone: phone || "",
      joining_date: joining_date || "",
      profileImage: req.file ? `uploads/${req.file.filename}` : "",
    });

    await newUser.save();
    const io = req.app.get("io");

    // ✅ 1. Welcome Notification for New User
    if (io) {
      await sendNotification({
        receiverIds: newUser._id,
        senderId: req.user ? req.user._id : newUser._id,
        title: "Welcome to Wordlane Tech! 🚀",
        message: `Hi ${name}, your account has been successfully created.`,
        type: "general",
        link: "/profile",
        io,
      });
    }

    // ✅ 2. Notify ALL ADMINS (Oversight)
    if (io) {
      try {
        const admins = await User.find({ role: "admin" }).select("_id");
        const adminIds = admins.map((admin) => admin._id);

        // Filter out the admin who created the user (optional, but good UX)
        const adminTargets = adminIds.filter((id) => id.toString() !== req.user._id.toString());

        if (adminTargets.length > 0) {
          await sendNotification({
            receiverIds: adminTargets,
            senderId: req.user._id,
            title: "New Employee Added 👤",
            message: `${name} (Role: ${role}) has joined the company.`,
            type: "general",
            priority: "normal",
            link: "/employees",
            io,
          });
        }
      } catch (err) {
        console.error("Error notifying admins for new user:", err);
      }
    }

    res.status(201).json({ message: "User created", user: newUser });
  } catch (error) {
    console.error("Create User Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ---------------- Get All Users ----------------
export const getUsers = async (req, res) => {
  try {
    let users;
    if (req.user.role === "hr") {
      users = await User.find({ role: { $ne: "admin" } }).select("-password");
    } else {
      users = await User.find().select("-password");
    }
    res.status(200).json(users);
  } catch (err) {
    console.error("Get Users Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ---------------- GET ONLY MANAGERS ----------------
export const getManagers = async (req, res) => {
  try {
    const managers = await User.find({ role: "manager" }).select("-password");
    res.status(200).json(managers);
  } catch (error) {
    console.error("Error fetching managers:", error);
    res.status(500).json({ message: "Server error while fetching managers" });
  }
};

// ---------------- Get User By ID ----------------
export const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: "Invalid User ID" });

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("Get User Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ---------------- Update User ----------------
export const updateUser = async (req, res) => {
  const { id } = req.params;

  console.log("=== UPDATE USER START ===");
  console.log("User ID:", id);
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);

  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid ID" });

  try {
    const io = req.app.get("io"); // Get Socket Instance

    // Find the user first
    console.log("Finding user with ID:", id);
    const user = await User.findById(id);
    if (!user) {
      console.log("User not found");
      return res.status(404).json({ message: "User not found" });
    }
    console.log("Found user:", user.name);

    // Delete old image if a new one is uploaded
    if (req.file && user.profileImage) {
      const oldImagePath = path.join(process.cwd(), user.profileImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        console.log("Deleted old profile image:", oldImagePath);
      }
    }

    // Create updatedData object
    const updatedData = {};

    // Check if req.body exists before trying to access it
    if (req.body) {
      console.log("Processing form fields...");

      const fields = [
        "name",
        "email",
        "role",
        "department",
        "designation",
        "location",
        "address",
        "phone",
        "dob",
        "gender",
        "joining_date",
      ];

      fields.forEach((field) => {
        if (req.body[field] !== undefined && req.body[field] !== "") {
          updatedData[field] = req.body[field];
          console.log(`Updated ${field}:`, req.body[field]);
        }
      });

      // Handle password separately (hash it if provided and not empty)
      if (req.body.password && req.body.password.trim() !== "") {
        try {
          updatedData.password = await bcrypt.hash(req.body.password, 10);
          console.log("Password updated");
        } catch (hashError) {
          console.error("Password hashing error:", hashError);
          return res.status(500).json({ message: "Error processing password" });
        }
      }
    }

    // Update profile image if a new one is uploaded
    if (req.file) {
      updatedData.profileImage = `uploads/${req.file.filename}`;
      console.log("Profile image updated:", updatedData.profileImage);
    }

    console.log("Final updated data:", updatedData);

    // Check if there's anything to update
    if (Object.keys(updatedData).length === 0) {
      console.log("No data to update");
      return res.status(400).json({ message: "No data provided for update" });
    }

    // Update user
    console.log("Updating user in database...");
    const updatedUser = await User.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true, // Run model validators
    }).select("-password"); // Don't return the password

    console.log("User updated successfully:", updatedUser.name);
    console.log("=== UPDATE USER END ===");

    // ✅ Send Notification: Profile Updated
    // Only notify if someone else updated the user, OR if it's a password reset etc.
    // Usually, we notify the user whose profile was updated.
    if (io) {
      await sendNotification({
        receiverIds: id,
        senderId: req.user._id,
        title: "Profile Updated 📝",
        message: `Your profile information has been updated by ${req.user.name || "Admin"}.`,
        type: "general",
        io,
      });
    }

    res.json({ message: "User updated successfully", user: updatedUser });
  } catch (err) {
    console.error("Update User Error:", err);
    console.log("=== UPDATE USER FAILED ===");

    // Handle validation errors
    if (err.name === "ValidationError") {
      const errors = Object.values(err.errors).map((e) => e.message);
      console.error("Validation errors:", errors);
      return res.status(400).json({ message: "Validation error", errors });
    }

    // Handle duplicate key errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      console.error("Duplicate key error for field:", field);
      return res.status(400).json({ message: `${field} already exists` });
    }

    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- Delete User ----------------
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid ID" });

  try {
    const io = req.app.get("io"); // Get Socket Instance

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const userName = user.name;
    const deletedId = user._id;

    if (user.profileImage) {
      const imagePath = path.join(process.cwd(), user.profileImage);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await User.findByIdAndDelete(id);

    // ✅ Send Notification: User Deleted
    // Notify all Admins and HRs that a user has been removed (excluding the one who deleted)
    if (io) {
      const admins = await User.find({ role: { $in: ["admin", "hr"] } }).select("_id");
      // Filter out the user who performed the delete action
      const notifyList = admins
        .map((admin) => admin._id)
        .filter((adminId) => adminId.toString() !== req.user._id.toString());

      if (notifyList.length > 0) {
        await sendNotification({
          receiverIds: notifyList,
          senderId: req.user._id,
          title: "User Deleted 🗑️",
          message: `User ${userName} has been deleted from the system.`,
          priority: "high",
          type: "general",
          io,
        });
      }
    }

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Delete User Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};