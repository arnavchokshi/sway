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
const PositionSchema = new mongoose_1.Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false }
});
const SegmentSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    team: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Team', required: true },
    roster: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
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
exports.Segment = mongoose_1.default.model('Segment', SegmentSchema);
