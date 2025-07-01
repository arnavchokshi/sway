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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Team = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// Team Schema
const TeamSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    school: {
        type: String,
        trim: true,
    },
    members: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        }],
    owner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    joinCode: {
        type: String,
        required: true,
        unique: true,
    },
    styles: [{
            name: {
                type: String,
                required: true,
                trim: true,
            },
            color: {
                type: String,
                required: true,
                trim: true,
            }
        }],
    // Membership fields
    membershipType: {
        type: String,
        enum: ['free', 'pro'],
        default: 'free',
    },
    membershipExpiresAt: {
        type: Date,
        default: null,
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true, // Allows multiple null values
    },
    referralCodeUsed: {
        type: String,
        default: null,
    },
    lastMembershipCheck: {
        type: Date,
        default: null,
    },
});
// Pre-delete middleware to handle cascading deletes
TeamSchema.pre('deleteOne', { document: true, query: false }, function (next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const teamId = this._id;
            // Import models here to avoid circular dependencies
            const { Segment } = yield Promise.resolve().then(() => __importStar(require('./Segment')));
            const { Set } = yield Promise.resolve().then(() => __importStar(require('./Set')));
            // Delete all segments associated with this team
            yield Segment.deleteMany({ team: teamId });
            // Delete all sets associated with this team
            yield Set.deleteMany({ team: teamId });
            next();
        }
        catch (error) {
            next(error);
        }
    });
});
// Create and export the Team model
exports.Team = mongoose_1.default.model('Team', TeamSchema);
