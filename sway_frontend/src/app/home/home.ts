import { Component, OnInit, AfterViewInit } from '@angular/core';
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
export class HomeComponent implements OnInit, AfterViewInit {
  showSplit = false;
  showLoginPopup = false;
  showJoinTeamModal = false;
  showFeaturesModal = false;
  showContactModal = false;
  showOnboardingModal = false;
  isAnimating = false;
  joinStep = 1;
  showScrollToTop = false;
  isCheckingAuth = false;

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

  currentStep: 'choice' | 'create-team' | 'join-team' | 'show-join-code' | 'select-member' | 'complete-profile' | 'success' = 'choice';
  formData = {
    name: '',
    email: '',
    password: '',
    teamName: '',
    teamCode: '',
    heightFeet: '',
    heightInches: '',
    gender: ''
  };

  selectedTeam: any = null;
  isNewUser: boolean = false;

  editingJoinCode = false;
  editJoinCodeValue = '';
  copied = false;

  joinCodeError = '';
  joinTeamError: string = '';

  constructor(
    private router: Router, 
    private http: HttpClient, 
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Preload all background images
    const bgImages = [
      'assets/homeImages/Screenshot 2025-07-02 at 12.32.40 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 12.34.12 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 12.37.29 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 12.38.51 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 12.40.10 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 12.40.38 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 12.55.54 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 12.56.20 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.00.19 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.11.47 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.15.00 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.16.38 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.17.55 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.19.47 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.20.50 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.26.13 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.26.47 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.27.28 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.29.27 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.30.06 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.32.40 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.33.23 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.37.50 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.40.52 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.43.06 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.43.57 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.46.38 PM.png',
      'assets/homeImages/Screenshot 2025-07-02 at 1.49.02 PM.png',
    ];
    bgImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });
    // Auto-login check - if user is already logged in, redirect to dashboard
    this.checkAutoLogin();
    
    // Check if we're on mobile
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // Force show split buttons on mobile
      setTimeout(() => {
        const ctaBtn = document.querySelector('.cta-btn') as HTMLElement;
        const splitBtns = document.querySelector('.split-btns') as HTMLElement;
        
        if (ctaBtn) {
          ctaBtn.style.display = 'none';
        }
        if (splitBtns) {
          splitBtns.classList.add('active');
          splitBtns.style.display = 'flex';
        }
      }, 100);
    } else {
      // Desktop AOS initialization
      setTimeout(() => {
        if (typeof (window as any).AOS !== 'undefined') {
          (window as any).AOS.init({
            duration: 1000,
            once: true,
            offset: 100
          });
        } else {
          // Fallback for when AOS is not loaded
          const elements = document.querySelectorAll('[data-aos]');
          elements.forEach(el => {
            el.classList.add('aos-animate');
          });
        }
      }, 500);
    }

    // Add scroll listener for navigation effect
    window.addEventListener('scroll', this.onScroll.bind(this));
  }

  ngAfterViewInit() {
    // Fade in each background image when loaded
    const bgImgs = document.querySelectorAll<HTMLImageElement>('.bg-img');
    bgImgs.forEach(img => {
      if (img.complete) {
        img.classList.add('fade-in');
      } else {
        img.addEventListener('load', () => {
          img.classList.add('fade-in');
        });
      }
    });
  }

  /**
   * Check if user is already logged in and redirect to dashboard if so
   */
  private checkAutoLogin() {
    if (this.authService.isAuthenticated()) {
      this.isCheckingAuth = true;
      
      const currentUser = this.authService.getCurrentUser();
      
      // Validate the stored user data with the backend
      this.http.get(`${environment.apiUrl}/users/${currentUser!._id}`).subscribe({
        next: (response: any) => {
          // User is still valid, redirect to dashboard
          this.isCheckingAuth = false;
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          // User data is invalid or expired, clear it
          console.log('Stored user data is invalid, clearing...');
          this.authService.logout();
          this.isCheckingAuth = false;
        }
      });
    }
  }

  onScroll() {
    const nav = document.querySelector('.landing-nav') as HTMLElement;
    if (nav) {
      if (window.scrollY > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }
    
    // Show/hide scroll to top button
    this.showScrollToTop = window.scrollY > 300;
  }

  onButtonClick() {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.showSplit = true;
    
    // Trigger the split animation
    const ctaBtn = document.querySelector('.cta-btn') as HTMLElement;
    const splitBtns = document.querySelector('.split-btns') as HTMLElement;
    
    if (ctaBtn && splitBtns) {
      ctaBtn.classList.add('splitting');
      splitBtns.classList.add('active');
    } else {
      // Fallback animation
      this.showSplit = true;
    }
  }

  onAnimationComplete() {
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

  scrollToSection(sectionId: string) {
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 100);
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
          this.sortedTeamMembers = [...this.teamMembers].sort((a: any, b: any) => 
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

  selectMember(member: any) {
    this.selectedMember = member;
    this.isNewUser = !member.email;
    this.formData.name = member.name;
    this.currentStep = 'complete-profile';
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

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  openOnboardingModal() {
    this.currentStep = 'choice';
    this.showOnboardingModal = true;
  }

  closeOnboardingModal() {
    this.showOnboardingModal = false;
    this.currentStep = 'choice';
    this.formData = {
      name: '', email: '', password: '', teamName: '', teamCode: '', heightFeet: '', heightInches: '', gender: ''
    };
    this.joinCode = '';
    this.teamMembers = [];
    this.selectedMember = null;
  }

  // Create team and user
  createTeamAndUser() {
    this.http.post(`${environment.apiUrl}/register`, {
      email: this.formData.email,
      password: this.formData.password,
      name: this.formData.name,
      captain: true
    }).subscribe({
      next: (userRes: any) => {
        const userId = userRes.user._id;
        this.http.post(`${environment.apiUrl}/teams`, {
          name: this.formData.teamName,
          owner: userId,
          members: [userId]
        }).subscribe({
          next: (teamRes: any) => {
            const teamId = teamRes.team._id;
            this.http.patch(`${environment.apiUrl}/users/${userId}`, { team: teamId }).subscribe({
              next: () => {
                this.joinCode = teamRes.team.joinCode;
                // Fetch the full user with populated team
                this.http.get(`${environment.apiUrl}/users/${userId}`).subscribe({
                  next: (fullUser: any) => {
                    this.authService.setCurrentUser({
                      _id: fullUser._id,
                      name: fullUser.name,
                      team: fullUser.team,
                      captain: fullUser.captain
                    });
                    this.currentStep = 'show-join-code';
                  },
                  error: () => {
                    this.currentStep = 'show-join-code';
                  }
                });
              }
            });
          }
        });
      }
    });
  }

  // Add a method to handle the Continue button after join code is shown
  continueAfterJoinCode() {
    this.currentStep = 'success';
  }

  // Add a method to handle the final Continue/Start Choreographing button
  finishOnboarding() {
    this.router.navigate(['/dashboard']);
  }

  // Update verifyJoinCode to only proceed if backend returns valid team and members
  verifyJoinCode() {
    this.joinTeamError = '';
    this.http.get<any>(`${environment.apiUrl}/team-by-join-code/${this.formData.teamCode}`).subscribe({
      next: (res) => {
        if (res && res.team && Array.isArray(res.members) && res.members.length > 0) {
          this.teamMembers = res.members.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
          this.selectedTeam = res.team;
          this.currentStep = 'select-member';
          this.joinTeamError = '';
        } else {
          this.joinTeamError = 'Cant find team with this code. Make sure you have the correct code.';
        }
      },
      error: (err) => {
        this.joinTeamError = 'Cant find team with this code. Please confirm code with capatin.';
      }
    });
  }

  // Update completeProfile to only set currentUser and redirect after successful profile completion or login
  completeProfile() {
    const height = (parseInt(this.formData.heightFeet, 10) || 0) * 12 + (parseInt(this.formData.heightInches, 10) || 0);
    
    // If we have a selected member (from team roster), always update that existing user
    if (this.selectedMember && this.selectedMember._id) {
      // Update existing user
      this.http.patch(`${environment.apiUrl}/users/${this.selectedMember._id}`, {
        email: this.formData.email,
        password: this.formData.password,
        gender: this.formData.gender,
        height
      }).subscribe({
        next: (userRes: any) => {
          this.authService.setCurrentUser({
            _id: userRes.user._id,
            name: userRes.user.name,
            team: userRes.user.team,
            captain: userRes.user.captain
          });
          this.currentStep = 'success';
        },
        error: (err) => alert('User update failed: ' + (err.error?.error || err.message))
      });
    } else if (this.isNewUser && this.selectedTeam) {
      // Only create new user if no member was selected and we're in new user mode
      this.http.post(`${environment.apiUrl}/register`, {
        name: this.formData.name,
        email: this.formData.email,
        password: this.formData.password,
        team: this.selectedTeam._id,
        gender: this.formData.gender,
        height,
        captain: false
      }).subscribe({
        next: (userRes: any) => {
          this.authService.setCurrentUser({
            _id: userRes.user._id,
            name: userRes.user.name,
            team: userRes.user.team,
            captain: userRes.user.captain
          });
          this.currentStep = 'success';
        },
        error: (err) => alert('User creation failed: ' + (err.error?.error || err.message))
      });
    } else {
      alert('No user selected or team not found');
    }
  }

  // Add method to validate and format team code input
  validateTeamCodeInput(event: any) {
    this.joinTeamError = '';
    let value = event.target.value;
    value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.formData.teamCode = value;
  }

  // Add method to check if team code is valid format
  isTeamCodeValid(): boolean {
    return !!(this.formData.teamCode && 
           this.formData.teamCode.length === 7 && 
           /^[A-Z0-9]+$/.test(this.formData.teamCode));
  }

  // Add method to check if team code has correct length
  isTeamCodeLengthValid(): boolean {
    return !!(this.formData.teamCode && this.formData.teamCode.length === 7);
  }

  // Add method to check if team code has correct format
  isTeamCodeFormatValid(): boolean {
    return !!(this.formData.teamCode && /^[A-Z0-9]+$/.test(this.formData.teamCode));
  }

  // Add method to update join code
  updateJoinCode() {
    if (!this.formData.teamCode || this.formData.teamCode.length !== 7) {
      alert('Please enter a 7-character join code');
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || !currentUser.team) {
      alert('No team found');
      return;
    }

    this.http.patch(`${environment.apiUrl}/teams/${currentUser.team._id}/join-code`, {
      joinCode: this.formData.teamCode
    }).subscribe({
      next: (res: any) => {
        this.joinCode = this.formData.teamCode;
        this.currentStep = 'show-join-code';
      },
      error: (err) => {
        alert('Failed to update join code: ' + (err.error?.error || err.message));
      }
    });
  }

  // Add method to generate a new join code
  generateNewJoinCode() {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || !currentUser.team) {
      alert('No team found');
      return;
    }

    // Generate a new code based on team name
    const teamName = currentUser.team.name || 'team';
    const teamNamePrefix = teamName.replace(/\s+/g, '').toLowerCase().substring(0, 4).padEnd(4, 'a');
    const randomDigits = Math.floor(100 + Math.random() * 900); // 3 digits (100-999)
    const newCode = `${teamNamePrefix}${randomDigits}`;
    
    this.formData.teamCode = newCode.toUpperCase();
  }

  // Show join code and allow inline editing
  showJoinCodeStep() {
    this.editingJoinCode = false;
    this.editJoinCodeValue = this.joinCode;
    this.copied = false;
  }

  copyJoinCode() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(this.joinCode).then(() => {
        this.copied = true;
        setTimeout(() => (this.copied = false), 1200);
      });
    }
  }

  startEditJoinCode() {
    this.editingJoinCode = true;
    this.editJoinCodeValue = this.joinCode;
    this.joinCodeError = '';
    setTimeout(() => {
      const input = document.querySelector('.edit-code-input-inline') as HTMLInputElement;
      if (input) input.focus();
    }, 0);
  }

  clearJoinCodeError() {
    this.joinCodeError = '';
  }

  saveJoinCodeEdit() {
    const newCode = this.editJoinCodeValue.trim();
    if (newCode.length !== 7) {
      this.joinCodeError = 'Join code must be exactly 7 characters.';
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(newCode)) {
      this.joinCodeError = 'Code must be alphanumeric.';
      return;
    }
    if (newCode === this.joinCode) {
      this.editingJoinCode = false;
      return;
    }
    // Call backend to update code
    const currentUser = this.authService.getCurrentUser();
    if (currentUser && currentUser.team && currentUser.team._id) {
      this.http.patch(`${environment.apiUrl}/teams/${currentUser.team._id}/join-code`, { joinCode: newCode })
        .subscribe({
          next: (res: any) => {
            this.joinCode = newCode;
            this.editingJoinCode = false;
            this.joinCodeError = '';
          },
          error: (err) => {
            if (err.error?.error && err.error.error.includes('already in use')) {
              this.joinCodeError = 'This join code is already in use.';
            } else {
              this.joinCodeError = err.error?.error || 'Failed to update join code.';
            }
          }
        });
    } else {
      this.editingJoinCode = false;
    }
  }

  validateHeightFeet() {
    let val = Number(this.formData.heightFeet);
    if (isNaN(val) || val < 3) this.formData.heightFeet = '3';
    else if (val > 8) this.formData.heightFeet = '8';
  }

  validateHeightInches() {
    let val = Number(this.formData.heightInches);
    if (isNaN(val) || val < 0) this.formData.heightInches = '0';
    else if (val > 11) this.formData.heightInches = '11';
  }
}
