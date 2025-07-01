import { Team } from '../models/Team';
import { User } from '../models/User';

export class MembershipService {
  /**
   * Check if a team qualifies for free pro upgrade and upgrade if eligible
   */
  static async checkAndUpgradeMembership(teamId: string): Promise<{
    upgraded: boolean;
    registeredUserCount: number;
    membershipType: string;
    membershipExpiresAt?: Date;
    referralCode?: string;
  }> {
    try {
      // Count users with emails for this team
      const registeredUserCount = await User.countDocuments({
        team: teamId,
        email: { $exists: true, $ne: null }
      });

      // Get the team
      const team = await Team.findById(teamId);
      if (!team) {
        throw new Error('Team not found');
      }

      // Check if team qualifies for free pro upgrade
      if (registeredUserCount >= 10 && team.membershipType === 'free') {
        // Grant 2 months of pro
        const twoMonthsFromNow = new Date();
        twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

        team.membershipType = 'pro';
        team.membershipExpiresAt = twoMonthsFromNow;
        team.referralCode = await this.generateUniqueReferralCode();

        await team.save();

        return {
          upgraded: true,
          registeredUserCount,
          membershipType: team.membershipType,
          membershipExpiresAt: team.membershipExpiresAt,
          referralCode: team.referralCode
        };
      }

      return {
        upgraded: false,
        registeredUserCount,
        membershipType: team.membershipType,
        membershipExpiresAt: team.membershipExpiresAt,
        referralCode: team.referralCode
      };
    } catch (error) {
      console.error('Error checking membership upgrade:', error);
      throw error;
    }
  }

  /**
   * Generate a unique referral code
   */
  static async generateUniqueReferralCode(): Promise<string> {
    let referralCode: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 100;

    while (!isUnique && attempts < maxAttempts) {
      // Generate a 6-character alphanumeric code
      referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Check if code already exists
      const existingTeam = await Team.findOne({ referralCode });
      if (!existingTeam) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Failed to generate unique referral code after maximum attempts');
    }

    return referralCode!;
  }

  /**
   * Apply a referral code to a team for bonus membership time
   */
  static async applyReferralCode(teamId: string, referralCode: string): Promise<{
    applied: boolean;
    message: string;
    membershipExpiresAt?: Date;
  }> {
    try {
      // Find the team that generated this referral code
      const referringTeam = await Team.findOne({ referralCode });
      if (!referringTeam) {
        return {
          applied: false,
          message: 'Invalid referral code'
        };
      }

      // Get the team applying the code
      const team = await Team.findById(teamId);
      if (!team) {
        throw new Error('Team not found');
      }

      // Check if this team has already used a referral code
      if (team.referralCodeUsed) {
        return {
          applied: false,
          message: 'Team has already used a referral code'
        };
      }

      // Check if this referral code has already been used by another team
      const codeAlreadyUsed = await Team.findOne({ 
        referralCodeUsed: referralCode,
        _id: { $ne: teamId } // Exclude current team
      });

      if (codeAlreadyUsed) {
        return {
          applied: false,
          message: 'Referral code has already been used'
        };
      }

      // Apply the referral code - grant 1 additional month
      let newExpiryDate: Date;

      if (team.membershipType === 'free') {
        // If free, start pro membership for 1 month
        newExpiryDate = new Date();
        newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
        team.membershipType = 'pro';
      } else {
        // If already pro, extend by 1 month
        const currentExpiry = team.membershipExpiresAt || new Date();
        newExpiryDate = new Date(currentExpiry);
        newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
      }

      team.membershipExpiresAt = newExpiryDate;
      team.referralCodeUsed = referralCode;

      await team.save();

      return {
        applied: true,
        message: 'Referral code applied successfully! 1 month of pro membership added.',
        membershipExpiresAt: newExpiryDate
      };
    } catch (error) {
      console.error('Error applying referral code:', error);
      throw error;
    }
  }

  /**
   * Get the count of registered users (users with emails) for a team
   */
  static async getRegisteredUserCount(teamId: string): Promise<number> {
    try {
      const count = await User.countDocuments({
        team: teamId,
        email: { $exists: true, $ne: null }
      });
      return count;
    } catch (error) {
      console.error('Error getting registered user count:', error);
      throw error;
    }
  }

  /**
   * Check if a team's membership is still active
   */
  static async isMembershipActive(teamId: string): Promise<boolean> {
    try {
      const team = await Team.findById(teamId);
      if (!team) {
        return false;
      }

      if (team.membershipType === 'free') {
        return true; // Free membership is always active
      }

      if (!team.membershipExpiresAt) {
        return false; // Pro membership without expiry date is invalid
      }

      return team.membershipExpiresAt > new Date();
    } catch (error) {
      console.error('Error checking membership status:', error);
      return false;
    }
  }

  /**
   * Get membership status for a team
   */
  static async getMembershipStatus(teamId: string): Promise<{
    membershipType: string;
    isActive: boolean;
    expiresAt?: Date;
    referralCode?: string;
    referralCodeUsed?: string;
    registeredUserCount: number;
    daysUntilExpiry?: number;
  }> {
    try {
      const team = await Team.findById(teamId);
      if (!team) {
        throw new Error('Team not found');
      }

      const registeredUserCount = await this.getRegisteredUserCount(teamId);
      const isActive = await this.isMembershipActive(teamId);

      let daysUntilExpiry: number | undefined;
      if (team.membershipExpiresAt) {
        const now = new Date();
        const diffTime = team.membershipExpiresAt.getTime() - now.getTime();
        daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        membershipType: team.membershipType,
        isActive,
        expiresAt: team.membershipExpiresAt,
        referralCode: team.referralCode,
        referralCodeUsed: team.referralCodeUsed,
        registeredUserCount,
        daysUntilExpiry
      };
    } catch (error) {
      console.error('Error getting membership status:', error);
      throw error;
    }
  }
} 