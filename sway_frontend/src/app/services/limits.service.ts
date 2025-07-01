import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MembershipService, MembershipStatus } from './membership.service';
import { TeamService } from './team.service';
import { SetService } from './set.service';
import { SegmentService } from './segment.service';

export interface LimitsConfig {
  maxCaptains: number;
  maxTeamMembers: number;
  maxSegments: number;
  maxSets: number;
}

export interface LimitsStatus {
  isProAccount: boolean;
  currentCounts: {
    captains: number;
    teamMembers: number;
    segments: number;
    sets: number;
  };
  limits: LimitsConfig;
  violations: {
    captains: boolean;
    teamMembers: boolean;
    segments: boolean;
    sets: boolean;
  };
  hasViolations: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class LimitsService {
  private readonly FREE_LIMITS: LimitsConfig = {
    maxCaptains: 3,
    maxTeamMembers: 30,
    maxSegments: 6,
    maxSets: 3
  };

  private readonly PRO_LIMITS: LimitsConfig = {
    maxCaptains: Infinity,
    maxTeamMembers: Infinity,
    maxSegments: Infinity,
    maxSets: Infinity
  };

  constructor(
    private membershipService: MembershipService,
    private teamService: TeamService,
    private setService: SetService,
    private segmentService: SegmentService
  ) {}

  /**
   * Get limits configuration based on membership status
   */
  getLimitsConfig(membershipStatus: MembershipStatus): LimitsConfig {
    return membershipStatus.membershipType === 'pro' && membershipStatus.isActive 
      ? this.PRO_LIMITS 
      : this.FREE_LIMITS;
  }

  /**
   * Check if a team has exceeded free account limits
   */
  checkLimitsStatus(teamId: string): Observable<LimitsStatus> {
    return new Observable(observer => {
      // Get membership status first
      this.membershipService.getMembershipStatus(teamId).subscribe({
        next: (membershipStatus) => {
          const isProAccount = membershipStatus.membershipType === 'pro' && membershipStatus.isActive;
          const limits = this.getLimitsConfig(membershipStatus);

          // Get current counts
          this.getCurrentCounts(teamId).subscribe({
            next: (counts) => {
              const violations = {
                captains: counts.captains > limits.maxCaptains,
                teamMembers: counts.teamMembers > limits.maxTeamMembers,
                segments: counts.segments > limits.maxSegments,
                sets: counts.sets > limits.maxSets
              };

              const hasViolations = Object.values(violations).some(v => v);

              observer.next({
                isProAccount,
                currentCounts: counts,
                limits,
                violations,
                hasViolations
              });
              observer.complete();
            },
            error: (err) => {
              console.error('Error getting current counts:', err);
              observer.error(err);
            }
          });
        },
        error: (err) => {
          console.error('Error getting membership status:', err);
          observer.error(err);
        }
      });
    });
  }

  /**
   * Get current counts for team members, segments, and sets
   */
  private getCurrentCounts(teamId: string): Observable<{ captains: number; teamMembers: number; segments: number; sets: number }> {
    return new Observable(observer => {
      // Get team data
      this.teamService.getTeamById(teamId).subscribe({
        next: (teamResponse) => {
          const team = teamResponse.team;
          const captains = team.members?.filter((member: any) => member.captain).length || 0;
          const teamMembers = team.members?.length || 0;

          // Get segments count
          this.segmentService.getSegmentsForTeam(teamId).subscribe({
            next: (segmentsResponse) => {
              const segments = segmentsResponse.segments?.length || 0;

              // Get sets count
              this.setService.getSetsForTeam(teamId).subscribe({
                next: (setsResponse) => {
                  const sets = setsResponse.sets?.length || 0;

                  observer.next({
                    captains,
                    teamMembers,
                    segments,
                    sets
                  });
                  observer.complete();
                },
                error: (err) => {
                  console.error('Error getting sets count:', err);
                  observer.next({
                    captains,
                    teamMembers,
                    segments,
                    sets: 0
                  });
                  observer.complete();
                }
              });
            },
            error: (err) => {
              console.error('Error getting segments count:', err);
              observer.next({
                captains,
                teamMembers,
                segments: 0,
                sets: 0
              });
              observer.complete();
            }
          });
        },
        error: (err) => {
          console.error('Error getting team data:', err);
          observer.error(err);
        }
      });
    });
  }

  /**
   * Check if adding a new item would exceed limits
   */
  canAddItem(teamId: string, itemType: 'captain' | 'teamMember' | 'segment' | 'set'): Observable<boolean> {
    return new Observable(observer => {
      this.checkLimitsStatus(teamId).subscribe({
        next: (status) => {
          if (status.isProAccount) {
            observer.next(true);
            observer.complete();
            return;
          }

          let canAdd = false;
          switch (itemType) {
            case 'captain':
              canAdd = status.currentCounts.captains < status.limits.maxCaptains;
              break;
            case 'teamMember':
              canAdd = status.currentCounts.teamMembers < status.limits.maxTeamMembers;
              break;
            case 'segment':
              canAdd = status.currentCounts.segments < status.limits.maxSegments;
              break;
            case 'set':
              canAdd = status.currentCounts.sets < status.limits.maxSets;
              break;
          }

          observer.next(canAdd);
          observer.complete();
        },
        error: (err) => {
          console.error('Error checking if can add item:', err);
          observer.error(err);
        }
      });
    });
  }

  /**
   * Get violation message for specific item type
   */
  getViolationMessage(itemType: 'captain' | 'teamMember' | 'segment' | 'set', limits: LimitsConfig): string {
    switch (itemType) {
      case 'captain':
        return `Free accounts are limited to ${limits.maxCaptains} captains. Upgrade to Pro for unlimited captains.`;
      case 'teamMember':
        return `Free accounts are limited to ${limits.maxTeamMembers} team members. Upgrade to Pro for unlimited team members.`;
      case 'segment':
        return `Free accounts are limited to ${limits.maxSegments} segments. Upgrade to Pro for unlimited segments.`;
      case 'set':
        return `Free accounts are limited to ${limits.maxSets} sets. Upgrade to Pro for unlimited sets.`;
      default:
        return 'This feature requires a Pro account.';
    }
  }

  /**
   * Get general violation message for dashboard
   */
  getDashboardViolationMessage(status: LimitsStatus): string {
    const violations = [];
    
    if (status.violations.captains) {
      violations.push(`${status.currentCounts.captains} captains (limit: ${status.limits.maxCaptains})`);
    }
    if (status.violations.teamMembers) {
      violations.push(`${status.currentCounts.teamMembers} team members (limit: ${status.limits.maxTeamMembers})`);
    }
    if (status.violations.segments) {
      violations.push(`${status.currentCounts.segments} segments (limit: ${status.limits.maxSegments})`);
    }
    if (status.violations.sets) {
      violations.push(`${status.currentCounts.sets} sets (limit: ${status.limits.maxSets})`);
    }

    return `Your account has exceeded free limits: ${violations.join(', ')}. Please edit your roster or upgrade to Pro.`;
  }
} 