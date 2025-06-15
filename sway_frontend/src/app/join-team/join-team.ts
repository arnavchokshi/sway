import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-join-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './join-team.html',
  styleUrl: './join-team.scss'
})
export class JoinTeam {
  joinCode: string = '';
  roster: any[] = [];
  sortedRoster: any[] = [];
  showRoster = false;
  showProfilePopup = false;
  selectedMember: any = null;
  teamId: string = '';
  profileForm = {
    name: '',
    email: '',
    password: '',
    heightFeet: '',
    heightInches: '',
    gender: ''
  };
  isNewUser = false;

  constructor(private http: HttpClient, private router: Router, private authService: AuthService) {}

  joinTeam() {
    if (this.joinCode) {
      this.http.get<any>(`http://localhost:3000/api/team-by-join-code/${this.joinCode}`)
        .subscribe({
          next: (res) => {
            this.teamId = res.team._id;
            this.roster = res.members || [];
            this.sortedRoster = [...this.roster].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            this.showRoster = true;
          },
          error: (err) => {
            alert(err.error?.error || 'Team not found');
            this.showRoster = false;
        }
      });
    } else {
      alert('Please enter a join code!');
    }
  }

  openProfilePopup(member: any) {
    this.selectedMember = member;
    this.isNewUser = !member;
    this.profileForm = {
      name: member ? member.name : '',
      email: '',
      password: '',
      heightFeet: '',
      heightInches: '',
      gender: ''
    };
    this.showProfilePopup = true;
  }

  closeProfilePopup() {
    this.showProfilePopup = false;
    this.selectedMember = null;
  }

  submitProfile() {
    const height = (parseInt(this.profileForm.heightFeet, 10) || 0) * 12 + (parseInt(this.profileForm.heightInches, 10) || 0);
    if (this.isNewUser) {
      // Create a new user in the team
      this.http.post('http://localhost:3000/api/register', {
        name: this.profileForm.name,
        email: this.profileForm.email,
        password: this.profileForm.password,
        team: this.teamId,
        gender: this.profileForm.gender,
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
          this.router.navigate(['/dashboard']);
        },
        error: (err) => alert('User creation failed: ' + (err.error?.error || err.message))
      });
    } else {
      // Update the selected user
      this.http.patch(`http://localhost:3000/api/users/${this.selectedMember._id}`, {
        name: this.profileForm.name,
        email: this.profileForm.email,
        password: this.profileForm.password,
        gender: this.profileForm.gender,
        height
      }).subscribe({
        next: (userRes: any) => {
          this.authService.setCurrentUser({
            _id: userRes._id,
            name: userRes.name,
            team: userRes.team,
            captain: userRes.captain
          });
          this.router.navigate(['/dashboard']);
        },
        error: (err) => alert('User update failed: ' + (err.error?.error || err.message))
      });
    }
  }
}
