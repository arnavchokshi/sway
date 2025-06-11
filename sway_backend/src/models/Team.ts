import mongoose, { Document, Schema } from 'mongoose';

// Interface for Team document
export interface ITeam extends Document {
  name: string;
  school?: string;
  members: mongoose.Types.ObjectId[]; // Array of User IDs
  owner: mongoose.Types.ObjectId; // User ID of the team owner
  joinCode: string;
}

// Team Schema
const TeamSchema = new Schema<ITeam>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    school: {
      type: String,
      trim: true,
    },
    members: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    }],
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    joinCode: {
      type: String,
      required: true,
      unique: true,
    },
  },
);

// Create and export the Team model
export const Team = mongoose.model<ITeam>('Team', TeamSchema); 