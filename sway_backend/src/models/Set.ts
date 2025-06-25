import mongoose, { Schema, Document } from 'mongoose';

export interface ISet extends Document {
  name: string;
  team: mongoose.Types.ObjectId;
  segments: mongoose.Types.ObjectId[]; // Array of Segment IDs
  transitionTimes: number[]; // Array of transition times in seconds between segments (length = segments.length - 1)
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
  }
);

export const Set = mongoose.model<ISet>('Set', SetSchema); 