import mongoose, { Schema, Document } from 'mongoose';

export interface Position {
  x: number;
  y: number;
  user?: mongoose.Types.ObjectId; // Real user reference
  dummyTemplateId?: string; // Reference to dummy template instead of user
  customColor?: string;
}

export interface DummyTemplate {
  id: string;
  name: string;
  skillLevels: Map<string, number>;
  height?: number;
  customColor?: string;
}

// Add interface for formation drafts
export interface FormationDraft {
  id: string;
  formation: Position[];
  createdAt: Date;
  isMain: boolean; // Only one draft per formation position can be main (shown to members)
  name?: string; // Optional name for the draft
}

export interface TimelineItem {
  type: 'formation' | 'transition';
  row: 'main' | 'draft'; // can be extended to 'draft-2', etc.
  duration: number; // seconds
  index: number;    // absolute order in the timeline
  formation?: Position[]; // present only when type === 'formation'
}

interface Segment extends Document {
  name: string;
  team: mongoose.Types.ObjectId;
  segmentSet?: mongoose.Types.ObjectId;
  roster: mongoose.Types.ObjectId[];
  // NEW unified timeline
  timeline: TimelineItem[];
  dummyTemplates: DummyTemplate[];
  depth: number;
  width: number;
  divisions: number;
  musicUrl: string;
  videoUrl?: string;
  segmentOrder: number;
  stylesInSegment: [{ type: String }];
  propSpace: number;
  isPublic: boolean;
  createdBy: mongoose.Types.ObjectId;
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

const TimelineItemSchema = new Schema<TimelineItem>({
  type: { type: String, enum: ['formation', 'transition'], required: true },
  row:  { type: String, enum: ['main', 'draft'], required: true },
  duration: { type: Number, required: true },
  index: { type: Number, required: true },
  formation: [PositionSchema] // optional
});

const SegmentSchema = new Schema<Segment>({
  name: { type: String, required: true },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  segmentSet: { type: Schema.Types.ObjectId, ref: 'Set', required: false },
  roster: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  timeline: [TimelineItemSchema],
  dummyTemplates: [DummyTemplateSchema],
  depth: { type: Number, default: 24 },
  width: { type: Number, default: 32 },
  divisions: { type: Number, default: 3 },
  musicUrl: { type: String },
  videoUrl: { type: String },
  segmentOrder: { type: Number, default: 0 },
  stylesInSegment: [{ type: String }],
  propSpace: { type: Number, default: 2 },
  isPublic: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
});

export const Segment = mongoose.model<Segment>('Segment', SegmentSchema);