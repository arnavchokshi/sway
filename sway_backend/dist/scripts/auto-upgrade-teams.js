"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const Team_1 = require("../models/Team");
const User_1 = require("../models/User");
const membership_service_1 = require("../services/membership.service");
dotenv_1.default.config();
const MONGO_URI = process.env.ATLAS_URI || '';
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!MONGO_URI) {
            console.error('ATLAS_URI is not set in environment variables.');
            process.exit(1);
        }
        yield mongoose_1.default.connect(MONGO_URI);
        console.log('Connected to MongoDB.');
        const teams = yield Team_1.Team.find({});
        let upgradedCount = 0;
        let alreadyProCount = 0;
        let notEnoughUsersCount = 0;
        for (const team of teams) {
            const registeredUserCount = yield User_1.User.countDocuments({
                team: team._id,
                email: { $exists: true, $ne: null }
            });
            if (registeredUserCount >= 10 && team.membershipType === 'free') {
                // Upgrade to Pro for 2 months and generate referral code
                const twoMonthsFromNow = new Date();
                twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
                team.membershipType = 'pro';
                team.membershipExpiresAt = twoMonthsFromNow;
                if (!team.referralCode) {
                    team.referralCode = yield membership_service_1.MembershipService.generateUniqueReferralCode();
                }
                yield team.save();
                upgradedCount++;
                console.log(`Upgraded team '${team.name}' (${team._id}) to Pro for 2 months. Referral code: ${team.referralCode}`);
            }
            else if (team.membershipType === 'pro') {
                alreadyProCount++;
                // Optionally, log: console.log(`Team '${team.name}' is already Pro.`);
            }
            else {
                notEnoughUsersCount++;
                // Optionally, log: console.log(`Team '${team.name}' does not have enough registered users (${registeredUserCount}/10).`);
            }
        }
        console.log('---');
        console.log(`Upgrade complete. Upgraded: ${upgradedCount}, Already Pro: ${alreadyProCount}, Not enough users: ${notEnoughUsersCount}`);
        yield mongoose_1.default.disconnect();
        process.exit(0);
    });
}
main().catch(err => {
    console.error('Error in auto-upgrade script:', err);
    process.exit(1);
});
