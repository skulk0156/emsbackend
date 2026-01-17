// backend/controllers/projectController.js
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

/* ================================
   ✅ Helper: Generate Unique Project ID (8 digits)
================================ */
const generateProjectId = () => {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
};

const generateUniqueProjectId = async () => {
  let projectId;
  let isUnique = false;

  while (!isUnique) {
    projectId = generateProjectId();
    const existingProject = await Project.findOne({ project_id: projectId });
    if (!existingProject) isUnique = true;
  }

  return projectId;
};

/* ================================
   ✅ Helper: Notify Many Users (DB + Socket)
================================ */
const notifyUsers = async ({ req, receiverIds = [], title, message, link = "/projects" }) => {
  try {
    const io = req.app.get("io");

    const uniqueReceivers = [...new Set(receiverIds.map((id) => id.toString()))];

    for (let rid of uniqueReceivers) {
      const notif = await Notification.create({
        receiverId: rid,
        senderId: req.user.id,
        title,
        message,
        type: "general",
        priority: "normal",
        link,
      });

      if (io) io.to(rid.toString()).emit("newNotification", notif);
    }
  } catch (err) {
    console.log("❌ notifyUsers error:", err.message);
  }
};

/* ================================
   ✅ Create Project + Notification
================================ */
export const createProject = async (req, res) => {
  try {
    const { project_name, description, manager_id, end_date, status, team_id, deadline } = req.body;

    if (!project_name || !manager_id) {
      return res.status(400).json({ message: "Project name and manager are required" });
    }

    // ✅ Generate unique project_id
    const projectId = req.body.project_id || (await generateUniqueProjectId());

    const project = await Project.create({
      project_name,
      project_id: projectId,
      description: description || "",
      manager: manager_id,
      team: team_id || null,
      status: status || "In Progress",
      end_date: end_date || null,
      deadline: deadline || null,
    });

    await project.populate("manager", "name email role");
    await project.populate("team", "team_name");

    // ✅ Notification Receivers
    let receiverIds = [manager_id];

    // ✅ Add team leader + members if team exists
    if (team_id) {
      const team = await Team.findById(team_id);
      if (team) {
        if (team.team_leader) receiverIds.push(team.team_leader.toString());

        if (team.members?.length > 0) {
          team.members.forEach((m) => {
            if (m.employee) receiverIds.push(m.employee.toString());
          });
        }
      }
    }

    // ✅ Send Notification
    await notifyUsers({
      req,
      receiverIds,
      title: "📌 New Project Created",
      message: `Project "${project_name}" has been created.`,
      link: "/projects",
    });

    res.status(201).json({ message: "Project created successfully ✅", project });
  } catch (err) {
    console.error("Create Project Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================================
   ✅ Get Projects (Role based + Filters)
================================ */
export const getProjects = async (req, res) => {
  try {
    const {
      search,
      status,
      manager,
      team,
      from,
      to,
      page = 1,
      limit = 12,
      sortBy = "createdAt",
      sortDir = "desc",
    } = req.query;

    const userRole = req.user.role?.toLowerCase();
    const userId = req.user._id;

    const q = {};

    // ✅ Role-based filtering
    if (userRole !== "admin") {
      const userTeams = await Team.find({
        $or: [{ team_leader: userId }, { "members.employee": userId }],
      }).select("_id");

      const userTeamIds = userTeams.map((t) => t._id);

      if (team) {
        if (!userTeamIds.some((id) => id.toString() === team.toString())) {
          return res.status(200).json({
            projects: [],
            summary: { total: 0, completed: 0, inProgress: 0, onHold: 0 },
          });
        }
        q.team = team;
      } else {
        if (userRole === "manager") {
          q.$or = [{ team: { $in: userTeamIds } }, { manager: userId }];
        } else {
          q.team = { $in: userTeamIds };
        }
      }
    } else {
      if (team) q.team = team;
    }

    // ✅ extra filters
    if (status) q.status = status;
    if (manager) q.manager = manager;

    // ✅ deadline range
    if (from || to) {
      q.deadline = {};
      if (from) q.deadline.$gte = new Date(from);
      if (to) q.deadline.$lte = new Date(to);
    }

    // ✅ search project_name or project_id
    if (search) {
      q.$or = [
        { project_name: { $regex: search, $options: "i" } },
        { project_id: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Math.max(parseInt(page, 10), 1) - 1) * Math.max(parseInt(limit, 10), 1);
    const sort = { [sortBy]: sortDir === "asc" ? 1 : -1 };

    let projects = await Project.find(q)
      .populate("manager", "name email role")
      .populate("team", "team_name")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit, 10));

    // ✅ Summary counts
    const allMatching = await Project.find(q);

    const summary = {
      total: allMatching.length,
      completed: allMatching.filter((p) => p.status === "Completed").length,
      inProgress: allMatching.filter((p) => p.status === "In Progress").length,
      onHold: allMatching.filter((p) => p.status === "On Hold").length,
    };

    res.status(200).json({ projects, summary });
  } catch (err) {
    console.error("Get Projects Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================================
   ✅ Get Project by ID
================================ */
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("manager", "name email role")
      .populate("team", "team_name");

    if (!project) return res.status(404).json({ message: "Project not found" });

    res.status(200).json(project);
  } catch (err) {
    console.error("Get Project Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================================
   ✅ Update Project + Notification
================================ */
export const updateProject = async (req, res) => {
  try {
    const { project_name, description, manager_id, end_date, status, team_id, deadline, project_id } = req.body;

    // ✅ If project_id update, check unique
    if (project_id) {
      const existingProject = await Project.findOne({
        project_id,
        _id: { $ne: req.params.id },
      });

      if (existingProject) {
        return res.status(400).json({ message: "Project ID already exists" });
      }
    }

    const oldProject = await Project.findById(req.params.id);
    if (!oldProject) return res.status(404).json({ message: "Project not found" });

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      {
        project_name,
        project_id,
        description,
        manager: manager_id,
        end_date,
        status,
        team: team_id || null,
        deadline,
      },
      { new: true }
    )
      .populate("manager", "name email role")
      .populate("team", "team_name");

    // ✅ Collect receivers
    let receiverIds = [];

    // notify old manager + new manager
    if (oldProject.manager) receiverIds.push(oldProject.manager.toString());
    if (manager_id) receiverIds.push(manager_id.toString());

    // notify team members (new team)
    if (team_id) {
      const team = await Team.findById(team_id);
      if (team) {
        if (team.team_leader) receiverIds.push(team.team_leader.toString());
        if (team.members?.length > 0) {
          team.members.forEach((m) => {
            if (m.employee) receiverIds.push(m.employee.toString());
          });
        }
      }
    }

    await notifyUsers({
      req,
      receiverIds,
      title: "🛠️ Project Updated",
      message: `Project "${updatedProject.project_name}" has been updated.`,
      link: "/projects",
    });

    res.status(200).json({ message: "Project updated successfully ✅", project: updatedProject });
  } catch (err) {
    console.error("Update Project Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================================
   ✅ Delete Project + Notification
================================ */
export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    // ✅ receivers = manager + team members
    let receiverIds = [];
    if (project.manager) receiverIds.push(project.manager.toString());

    if (project.team) {
      const team = await Team.findById(project.team);
      if (team) {
        if (team.team_leader) receiverIds.push(team.team_leader.toString());
        if (team.members?.length > 0) {
          team.members.forEach((m) => {
            if (m.employee) receiverIds.push(m.employee.toString());
          });
        }
      }
    }

    await Project.findByIdAndDelete(req.params.id);

    await notifyUsers({
      req,
      receiverIds,
      title: "🗑️ Project Deleted",
      message: `A project has been deleted: "${project.project_name}"`,
      link: "/projects",
    });

    res.status(200).json({ message: "Project deleted successfully ✅" });
  } catch (err) {
    console.error("Delete Project Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
