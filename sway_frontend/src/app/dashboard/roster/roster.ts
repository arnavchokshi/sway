import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService } from '../../services/team.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-dashboard-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roster.html',
  styleUrls: ['./roster.scss']
})
export class RosterComponent implements OnInit {
  members: { name: string; role: string; _id: string; captain: boolean }[] = [];
  showEditModal = false;
  newMemberName = '';
  editingMember: { _id: string; name: string; captain: boolean } | null = null;
  isAddingMember = false;
  errorMessage = '';

  constructor(private teamService: TeamService, private authService: AuthService, private http: HttpClient) {}

  isCaptain = false;

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    console.log('Current user in roster:', currentUser);
    this.isCaptain = !!currentUser?.captain;
    if (currentUser?.team?._id) {
      console.log('Team ID found:', currentUser.team._id);
      this.loadTeamMembers(currentUser.team._id);
    } else {
      console.log('No team ID found in user data');
    }
  }

  loadTeamMembers(teamId: string) {
    this.teamService.getTeamById(teamId).subscribe({
      next: (res) => {
        this.members = (res.team.members || []).map((member: any) => ({
          _id: member._id,
          name: member.name,
          role: member.captain ? 'Captain' : 'Member',
          captain: member.captain
        }));
      },
      error: (err) => {
        this.members = [];
        this.errorMessage = 'Failed to load team members';
      }
    });
  }

  editRoster() {
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingMember = null;
    this.newMemberName = '';
    this.errorMessage = '';
  }

  addNewMember() {
    if (!this.newMemberName.trim()) {
      this.errorMessage = 'Please enter a member name';
      return;
    }

    this.isAddingMember = true;
    this.errorMessage = '';

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      this.isAddingMember = false;
      return;
    }

    // First, get the team information
    this.http.get(`http://localhost:3000/api/users/${currentUser._id}`).subscribe({
      next: (userResponse: any) => {
        const teamId = userResponse.team?._id;
        if (!teamId) {
          this.errorMessage = 'No team found for current user';
          this.isAddingMember = false;
          return;
        }

        // Now create the new user and add them to the team
        this.teamService.addTeamMember(teamId, this.newMemberName).subscribe({
          next: (res) => {
            this.loadTeamMembers(teamId);
            this.newMemberName = '';
            this.isAddingMember = false;
          },
          error: (err) => {
            console.error('Error adding member:', err);
            this.errorMessage = err.error?.message || 'Failed to add member';
            this.isAddingMember = false;
          }
        });
      },
      error: (err) => {
        console.error('Error getting user data:', err);
        this.errorMessage = 'Failed to get user data';
        this.isAddingMember = false;
      }
    });
  }

  toggleCaptainStatus(member: { _id: string; name: string; captain: boolean }) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      return;
    }

    // First, get the team information
    this.http.get(`http://localhost:3000/api/users/${currentUser._id}`).subscribe({
      next: (userResponse: any) => {
        const teamId = userResponse.team?._id;
        if (!teamId) {
          this.errorMessage = 'No team found for current user';
          return;
        }

        this.teamService.updateMemberRole(teamId, member._id, !member.captain).subscribe({
          next: (res) => {
            this.loadTeamMembers(teamId);
          },
          error: (err) => {
            console.error('Error updating member role:', err);
            this.errorMessage = err.error?.message || 'Failed to update member role';
          }
        });
      },
      error: (err) => {
        console.error('Error getting user data:', err);
        this.errorMessage = 'Failed to get user data';
      }
    });
  }

  removeMember(memberId: string) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      return;
    }

    if (confirm('Are you sure you want to remove this member?')) {
      // First, get the team information
      this.http.get(`http://localhost:3000/api/users/${currentUser._id}`).subscribe({
        next: (userResponse: any) => {
          const teamId = userResponse.team?._id;
          if (!teamId) {
            this.errorMessage = 'No team found for current user';
            return;
          }

          this.teamService.removeTeamMember(teamId, memberId).subscribe({
            next: (res) => {
              this.loadTeamMembers(teamId);
            },
            error: (err) => {
              console.error('Error removing member:', err);
              this.errorMessage = err.error?.message || 'Failed to remove member';
            }
          });
        },
        error: (err) => {
          console.error('Error getting user data:', err);
          this.errorMessage = 'Failed to get user data';
        }
      });
    }
  }
} 