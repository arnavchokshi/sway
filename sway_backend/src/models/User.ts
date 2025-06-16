import mongoose, { Document, Schema } from 'mongoose';

// Interface for User document
export interface IUser extends Document {
  email?: string;
  password?: string;
  name?: string;
  team?: mongoose.Types.ObjectId; // Reference to Team
  gender?: 'male' | 'female' | 'other';
  skillLevels: { [styleName: string]: number }; // Map of style name to skill level (1-5)
  height?: number; // Height in inches
  captain?: boolean;
}

// User Schema
const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true
    },
    password: {
      type: String,
    },
    name: {
      type: String,
      trim: true,
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    skillLevels: {
      type: Map,
      of: Number,
      default: new Map(),
    },
    height: {
      type: Number, // Height in inches
    },
    captain: {
      type: Boolean,
      default: false,
    },
  },
);

// Create and export the User model
export const User = mongoose.model<IUser>('User', UserSchema); 