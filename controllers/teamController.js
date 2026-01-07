import Team from "../models/Team.js";

// @desc    Create Team
// @route   POST /api/teams
// @access  Private (Admin, HR)
export const createTeam = async (req, res) => {
  try {
    const { team_name, team_leader_id, member_ids } = req.body;

    if (!team_name || !team_leader_id) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Map IDs to the structure defined in the Schema
    const members = (member_ids || []).map((id) => ({
      employee: id,
    }));

    const team = await Team.create({
      team_name,
      team_leader: team_leader_id,
      members,
    });

    // Populate the response for immediate feedback
    const populatedTeam = await Team.findById(team._id)
      .populate("team_leader", "name role _id")
      .populate("members.employee", "name role _id");

    res.status(201).json(populatedTeam);
  } catch (error) {
    console.error("Create Team Error:", error);
    res.status(500).json({ message: "Failed to create team" });
  }
};

// @desc    Get All Teams
// @route   GET /api/teams
// @access  Private
export const getTeams = async (req, res) => {
  try {
    let teams;
    const userRole = req.user.role?.toLowerCase();
    const userId = req.user._id;

    // Admin sees all teams
    if (userRole === "admin") {
      teams = await Team.find()
        .populate("team_leader", "name role _id")
        .populate("members.employee", "name role _id");
    } else {
      // For others: only show teams where they are leader OR a member
      teams = await Team.find({
        $or: [
          { team_leader: userId },
          { "members.employee": userId },
        ],
      })
        .populate("team_leader", "name role _id")
        .populate("members.employee", "name role _id");
    }

    res.json(teams);
  } catch (error) {
    console.error("Get Teams Error:", error);
    res.status(500).json({ message: "Failed to fetch teams" });
  }
};

// @desc    Get Single Team By ID
// @route   GET /api/teams/:id
// @access  Private
export const getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate("team_leader", "name role _id")
      .populate("members.employee", "name role _id");

    if (!team) return res.status(404).json({ message: "Team not found" });

    const userRole = req.user.role?.toLowerCase();
    const userId = req.user._id;

    // Authorization Check
    const isLeader = team.team_leader._id.toString() === userId.toString();
    const isMember = team.members.some(
      (m) => m.employee._id.toString() === userId.toString()
    );

    // Allow access if Admin, Leader, or Member
    if (userRole !== "admin" && !isLeader && !isMember) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this team" });
    }

    res.json(team);
  } catch (error) {
    console.error("Get Team Error:", error);
    res.status(500).json({ message: "Failed to fetch team" });
  }
};

// @desc    Update Team
// @route   PUT /api/teams/:id
// @access  Private (Admin, HR)
export const updateTeam = async (req, res) => {
  try {
    const { team_name, team_leader_id, member_ids } = req.body;

    // Build update object dynamically
    const updateData = {};

    if (team_name) updateData.team_name = team_name;
    if (team_leader_id) updateData.team_leader = team_leader_id;

    // CRITICAL FIX: Only update members if the array is provided in the request.
    // If member_ids is missing, we leave the existing members array alone.
    if (member_ids) {
      updateData.members = member_ids.map((id) => ({
        employee: id,
      }));
    }

    const team = await Team.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true } // runValidators ensures schema rules apply
    )
      .populate("team_leader", "name role _id")
      .populate("members.employee", "name role _id");

    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    res.json(team);
  } catch (error) {
    console.error("Update Team Error:", error);
    res.status(500).json({ message: "Failed to update team" });
  }
};

// @desc    Delete Team
// @route   DELETE /api/teams/:id
// @access  Private (Admin)
export const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);

    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    res.json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Delete Team Error:", error);
    res.status(500).json({ message: "Failed to delete team" });
  }
};