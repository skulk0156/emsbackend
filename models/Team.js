import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    team_name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    team_leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    members: [
      {
        employee: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Team", teamSchema);