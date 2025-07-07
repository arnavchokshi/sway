"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Segment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const DummyTemplateSchema = new mongoose_1.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    skillLevels: { type: Map, of: Number, default: new Map() },
    height: { type: Number },
    customColor: { type: String }
});
const PositionSchema = new mongoose_1.Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    dummyTemplateId: { type: String, required: false },
    customColor: { type: String, required: false }
});
const FormationDraftSchema = new mongoose_1.Schema({
    id: { type: String, required: true },
    formation: [PositionSchema],
    createdAt: { type: Date, default: Date.now },
    isMain: { type: Boolean, default: false },
    name: { type: String, required: false }
});
const SegmentSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    team: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Team', required: true },
    segmentSet: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Set', required: false },
    roster: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    // Main timeline
    formations: [[PositionSchema]],
    formationDurations: [{ type: Number, default: 4 }],
    animationDurations: [{ type: Number, default: 1 }],
    // Draft timeline
    draftFormations: [[PositionSchema]],
    draftFormationDurations: [{ type: Number, default: 4 }],
    draftAnimationDurations: [{ type: Number, default: 1 }],
    draftEntryTransitionDurations: [{ type: Number, default: 1 }], // Entry transition durations for draft formations
    draftExitTransitionDurations: [{ type: Number, default: 1 }], // Exit transition durations for draft formations
    draftFormationStartTimes: [{ type: Number, default: 0 }], // Individual start times for each draft formation
    draftStartTime: { type: Number, default: 0 },
    // Playback mode
    currentPlaybackMode: { type: String, enum: ['main', 'draft'], default: 'main' },
    // Legacy draft support
    formationDrafts: { type: Map, of: FormationDraftSchema, required: false },
    dummyTemplates: [DummyTemplateSchema], // Add dummy templates array
    depth: { type: Number, default: 24 },
    width: { type: Number, default: 32 },
    divisions: { type: Number, default: 3 },
    musicUrl: { type: String },
    videoUrl: { type: String },
    segmentOrder: { type: Number, default: 0 },
    stylesInSegment: [{ type: String }],
    propSpace: { type: Number, default: 2 },
    isPublic: { type: Boolean, default: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
});
exports.Segment = mongoose_1.default.model('Segment', SegmentSchema);
