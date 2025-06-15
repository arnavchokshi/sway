import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService, Style } from '../../services/team.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-dashboard-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roster.html',
  styleUrls: ['./roster.scss']
})
export class RosterComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  members: { name: string; role: string; _id: string; captain: boolean; skillLevels: { [styleName: string]: number }, height?: string | number, feet?: number, inches?: number, gender?: string }[] = [];
  showEditModal = false;
  newMemberName = '';
  editingMember: { _id: string; name: string; captain: boolean } | null = null;
  isAddingMember = false;
  errorMessage = '';
  styles: Style[] = [];
  showStylesSection = false;
  newStyle: Style = { name: '', color: '#000000' };
  editingStyleIndex: number | null = null;

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
        this.members = (res.team.members || []).map((member: any) => {
          // Parse height into feet/inches if possible
          let feet = 0, inches = 0;
          if (typeof member.height === 'number') {
            feet = Math.floor(member.height / 12);
            inches = member.height % 12;
          } else if (typeof member.height === 'string') {
            const match = member.height.match(/(\d+)'\s*(\d+)?/);
            if (match) {
              feet = parseInt(match[1], 10);
              inches = match[2] ? parseInt(match[2], 10) : 0;
            }
          }
          return {
            _id: member._id,
            name: member.name,
            role: member.captain ? 'Captain' : 'Member',
            captain: member.captain,
            skillLevels: this.styles.reduce((acc: any, style: any) => {
              acc[style.name] = (member.skillLevels && member.skillLevels[style.name]) || 1;
              return acc;
            }, {}),
            height: member.height || '',
            feet,
            inches,
            gender: member.gender || ''
          };
        });
        this.styles = res.team.styles || [];
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

  toggleStylesSection() {
    this.showStylesSection = !this.showStylesSection;
  }

  addStyle() {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.addStyle(currentUser.team._id, this.newStyle).subscribe({
      next: (res) => {
        this.styles = res.team.styles;
        this.newStyle = { name: '', color: '#000000' };
      },
      error: (err) => {
        this.errorMessage = 'Failed to add style';
      }
    });
  }

  startEditStyle(index: number) {
    this.editingStyleIndex = index;
    this.newStyle = { ...this.styles[index] };
  }

  updateStyle() {
    if (this.editingStyleIndex === null) return;
    
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.updateStyle(currentUser.team._id, this.editingStyleIndex, this.newStyle).subscribe({
      next: (res) => {
        this.styles = res.team.styles;
        this.editingStyleIndex = null;
        this.newStyle = { name: '', color: '#000000' };
      },
      error: (err) => {
        this.errorMessage = 'Failed to update style';
      }
    });
  }

  deleteStyle(index: number) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.deleteStyle(currentUser.team._id, index).subscribe({
      next: (res) => {
        this.styles = res.team.styles;
      },
      error: (err) => {
        this.errorMessage = 'Failed to delete style';
      }
    });
  }

  cancelStyleEdit() {
    this.editingStyleIndex = null;
    this.newStyle = { name: '', color: '#000000' };
  }

  updateMemberField(member: any, field: string, value: any) {
    // TODO: Implement backend update if needed
    member[field] = value;
  }

  updateMemberSkill(member: any, styleName: string, value: number) {
    // TODO: Implement backend update if needed
    member.skillLevels[styleName] = value;
  }

  updateMemberHeight(member: any, field: 'feet' | 'inches', value: number) {
    member[field] = value;
    // Update the height in inches
    const totalInches = (parseInt(member.feet, 10) || 0) * 12 + (parseInt(member.inches, 10) || 0);
    member.height = totalInches;
    // Optionally, update backend here
  }

  async saveAllMembers(): Promise<any> {
    const requests = this.members.map(member => {
      const payload: any = {
        name: member.name,
        height: member.height,
        skillLevels: member.skillLevels,
        captain: member.captain
      };
      return this.http.patch(`http://localhost:3000/api/users/${member._id}`, payload);
    });
    return forkJoin(requests).toPromise();
  }

  async closeAndSave() {
    try {
      await this.saveAllMembers();
      console.log('Emitting close event');
      this.close.emit();
    } catch (err) {
      alert('Failed to save changes. Please try again.');
    }
  }
} 