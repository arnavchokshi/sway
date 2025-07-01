import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MembershipStatus {
  membershipType: 'free' | 'pro';
  isActive: boolean;
  expiresAt?: Date;
  referralCode?: string;
  referralCodeUsed?: string;
  registeredUserCount: number;
  daysUntilExpiry?: number;
}

export interface MembershipUpgradeResult {
  upgraded: boolean;
  registeredUserCount: number;
  membershipType: string;
  membershipExpiresAt?: Date;
  referralCode?: string;
}

export interface ReferralCodeResult {
  applied: boolean;
  message: string;
  membershipExpiresAt?: Date;
}

export interface SubscriptionResult {
  subscription: any;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class MembershipService {
  private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  /**
   * Check if a team qualifies for free pro upgrade and upgrade if eligible
   */
  checkAndUpgradeMembership(teamId: string): Observable<MembershipUpgradeResult> {
    return this.http.post<MembershipUpgradeResult>(`${this.apiUrl}/teams/${teamId}/check-membership-upgrade`, {});
  }

  /**
   * Apply a referral code to a team for bonus membership time
   */
  applyReferralCode(teamId: string, referralCode: string): Observable<ReferralCodeResult> {
    return this.http.post<ReferralCodeResult>(`${this.apiUrl}/teams/${teamId}/apply-referral`, { referralCode });
  }

  /**
   * Get comprehensive membership status for a team
   */
  getMembershipStatus(teamId: string): Observable<MembershipStatus> {
    return this.http.get<MembershipStatus>(`${this.apiUrl}/teams/${teamId}/membership-status`);
  }

  /**
   * Get the count of registered users (users with emails) for a team
   */
  getRegisteredUserCount(teamId: string): Observable<{ registeredUserCount: number }> {
    return this.http.get<{ registeredUserCount: number }>(`${this.apiUrl}/teams/${teamId}/registered-user-count`);
  }

  /**
   * Check if a team's membership is still active
   */
  isMembershipActive(teamId: string): Observable<{ isActive: boolean }> {
    return this.http.get<{ isActive: boolean }>(`${this.apiUrl}/teams/${teamId}/membership-active`);
  }

  /**
   * Create a Stripe checkout session for subscription
   */
  createCheckoutSession(teamId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.apiUrl}/create-checkout-session`, { teamId });
  }

  /**
   * Create a subscription with payment method
   */
  createSubscription(teamId: string, paymentMethodId: string): Observable<SubscriptionResult> {
    return this.http.post<SubscriptionResult>(`${this.apiUrl}/subscriptions/create`, { 
      teamId, 
      paymentMethodId 
    });
  }

  /**
   * Cancel a subscription
   */
  cancelSubscription(teamId: string): Observable<SubscriptionResult> {
    return this.http.post<SubscriptionResult>(`${this.apiUrl}/subscriptions/cancel`, { teamId });
  }

  /**
   * Check if user is close to upgrade threshold
   */
  isCloseToUpgrade(registeredUserCount: number): boolean {
    return registeredUserCount >= 7 && registeredUserCount < 10;
  }

  /**
   * Get upgrade progress percentage
   */
  getUpgradeProgress(registeredUserCount: number): number {
    return Math.min((registeredUserCount / 10) * 100, 100);
  }

  /**
   * Format days until expiry
   */
  formatDaysUntilExpiry(days: number): string {
    if (days <= 0) {
      return 'Expired';
    } else if (days === 1) {
      return '1 day';
    } else if (days < 7) {
      return `${days} days`;
    } else if (days < 30) {
      const weeks = Math.ceil(days / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''}`;
    } else {
      const months = Math.ceil(days / 30);
      return `${months} month${months > 1 ? 's' : ''}`;
    }
  }

  /**
   * Get membership badge text
   */
  getMembershipBadgeText(status: MembershipStatus): string {
    if (status.membershipType === 'free') {
      return 'Free';
    } else if (status.membershipType === 'pro') {
      if (status.daysUntilExpiry && status.daysUntilExpiry > 0) {
        return `Pro (${this.formatDaysUntilExpiry(status.daysUntilExpiry)})`;
      } else {
        return 'Pro (Expired)';
      }
    }
    return 'Unknown';
  }

  /**
   * Get membership badge color
   */
  getMembershipBadgeColor(status: MembershipStatus): string {
    if (status.membershipType === 'free') {
      return 'gray';
    } else if (status.membershipType === 'pro') {
      if (status.isActive) {
        if (status.daysUntilExpiry && status.daysUntilExpiry <= 7) {
          return 'orange'; // Warning color for expiring soon
        } else {
          return 'green'; // Active pro
        }
      } else {
        return 'red'; // Expired pro
      }
    }
    return 'gray';
  }
} 