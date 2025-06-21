import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Login } from '../login/login';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface TeamMember {
  _id: string;
  name: string;
  email?: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, Login]
})
export class HomeComponent implements OnInit {
  showSplit = false;
  showLoginPopup = false;
  showJoinTeamModal = false;
  showFeaturesModal = false;
  showContactModal = false;
  isAnimating = false;
  joinStep = 1;

  // Join team form fields
  joinCode = '';
  teamName = '';
  teamId = '';
  teamMembers: TeamMember[] = [];
  sortedTeamMembers: TeamMember[] = [];
  selectedMember: TeamMember | null = null;
  userEmail = '';
  userPassword = '';
  heightFeet: number | null = null;
  heightInches: number | null = null;
  gender = '';

  constructor(
    private router: Router, 
    private http: HttpClient, 
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Debug: Check if elements are properly rendered
    setTimeout(() => {
      const ctaBtn = document.querySelector('.cta-btn');
      const splitBtns = document.querySelector('.split-btns');
      console.log('CTA Button found:', !!ctaBtn);
      console.log('Split buttons found:', !!splitBtns);
      console.log('Screen width:', window.innerWidth);
      console.log('User agent:', navigator.userAgent);
    }, 1000);

    // Check if AOS is working and apply appropriate classes
    this.checkAOSAndApplyClasses();

    // Remove AOS attributes on mobile to prevent interference
    if (window.innerWidth <= 480) {
      this.removeAOSAttributes();
    }

    // Force show elements on mobile after a delay
    setTimeout(() => {
      this.forceShowElements();
    }, 2000);
  }

  checkAOSAndApplyClasses() {
    // Check if AOS is available and working
    if (typeof (window as any).AOS !== 'undefined' && (window as any).AOS.init) {
      console.log('AOS is available');
      // AOS is working, let it handle animations
    } else {
      console.log('AOS not available, applying fallback classes');
      // AOS is not working, apply fallback classes
      this.applyFallbackClasses();
    }
  }

  applyFallbackClasses() {
    // Apply aos-animate class to elements to trigger fallback animations
    const elements = document.querySelectorAll('[data-aos]');
    elements.forEach(element => {
      element.classList.add('aos-animate');
    });
  }

  removeAOSAttributes() {
    // Remove AOS attributes from elements that might interfere
    const elementsWithAOS = document.querySelectorAll('[data-aos]');
    elementsWithAOS.forEach(element => {
      element.removeAttribute('data-aos');
      element.removeAttribute('data-aos-duration');
      element.removeAttribute('data-aos-delay');
    });
    console.log('Removed AOS attributes for mobile');
  }

  forceShowElements() {
    // Force show headline words
    const words = document.querySelectorAll('.headline .word');
    words.forEach((word, index) => {
      (word as HTMLElement).style.opacity = '1';
      (word as HTMLElement).style.transform = 'translateY(0) scale(1)';
    });

    // Force show subheadline
    const subheadline = document.querySelector('.subheadline');
    if (subheadline) {
      (subheadline as HTMLElement).style.opacity = '1';
      (subheadline as HTMLElement).style.transform = 'translateY(0)';
    }

    // Force show CTA button wrapper
    const ctaWrapper = document.querySelector('.cta-btn-wrapper');
    if (ctaWrapper) {
      (ctaWrapper as HTMLElement).style.opacity = '1';
      (ctaWrapper as HTMLElement).style.transform = 'translateY(0)';
    }

    // Force show CTA button
    const ctaBtn = document.querySelector('.cta-btn');
    if (ctaBtn) {
      (ctaBtn as HTMLElement).style.opacity = '1';
      (ctaBtn as HTMLElement).style.transform = 'translate(-50%, -50%)';
    }

    console.log('Forced show elements for mobile');
  }

  onButtonClick() {
    console.log('Button clicked, isAnimating:', this.isAnimating);
    if (!this.isAnimating) {
      console.log('Starting split animation');
      this.isAnimating = true;
      this.showSplit = true;
      
      // Fallback for mobile devices that might have animation issues
      setTimeout(() => {
        if (this.isAnimating) {
          console.log('Animation fallback triggered');
          this.isAnimating = false;
        }
      }, 2000); // 2 second fallback

      // Force show split buttons after 1 second as additional fallback
      setTimeout(() => {
        if (!this.showSplit) {
          console.log('Force showing split buttons');
          this.showSplit = true;
          this.isAnimating = false;
        }
      }, 1000);
    }
  }

  onAnimationComplete() {
    console.log('Animation completed');
    this.isAnimating = false;
  }

  goToLogin() {
    this.showLoginPopup = true;
  }

  closeLoginPopup() {
    this.showLoginPopup = false;
  }

  showFeatures() {
    this.showFeaturesModal = true;
  }

  closeFeaturesModal() {
    this.showFeaturesModal = false;
  }

  showContact() {
    this.showContactModal = true;
  }

  closeContactModal() {
    this.showContactModal = false;
  }

  CreateTeam() {
    this.router.navigate(['/create-user']);
  }

  JoinTeam() {
    this.showJoinTeamModal = true;
    this.joinStep = 1;
    this.resetForm();
  }

  closeJoinTeamModal() {
    this.showJoinTeamModal = false;
    this.resetForm();
  }

  resetForm() {
    this.joinCode = '';
    this.teamName = '';
    this.teamId = '';
    this.teamMembers = [];
    this.sortedTeamMembers = [];
    this.selectedMember = null;
    this.userEmail = '';
    this.userPassword = '';
    this.heightFeet = null;
    this.heightInches = null;
    this.gender = '';
    this.joinStep = 1;
  }

  verifyTeamCode() {
    if (!this.joinCode) {
      alert('Please enter a join code!');
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/team-by-join-code/${this.joinCode}`)
      .subscribe({
        next: (res) => {
          this.teamId = res.team._id;
          this.teamName = res.team.name;
          this.teamMembers = res.members || [];
          this.sortedTeamMembers = [...this.teamMembers].sort((a, b) => 
            (a.name || '').localeCompare(b.name || '')
          );
          this.joinStep = 2;
        },
        error: (err) => {
          alert(err.error?.error || 'Team not found');
          this.joinStep = 1;
        }
      });
  }

  selectMember(member: TeamMember) {
    this.selectedMember = member;
  }

  goToStep3() {
    if (this.selectedMember) {
      this.joinStep = 3;
    }
  }

  submitJoinTeam() {
    if (!this.userEmail || !this.userPassword || 
        this.heightFeet === null || this.heightInches === null || !this.gender) {
      alert('Please fill in all required fields');
      return;
    }

    // Check if email is already in use by another member
    const emailInUse = this.teamMembers.some(member => 
      member.email === this.userEmail && member._id !== this.selectedMember?._id
    );

    if (emailInUse) {
      alert('This email is already associated with another team member');
      return;
    }

    const height = (this.heightFeet * 12) + this.heightInches;

    // Always update the existing user since we're selecting from team members
    this.http.patch(`${environment.apiUrl}/users/${this.selectedMember?._id}`, {
      email: this.userEmail,
      password: this.userPassword,
      gender: this.gender,
      height
    }).subscribe({
      next: (userRes: any) => {
        this.authService.setCurrentUser({
          _id: userRes.user._id,
          name: userRes.user.name,
          team: userRes.user.team,
          captain: userRes.user.captain
        });
        this.router.navigate(['/dashboard']);
      },
      error: (err) => alert('User update failed: ' + (err.error?.error || err.message))
    });
  }

  CreateUser() {
    this.router.navigate(['/create-user']);
  }

  searchTeam() {
    this.http.get<any>(`${environment.apiUrl}/team-by-join-code/${this.joinCode}`)
  }

  updateMember() {
    this.http.patch(`${environment.apiUrl}/users/${this.selectedMember?._id}`, {
    })
  }

  goToCreateUser() {
    this.router.navigate(['/create-user']);
  }
}
