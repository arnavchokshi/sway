import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService, Style } from '../../services/team.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { environment } from '../../../environments/environment';

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
  members: { name: string; role: string; _id: string; captain: boolean; skillLevels: { [styleName: string]: number }, height?: string | number, feet?: number, inches?: number, gender?: string, isNew?: boolean }[] = [];
  showEditModal = false;
  newMemberName = '';
  editingMember: { _id: string; name: string; captain: boolean } | null = null;
  isAddingMember = false;
  errorMessage = '';
  styles: Style[] = [];
  showStylesSection = false;
  newStyle: Style = { name: '', color: '#000000' };
  editingStyleIndex: number | null = null;
  selectedStyleForSkills: string = '';

  constructor(private teamService: TeamService, private authService: AuthService, private http: HttpClient) {}

  isCaptain = false;

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    
    if (currentUser && currentUser.team && currentUser.team._id) {
      this.loadTeamMembers(currentUser.team._id);
    }
  }

  loadTeamMembers(teamId: string) {
    this.http.get<any>(`${environment.apiUrl}/teams/${teamId}`)
      .subscribe({
        next: (response) => {
          this.members = response.team.members || [];
          this.styles = response.team.styles || [];
          
          // Convert height from inches to feet/inches for display
          this.members.forEach(member => {
            if (member.height && typeof member.height === 'number') {
              const feet = Math.floor(member.height / 12);
              const inches = member.height % 12;
              member.feet = feet;
              member.inches = inches;
            }
          });
          
          // Skill levels are already included in the team members data
        },
        error: (err) => {
          alert('Failed to load team members: ' + (err.error?.error || err.message));
        }
      });
  }

  promptAddNewMember() {
    if (this.members.find(m => m.isNew)) {
      return; // Only allow one new member row at a time
    }

    const newMember: {
      _id: string;
      name: string;
      role: string;
      captain: boolean;
      skillLevels: { [key: string]: number };
      feet: number | undefined;
      inches: number | undefined;
      gender: string;
      isNew: boolean;
    } = {
      _id: `new-${Date.now()}`, // temp id
      name: '',
      role: 'Member',
      captain: false,
      skillLevels: {},
      feet: undefined,
      inches: undefined,
      gender: '',
      isNew: true
    };
    
    this.styles.forEach(style => {
      newMember.skillLevels[style.name.toLowerCase()] = 1;
    });

    this.members.push(newMember);
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

  addNewMember(name: string, tempMember: any) {
    if (!name.trim()) {
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
    this.http.get(`${environment.apiUrl}/users/${currentUser._id}`).subscribe({
      next: (userResponse: any) => {
        const teamId = userResponse.team?._id;
        if (!teamId) {
          this.errorMessage = 'No team found for current user';
          this.isAddingMember = false;
          return;
        }

        // Now create the new user and add them to the team
        this.teamService.addTeamMember(teamId, name).subscribe({
          next: (res) => {
            this.loadTeamMembers(teamId); // This will refresh the list
            this.isAddingMember = false;
          },
          error: (err) => {
            console.error('Error adding member:', err);
            this.errorMessage = err.error?.message || 'Failed to add member';
            this.isAddingMember = false;
            // if adding failed, remove the temporary row
            this.members = this.members.filter(m => m !== tempMember);
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

  toggleCaptainStatus(member: { _id: string; name: string; captain: boolean; role: string, isNew?: boolean }) {
    if (member.isNew) return;
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
    this.http.patch(`${environment.apiUrl}/users/${member._id}`, {
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

  removeMember(member: any) {
    if (member.isNew) {
      this.members = this.members.filter(m => m !== member);
      return;
    }

    const memberId = member._id;
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      return;
    }

    if (confirm('Are you sure you want to remove this member?')) {
      // First, get the team information
      this.http.get(`${environment.apiUrl}/users/${currentUser._id}`).subscribe({
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
    if (member.isNew) {
      if (field === 'name' && value && value.trim()) {
        this.addNewMember(value.trim(), member);
      }
      return; // Don't update other fields until name is set and member is created
    }

    const updatePayload = { [field]: value };
    this.http.patch(`${environment.apiUrl}/users/${member._id}`, updatePayload).subscribe({
      next: (res) => {
        // Member updated successfully
      },
      error: (err) => {
        console.error(`Failed to update member ${field}:`, err);
        // Optionally revert the change in the UI
        const teamId = this.authService.getCurrentUser()?.team?._id;
        if (teamId) {
          this.loadTeamMembers(teamId);
        }
      }
    });
  }

  updateMemberSkill(member: any, styleName: string, value: number) {
    if (member.isNew) return;

    // Ensure value is a number and style name is lowercase
    const numericValue = Number(value);
    const normalizedStyleName = styleName.toLowerCase();
    
    if (!member.skillLevels) {
      member.skillLevels = {};
    }
    member.skillLevels[normalizedStyleName] = numericValue;

    // Update the user's skill levels using the user update endpoint
    this.http.patch(`${environment.apiUrl}/users/${member._id}`, {
      skillLevels: member.skillLevels
    }).subscribe({
      next: (response) => {
        // Skill levels updated successfully
      },
      error: (error) => {
        console.error('Error updating skill levels:', error);
      }
    });
  }

  updateMemberHeight(member: any, field: 'feet' | 'inches', value: number) {
    if (member.isNew) return;
    
    // Update the local values
    const feet = field === 'feet' ? value : member.feet;
    const inches = field === 'inches' ? value : member.inches;
    
    // Update the height in inches - handle undefined/null values properly
    const feetNum = feet !== undefined && feet !== null ? parseInt(String(feet), 10) : 0;
    const inchesNum = inches !== undefined && inches !== null ? parseInt(String(inches), 10) : 0;
    const totalInches = feetNum * 12 + inchesNum;
    member.height = totalInches;
    
    // Save to backend immediately
    this.http.patch(`${environment.apiUrl}/users/${member._id}`, {
      height: totalInches
    }).subscribe({
      next: (response) => {
        // Height updated successfully
      },
      error: (error) => {
        console.error('Error updating height:', error);
        // Optionally revert the change in the UI
        const teamId = this.authService.getCurrentUser()?.team?._id;
        if (teamId) {
          this.loadTeamMembers(teamId);
        }
      }
    });
  }

  async saveAllMembers(): Promise<any> {
    const requests = this.members.map(member => {
      // Ensure skillLevels is properly structured
      const skillLevels: { [key: string]: number } = {};
      this.styles.forEach(style => {
        const normalizedStyleName = style.name.toLowerCase();
        skillLevels[normalizedStyleName] = Number(member.skillLevels?.[normalizedStyleName]) || 1;
      });
      
      // Calculate height in inches from feet and inches
      const feet = member.feet !== undefined && member.feet !== null ? parseInt(String(member.feet), 10) : 0;
      const inches = member.inches !== undefined && member.inches !== null ? parseInt(String(member.inches), 10) : 0;
      const totalHeightInches = feet * 12 + inches;
      
      const payload: any = {
        name: member.name,
        height: totalHeightInches,
        skillLevels: skillLevels,
        captain: member.captain
      };
      
      return this.http.patch(`${environment.apiUrl}/users/${member._id}`, payload).toPromise();
    });
    
    try {
      const results = await Promise.all(requests);
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

  closeAndSave() {
    this.saveAllMembers().then(() => {
      this.close.emit();
    }).catch((error) => {
      console.error('Error saving members:', error);
    });
  }

  onClose() {
    this.closeAndSave();
  }

  onStyleSelectionChange() {
    // This method is called when the style selector changes
    // The view will automatically update due to the ngModel binding
  }

  getStyleColor(styleName: string): string {
    const style = this.styles.find(s => s.name === styleName);
    return style ? style.color : '#3b82f6'; // Default blue if style not found
  }
} 