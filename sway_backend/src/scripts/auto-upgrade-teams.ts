import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Team } from '../models/Team';
import { User } from '../models/User';
import { MembershipService } from '../services/membership.service';

dotenv.config();

const MONGO_URI = process.env.ATLAS_URI || '';

async function main() {
  if (!MONGO_URI) {
    console.error('ATLAS_URI is not set in environment variables.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const teams = await Team.find({});
  let upgradedCount = 0;
  let alreadyProCount = 0;
  let notEnoughUsersCount = 0;

  for (const team of teams) {
    const registeredUserCount = await User.countDocuments({
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
        team.referralCode = await MembershipService.generateUniqueReferralCode();
      }
      await team.save();
      upgradedCount++;
      console.log(`Upgraded team '${team.name}' (${team._id}) to Pro for 2 months. Referral code: ${team.referralCode}`);
    } else if (team.membershipType === 'pro') {
      alreadyProCount++;
      // Optionally, log: console.log(`Team '${team.name}' is already Pro.`);
    } else {
      notEnoughUsersCount++;
      // Optionally, log: console.log(`Team '${team.name}' does not have enough registered users (${registeredUserCount}/10).`);
    }
  }

  console.log('---');
  console.log(`Upgrade complete. Upgraded: ${upgradedCount}, Already Pro: ${alreadyProCount}, Not enough users: ${notEnoughUsersCount}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error in auto-upgrade script:', err);
  process.exit(1);
}); 