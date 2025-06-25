import mongoose, { Schema, Document } from 'mongoose';

export interface ISet extends Document {
  name: string;
  team: mongoose.Types.ObjectId;
  segments: mongoose.Types.ObjectId[]; // Array of Segment IDs
  transitionTimes: number[]; // Array of transition times in seconds between segments (length = segments.length - 1)
  owner: mongoose.Types.ObjectId; // User ID of the set creator
  createdAt: Date;
  updatedAt: Date;
  order: number; // Order within the team's sets
}

const SetSchema = new Schema<ISet>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    segments: [{
      type: Schema.Types.ObjectId,
      ref: 'Segment',
    }],
    transitionTimes: [{
      type: Number,
      default: 0,
      min: 0, // Transition time cannot be negative
    }],
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

export const Set = mongoose.model<ISet>('Set', SetSchema); 