import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService, Style } from '../../services/team.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';

interface UserResponse {
  message: string;
  user: {
    _id: string;
    name: string;
    skillLevels: { [key: string]: number };
    height: number;
    captain: boolean;
  };
}

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
        this.styles = res.team.styles || [];
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

          // Initialize skill levels for all styles
          const skillLevels: { [key: string]: number } = {};
          this.styles.forEach(style => {
            const styleName = style.name.toLowerCase();
            // Convert skill level to number, default to 1 if undefined
            skillLevels[styleName] = Number(member.skillLevels?.get?.(styleName) || member.skillLevels?.[styleName] || 1);
          });

          console.log('Loading member skill levels:', {
            memberId: member._id,
            name: member.name,
            skillLevels: skillLevels
          });

          return {
            _id: member._id,
            name: member.name,
            role: member.captain ? 'Captain' : 'Member',
            captain: member.captain,
            skillLevels: skillLevels,
            height: member.height || '',
            feet,
            inches,
            gender: member.gender || ''
          };
        });
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

  toggleCaptainStatus(member: { _id: string; name: string; captain: boolean; role: string }) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      return;
    }

    // Check if this is the last captain and they're trying to untoggle
    if (member.captain) {
      const captainCount = this.members.filter(m => m.captain).length;
      if (captainCount <= 1) {
        this.errorMessage = 'There must be at least one captain';
        return;
      }
    }

    // Update the member's captain status immediately
    this.http.patch(`http://localhost:3000/api/users/${member._id}`, {
      captain: !member.captain
    }).subscribe({
      next: (res) => {
        member.captain = !member.captain;
        // Update the role display
        member.role = member.captain ? 'Captain' : 'Member';
        // Clear any error message on success
        this.errorMessage = '';
      },
      error: (err) => {
        console.error('Error updating captain status:', err);
        this.errorMessage = 'Failed to update captain status';
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
    if (!member.skillLevels) {
      member.skillLevels = {};
    }
    // Ensure value is a number and style name is lowercase
    const numericValue = Number(value);
    const normalizedStyleName = styleName.toLowerCase();
    member.skillLevels[normalizedStyleName] = numericValue;
    
    console.log('Updating skill level:', {
      memberId: member._id,
      style: normalizedStyleName,
      value: numericValue,
      currentSkillLevels: member.skillLevels
    });

    // Create a complete payload with all member data
    const payload = {
      name: member.name,
      height: member.height,
      skillLevels: member.skillLevels,
      captain: member.captain
    };

    // Immediately save the skill level change
    this.http.patch<UserResponse>(`http://localhost:3000/api/users/${member._id}`, payload).subscribe({
      next: (res) => {
        console.log('Skill level updated successfully:', res);
        // Update the local member data with the response
        if (res.user) {
          // Convert Map to object if needed
          const updatedSkillLevels = res.user.skillLevels instanceof Map 
            ? Object.fromEntries(res.user.skillLevels)
            : res.user.skillLevels;
          member.skillLevels = updatedSkillLevels;
        }
      },
      error: (err) => {
        console.error('Error updating skill level:', err);
        this.errorMessage = 'Failed to update skill level';
      }
    });
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
      // Ensure skillLevels is properly structured
      const skillLevels: { [key: string]: number } = {};
      this.styles.forEach(style => {
        const normalizedStyleName = style.name.toLowerCase();
        skillLevels[normalizedStyleName] = Number(member.skillLevels?.[normalizedStyleName]) || 1;
      });
      
      const payload: any = {
        name: member.name,
        height: member.height,
        skillLevels: skillLevels,
        captain: member.captain
      };

      console.log('Saving member:', member._id, 'with payload:', payload);
      
      return this.http.patch(`http://localhost:3000/api/users/${member._id}`, payload).toPromise();
    });
    
    try {
      const results = await Promise.all(requests);
      console.log('All members saved successfully:', results);
      // Reload team members to ensure we have the latest data
      const currentUser = this.authService.getCurrentUser();
      if (currentUser?.team?._id) {
        this.loadTeamMembers(currentUser.team._id);
      }
    } catch (error) {
      console.error('Error saving members:', error);
      throw error;
    }
  }

  async closeAndSave() {
    try {
      await this.saveAllMembers();
      this.close.emit();
    } catch (error) {
      console.error('Error saving members:', error);
      this.errorMessage = 'Failed to save changes';
    }
  }

  onClose() {
    this.closeAndSave();
  }
} 