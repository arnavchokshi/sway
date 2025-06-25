import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TeamService, Style } from '../services/team.service';
import { AuthService } from '../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { environment } from '../../environments/environment';

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
  selector: 'app-edit-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-roster.component.html',
  styleUrls: ['./edit-roster.component.scss']
})
export class EditRosterComponent implements OnInit {
  members: { name: string; role: string; _id: string; captain: boolean; skillLevels: { [styleName: string]: number }, height?: string | number, feet?: number, inches?: number, gender?: string, isNew?: boolean }[] = [];
  errorMessage = '';
  styles: Style[] = [];
  newStyle: Style = { name: '', color: '#000000' };
  editingStyleIndex: number | null = null;
  selectedStyleForSkills: string = '';

  // UI State
  isAddingStyle = false;
  showSingleAddDialog = false;
  showBulkAddDialog = false;
  
  // Single member add
  singleMemberName = '';
  
  // Bulk add states
  bulkAddTab: 'text' | 'quick' = 'text';
  bulkAddText = '';
  quickAddCount = 5;
  quickAddNames: string[] = Array(5).fill('');
  
  // Edit member states
  editingMember: any = null;
  editMemberTab: 'basic' | 'skills' = 'basic';

  constructor(
    private teamService: TeamService, 
    private authService: AuthService, 
    private http: HttpClient,
    private router: Router
  ) {}

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

  // Stats methods
  getCaptainCount(): number {
    return this.members.filter(m => m.captain).length;
  }

  getAverageSkillRating(): string {
    if (this.members.length === 0) return '0';
    
    const totalAverage = this.members.reduce((acc, member) => {
      return acc + parseFloat(this.getAverageRating(member));
    }, 0);
    
    return (totalAverage / this.members.length).toFixed(1);
  }

  getAverageRating(member: any): string {
    const ratings = Object.values(member.skillLevels || {}) as number[];
    if (ratings.length === 0) return '0';
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  }

  // Style management
  addStyle() {
    if (!this.newStyle.name.trim()) {
      this.errorMessage = 'Please enter a style name';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.addStyle(currentUser.team._id, this.newStyle).subscribe({
      next: (res) => {
        this.styles = res.team.styles;
        this.newStyle = { name: '', color: '#000000' };
        this.isAddingStyle = false;
        this.errorMessage = '';
      },
      error: (err) => {
        this.errorMessage = 'Failed to add style';
      }
    });
  }

  deleteStyle(index: number) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.deleteStyle(currentUser.team._id, index).subscribe({
      next: (res) => {
        this.styles = res.team.styles;
        this.errorMessage = '';
      },
      error: (err) => {
        this.errorMessage = 'Failed to delete style';
      }
    });
  }

  cancelAddStyle() {
    this.isAddingStyle = false;
    this.newStyle = { name: '', color: '#000000' };
  }

  // Single member add
  addSingleMember() {
    if (!this.singleMemberName.trim()) {
      this.errorMessage = 'Please enter a member name';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      return;
    }

    // Get the team information
    this.http.get(`${environment.apiUrl}/users/${currentUser._id}`).subscribe({
      next: (userResponse: any) => {
        const teamId = userResponse.team?._id;
        if (!teamId) {
          this.errorMessage = 'No team found for current user';
          return;
        }

        // Create the new user and add them to the team
        this.teamService.addTeamMember(teamId, this.singleMemberName.trim()).subscribe({
          next: (res) => {
            this.loadTeamMembers(teamId);
            this.singleMemberName = '';
            this.showSingleAddDialog = false;
            this.errorMessage = '';
          },
          error: (err) => {
            console.error('Error adding member:', err);
            this.errorMessage = err.error?.message || 'Failed to add member';
          }
        });
      },
      error: (err) => {
        console.error('Error getting user data:', err);
        this.errorMessage = 'Failed to get user data';
      }
    });
  }

  // Bulk add methods
  getBulkAddCount(): number {
    return this.bulkAddText
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0).length;
  }

  addMembersFromText() {
    const names = this.bulkAddText
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (names.length === 0) return;

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      return;
    }

    this.http.get(`${environment.apiUrl}/users/${currentUser._id}`).subscribe({
      next: (userResponse: any) => {
        const teamId = userResponse.team?._id;
        if (!teamId) {
          this.errorMessage = 'No team found for current user';
          return;
        }

        // Add members one by one
        const addPromises = names.map(name => 
          this.teamService.addTeamMember(teamId, name).toPromise()
        );

        Promise.all(addPromises).then(() => {
          this.loadTeamMembers(teamId);
          this.bulkAddText = '';
          this.showBulkAddDialog = false;
          this.errorMessage = '';
        }).catch(err => {
          console.error('Error adding members:', err);
          this.errorMessage = 'Failed to add some members';
        });
      }
    });
  }

  updateQuickAddNames() {
    this.quickAddNames = Array(this.quickAddCount).fill('');
  }

  getValidQuickAddCount(): number {
    return this.quickAddNames.filter(name => name.trim().length > 0).length;
  }

  addMembersFromQuickAdd() {
    const validNames = this.quickAddNames.filter(name => name.trim().length > 0);
    if (validNames.length === 0) return;

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      this.errorMessage = 'No user found';
      return;
    }

    this.http.get(`${environment.apiUrl}/users/${currentUser._id}`).subscribe({
      next: (userResponse: any) => {
        const teamId = userResponse.team?._id;
        if (!teamId) {
          this.errorMessage = 'No team found for current user';
          return;
        }

        // Add members one by one
        const addPromises = validNames.map(name => 
          this.teamService.addTeamMember(teamId, name.trim()).toPromise()
        );

        Promise.all(addPromises).then(() => {
          this.loadTeamMembers(teamId);
          this.quickAddNames = Array(this.quickAddCount).fill('');
          this.showBulkAddDialog = false;
          this.errorMessage = '';
        }).catch(err => {
          console.error('Error adding members:', err);
          this.errorMessage = 'Failed to add some members';
        });
      }
    });
  }

  // Edit member methods
  openEditMemberDialog(member: any) {
    this.editingMember = { ...member };
    this.editMemberTab = 'basic';
  }

  closeEditMemberDialog() {
    this.editingMember = null;
  }

  updateEditingMemberSkill(styleName: string, rating: number) {
    if (!this.editingMember) return;
    
    if (!this.editingMember.skillLevels) {
      this.editingMember.skillLevels = {};
    }
    
    this.editingMember.skillLevels[styleName.toLowerCase()] = rating;
  }

  saveEditingMember() {
    if (!this.editingMember) return;

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) {
      this.errorMessage = 'No team found';
      return;
    }

    // Check captain constraints
    if (this.editingMember.captain !== this.members.find(m => m._id === this.editingMember._id)?.captain) {
      if (!this.editingMember.captain) {
        const captainCount = this.members.filter(m => m.captain).length;
        if (captainCount <= 1) {
          this.errorMessage = 'There must be at least one captain';
          return;
        }
      }
    }

    // Calculate height in inches
    const heightInInches = (this.editingMember.feet || 0) * 12 + (this.editingMember.inches || 0);

    const updateData = {
      name: this.editingMember.name,
      captain: this.editingMember.captain,
      height: heightInInches,
      skillLevels: this.editingMember.skillLevels || {}
    };

    this.http.patch(`${environment.apiUrl}/users/${this.editingMember._id}`, updateData).subscribe({
      next: (res) => {
        this.loadTeamMembers(currentUser.team._id);
        this.closeEditMemberDialog();
        this.errorMessage = '';
      },
      error: (err) => {
        console.error('Error updating member:', err);
        this.errorMessage = 'Failed to update member';
      }
    });
  }

  // Remove member
  removeMember(member: any) {
    if (member.captain) {
      const captainCount = this.members.filter(m => m.captain).length;
      if (captainCount <= 1) {
        this.errorMessage = 'Cannot remove the last captain';
        return;
      }
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) {
      this.errorMessage = 'No team found';
      return;
    }

    this.teamService.removeTeamMember(currentUser.team._id, member._id).subscribe({
      next: (res: any) => {
        this.loadTeamMembers(currentUser.team._id);
        this.errorMessage = '';
      },
      error: (err: any) => {
        console.error('Error removing member:', err);
        this.errorMessage = 'Failed to remove member';
      }
    });
  }

  navigateBack() {
    this.router.navigate(['/dashboard']);
  }
} 