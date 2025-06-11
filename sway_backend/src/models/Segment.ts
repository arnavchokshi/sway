import mongoose, { Schema, Document } from 'mongoose';

interface Position {
  x: number;
  y: number;
  user: mongoose.Types.ObjectId;
}

interface Segment extends Document {
  name: string;
  team: mongoose.Types.ObjectId;
  roster: mongoose.Types.ObjectId[];
  formations: Position[][];
  depth: number;
  width: number;
  divisions: number;
  animationDurations: number[];
  musicUrl: string;
}

const PositionSchema = new Schema<Position>({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: false }
});

const SegmentSchema = new Schema<Segment>({
  name: { type: String, required: true },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  roster: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  formations: [[PositionSchema]],
  depth: { type: Number, default: 24 },
  width: { type: Number, default: 32 },
  divisions: { type: Number, default: 3 },
  animationDurations: [{ type: Number, default: 1 }],
  musicUrl: { type: String }
});

export const Segment = mongoose.model<Segment>('Segment', SegmentSchema);