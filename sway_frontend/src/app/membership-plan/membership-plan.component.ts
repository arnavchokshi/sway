import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MembershipService, MembershipStatus } from '../services/membership.service';

@Component({
  selector: 'app-membership-plan',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './membership-plan.component.html',
  styleUrls: ['./membership-plan.component.scss']
})
export class MembershipPlanComponent implements OnInit {
  annual = false;
  loading = true;
  membershipStatus?: MembershipStatus;
  referralCode = '';
  applyingReferral = false;
  referralMessage = '';
  referralSuccess = false;
  teamId?: string;
  navigator = navigator;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private membershipService: MembershipService
  ) {}

  ngOnInit() {
    // Get team ID from route or localStorage
    this.teamId = this.route.snapshot.params['teamId'] || localStorage.getItem('teamId');
    
    if (this.teamId) {
      this.loadMembershipStatus();
    } else {
      this.loading = false;
    }
  }

  loadMembershipStatus() {
    if (!this.teamId) return;

    this.membershipService.getMembershipStatus(this.teamId).subscribe({
      next: (status) => {
        this.membershipStatus = status;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading membership status:', error);
        this.loading = false;
      }
    });
  }

  onAnnualChange(event: Event) {
    this.annual = (event.target instanceof HTMLInputElement) ? event.target.checked : false;
  }

  async goToPayment() {
    if (!this.teamId) {
      alert('Team ID not found. Please try again.');
      return;
    }

    try {
      const result = await this.membershipService.createCheckoutSession(this.teamId).toPromise();
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Error creating payment session. Please try again.');
    }
  }

  applyReferralCode() {
    if (!this.teamId || !this.referralCode.trim()) {
      alert('Please enter a referral code.');
      return;
    }

    this.applyingReferral = true;
    this.referralMessage = '';
    this.referralSuccess = false;

    this.membershipService.applyReferralCode(this.teamId, this.referralCode.trim()).subscribe({
      next: (result) => {
        this.applyingReferral = false;
        this.referralMessage = result.message;
        this.referralSuccess = result.applied;
        
        if (result.applied) {
          this.referralCode = '';
          this.loadMembershipStatus(); // Refresh status
        }
      },
      error: (error) => {
        this.applyingReferral = false;
        this.referralMessage = error.error?.message || 'Error applying referral code. Please try again.';
        this.referralSuccess = false;
      }
    });
  }

  checkForUpgrade() {
    if (!this.teamId) return;

    this.membershipService.checkAndUpgradeMembership(this.teamId).subscribe({
      next: (result) => {
        if (result.upgraded) {
          alert(`Congratulations! Your team has been upgraded to Pro for 2 months! Referral code: ${result.referralCode}`);
          this.loadMembershipStatus(); // Refresh status
        } else {
          alert(`Your team has ${result.registeredUserCount}/10 registered users. Keep adding team members with emails to get free Pro!`);
        }
      },
      error: (error) => {
        console.error('Error checking upgrade:', error);
        alert('Error checking upgrade status. Please try again.');
      }
    });
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  getMembershipBadgeText(): string {
    if (!this.membershipStatus) return 'Loading...';
    return this.membershipService.getMembershipBadgeText(this.membershipStatus);
  }

  getMembershipBadgeColor(): string {
    if (!this.membershipStatus) return 'gray';
    return this.membershipService.getMembershipBadgeColor(this.membershipStatus);
  }

  getUpgradeProgress(): number {
    if (!this.membershipStatus) return 0;
    return this.membershipService.getUpgradeProgress(this.membershipStatus.registeredUserCount);
  }

  isCloseToUpgrade(): boolean {
    if (!this.membershipStatus) return false;
    return this.membershipService.isCloseToUpgrade(this.membershipStatus.registeredUserCount);
  }

  canApplyReferral(): boolean {
    return !this.membershipStatus?.referralCodeUsed && this.membershipStatus?.membershipType === 'free';
  }
} 