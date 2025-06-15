import mongoose, { Document, Schema } from 'mongoose';

// Interface for User document
export interface IUser extends Document {
  email?: string;
  password?: string;
  name?: string;
  team?: mongoose.Types.ObjectId; // Reference to Team
  gender?: 'male' | 'female' | 'other';
  skill_level?: { [segment: string]: number }; // segment: skill level
  height?: number; // or string if you want to allow "5'8\""
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
    skill_level: {
      type: Map,
      of: String, // segment: skill level
      default: {},
    },
    height: {
      type: Number, // or String if you want
    },
    captain: {
      type: Boolean,
      default: false,
    },
  },
);

// Create and export the User model
export const User = mongoose.model<IUser>('User', UserSchema); 