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

  ngOnInit() {}

  onButtonClick() {
    if (!this.isAnimating) {
      this.isAnimating = true;
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
