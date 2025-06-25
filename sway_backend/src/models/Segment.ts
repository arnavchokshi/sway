import mongoose, { Schema, Document } from 'mongoose';

interface DummyTemplate {
  id: string;
  name: string;
  skillLevels: { [styleName: string]: number };
  height?: number;
  customColor?: string;
}

interface Position {
  x: number;
  y: number;
  user?: mongoose.Types.ObjectId; // Real user reference
  dummyTemplateId?: string; // Reference to dummy template instead of user
  customColor?: string;
}

interface Segment extends Document {
  name: string;
  team: mongoose.Types.ObjectId;
  segmentSet?: mongoose.Types.ObjectId; // Reference to the Set this segment belongs to
  roster: mongoose.Types.ObjectId[];
  formations: Position[][];
  dummyTemplates: DummyTemplate[]; // Store dummy templates within segment
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
  isPublic: boolean; // Privacy control - if false, only captains can see it
  createdBy: mongoose.Types.ObjectId; // User who created the segment
}

const DummyTemplateSchema = new Schema<DummyTemplate>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  skillLevels: { type: Map, of: Number, default: new Map() },
  height: { type: Number },
  customColor: { type: String }
});

const PositionSchema = new Schema<Position>({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  dummyTemplateId: { type: String, required: false },
  customColor: { type: String, required: false }
});

const SegmentSchema = new Schema<Segment>({
  name: { type: String, required: true },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  segmentSet: { type: Schema.Types.ObjectId, ref: 'Set', required: false },
  roster: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  formations: [[PositionSchema]],
  dummyTemplates: [DummyTemplateSchema], // Add dummy templates array
  depth: { type: Number, default: 24 },
  width: { type: Number, default: 32 },
  divisions: { type: Number, default: 3 },
  animationDurations: [{ type: Number, default: 1 }],
  formationDurations: [{ type: Number, default: 4 }],
  musicUrl: { type: String },
  videoUrl: { type: String },
  segmentOrder: { type: Number, default: 0 },
  stylesInSegment: [{ type: String }],
  propSpace: { type: Number, default: 2 },
  isPublic: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
});

export const Segment = mongoose.model<Segment>('Segment', SegmentSchema);