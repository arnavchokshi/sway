import mongoose, { Schema, Document } from 'mongoose';

interface Position {
  x: number;
  y: number;
  user: mongoose.Types.ObjectId;
  customColor?: string;
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
  formationDurations: number[];
  musicUrl: string;
  videoUrl?: string;
  segmentOrder: number;
  stylesInSegment: [{ type: String }];
  propSpace: number;
}

const PositionSchema = new Schema<Position>({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  customColor: { type: String, required: false }
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
  formationDurations: [{ type: Number, default: 4 }],
  musicUrl: { type: String },
  videoUrl: { type: String },
  segmentOrder: { type: Number, default: 0 },
  stylesInSegment: [{ type: String }],
  propSpace: { type: Number, default: 2 }
});

export const Segment = mongoose.model<Segment>('Segment', SegmentSchema);