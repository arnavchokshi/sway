import { Component, OnInit, HostListener, ChangeDetectorRef } from '@angular/core';
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
  members: { name: string; role: string; _id: string; captain: boolean; skillLevels: { [styleName: string]: number }, height?: string | number, feet?: number, inches?: number, gender?: string, isNew?: boolean, segmentCount?: number, isEditingName?: boolean, originalName?: string }[] = [];
  errorMessage = '';
  styles: (Style & { isNew?: boolean; isEditing?: boolean; originalName?: string })[] = [];
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

  // Height drag states
  isDraggingHeight = false;
  dragStartY = 0;
  dragStartHeight = 0;
  dragMember: any = null;

  constructor(
    private teamService: TeamService, 
    private authService: AuthService, 
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  isCaptain = false;

  // Listen for clicks anywhere on the page to exit edit mode
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: any) {
    // Exit any member name editing
    this.members.forEach(member => {
      if (member.isEditingName) {
        this.finishEditingMemberName(member);
      }
    });
    
    // Exit any style name editing
    this.styles.forEach(style => {
      if (style.isEditing) {
        this.finishEditingStyle(style);
      }
    });
  }

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    
    if (currentUser && currentUser.team && currentUser.team._id) {
      this.loadTeamMembers(currentUser.team._id);
    }
  }

  loadTeamMembers(teamId: string) {
    // Get team data and segments data in parallel
    const teamData$ = this.http.get<any>(`${environment.apiUrl}/teams/${teamId}`);
    const segmentsData$ = this.http.get<any>(`${environment.apiUrl}/segments/${teamId}`);

    forkJoin([teamData$, segmentsData$]).subscribe({
      next: ([teamResponse, segmentsResponse]) => {
        this.members = teamResponse.team.members || [];
        this.styles = teamResponse.team.styles || [];
        
        // Convert height from inches to feet/inches for display
        this.members.forEach(member => {
          if (member.height && typeof member.height === 'number') {
            const feet = Math.floor(member.height / 12);
            const inches = member.height % 12;
            member.feet = feet;
            member.inches = inches;
          }
          
          // Calculate segment count for each member
          member.segmentCount = this.calculateMemberSegmentCount(member._id, segmentsResponse.segments || []);
        });
        
        // Skill levels are already included in the team members data
      },
      error: (err) => {
        console.error('Error loading segments:', err);
        // Fallback to just team data if segments endpoint fails
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
                
                // Set default segment count if we can't fetch segments
                member.segmentCount = 0;
          });
        },
        error: (err) => {
          alert('Failed to load team members: ' + (err.error?.error || err.message));
        }
      });
      }
    });
  }

  // Calculate how many segments a member is assigned to
  private calculateMemberSegmentCount(memberId: string, segments: any[]): number {
    if (!segments || segments.length === 0) return 0;
    
    return segments.filter(segment => {
      // Check if user is in the segment's roster
      const isInRoster = segment.roster && segment.roster.some((rosterId: string) => rosterId === memberId);
      
      // Check if user appears in any formation positions
      const isInFormations = segment.formations && segment.formations.some((formation: any[]) => 
        formation.some((position: any) => position.user && position.user.toString() === memberId)
      );
      
      return isInRoster || isInFormations;
    }).length;
  }

  // Stats methods
  getCaptainCount(): number {
    return this.members.filter(m => m.captain).length;
  }

  getAverageSegmentsPerPerformer(): string {
    if (this.members.length === 0) return '0';
    
    const totalSegments = this.members.reduce((acc, member) => {
      return acc + this.getMemberSegmentCount(member);
    }, 0);
    
    return (totalSegments / this.members.length).toFixed(1);
  }

  getMemberSegmentCount(member: any): number {
    // For now, return the number of segments from member data
    // This would typically come from the backend with segment assignments
    return member.segmentCount || 0;
  }

  getAverageRating(member: any): string {
    const ratings = Object.values(member.skillLevels || {}) as number[];
    if (ratings.length === 0) return '0';
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  }

  // Style management
  addBlankStyle() {
    const blankStyle = {
      name: '',
      color: '#3B82F6', // Default blue color
      isNew: true
    };

    // Add to the end of the styles array
    this.styles.push(blankStyle);
  }

  saveNewStyle(style: any) {
    if (!style.name.trim()) {
      this.errorMessage = 'Please enter a style name';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.addStyle(currentUser.team._id, { name: style.name.trim(), color: style.color }).subscribe({
      next: (res) => {
        this.styles = res.team.styles;
        this.errorMessage = '';
      },
      error: (err) => {
        this.errorMessage = 'Failed to add style';
      }
    });
  }

  cancelNewStyle(style: any) {
    const index = this.styles.findIndex(s => s === style);
    if (index > -1) {
      this.styles.splice(index, 1);
    }
  }

  startEditingStyle(style: any, index: number) {
    if (style.isNew) return; // Don't edit new styles

    // First, exit any other editing styles
    this.styles.forEach(s => {
      if (s.isEditing && s !== style) {
        this.finishEditingStyle(s);
      }
    });

    style.isEditing = true;
    style.originalName = style.name;
    
    // Force the styles array to be detected as changed
    this.styles = [...this.styles];
    
    // Force change detection and focus the input after the view updates
    this.cdr.detectChanges();
    setTimeout(() => {
      const inputId = `style-name-input-${index}`;
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 10);
  }

  saveEditedStyle(style: any, index: number) {
    if (!style.name.trim()) {
      return; // Don't save empty names, but don't show error either
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.updateStyle(currentUser.team._id, index, { name: style.name.trim(), color: style.color }).subscribe({
      next: (res) => {
        this.styles = res.team.styles;
        this.errorMessage = '';
      },
      error: (err) => {
        this.errorMessage = 'Failed to update style';
        // Revert the name if save failed
        style.name = style.originalName;
      }
    });
  }

  finishEditingStyle(style: any) {
    style.isEditing = false;
    delete style.originalName;
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

  // Add blank member inline
  addBlankMember() {
    const blankMember = {
      _id: 'temp_' + Date.now(), // Temporary ID
      name: '',
      role: '',
      captain: false,
      skillLevels: {},
      feet: 5,
      inches: 6,
      isNew: true // Flag to indicate this is a new member being created
    };

    // Add to the beginning of the array
    this.members.unshift(blankMember);
  }

  // Save the new member to the backend
  saveNewMember(member: any) {
    if (!member.name.trim()) {
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
        this.teamService.addTeamMember(teamId, member.name.trim()).subscribe({
          next: (res) => {
            this.loadTeamMembers(teamId);
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

  // Cancel adding new member
  cancelNewMember(member: any) {
    const index = this.members.findIndex(m => m._id === member._id);
    if (index > -1) {
      this.members.splice(index, 1);
    }
  }

  // Update skill level directly in member card
  updateMemberSkill(member: any, styleName: string, rating: number) {
    if (!member.skillLevels) {
      member.skillLevels = {};
    }
    
    member.skillLevels[styleName.toLowerCase()] = rating;

    // Save to backend if not a new member
    if (!member.isNew) {
      this.saveMemberSkillUpdate(member);
    }
  }

  // Toggle captain status directly in member card
  toggleCaptainStatus(member: any) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    // Check captain constraints before toggling
    if (!member.captain) {
      // Making them captain - this is allowed
      member.captain = true;
    } else {
      // Removing captain status - check if they're the last captain
      const captainCount = this.members.filter(m => m.captain).length;
      if (captainCount <= 1) {
        this.errorMessage = 'There must be at least one captain on the team';
        return;
      }
      member.captain = false;
    }

    // Save to backend if not a new member
    if (!member.isNew) {
      this.saveMemberUpdate(member);
    }
  }

  // Start editing member name
  startEditingMemberName(member: any) {
    if (member.isNew) {
      return; // Don't edit new member names
    }

    // First, exit any other editing members
    this.members.forEach(m => {
      if (m.isEditingName && m !== member) {
        this.finishEditingMemberName(m);
      }
    });

    // Update the member properties
    member.isEditingName = true;
    member.originalName = member.name;
    
    // Force the members array to be detected as changed
    this.members = [...this.members];
    
    // Force change detection and focus the input after the view updates
    this.cdr.detectChanges();
    setTimeout(() => {
      const inputId = `member-name-input-${member._id}`;
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 10);
  }

  // Save edited member name
  saveEditedMemberName(member: any) {
    if (!member.name.trim()) {
      return; // Don't save empty names
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.teamService.updateUser(member._id, {
      name: member.name.trim()
    }).subscribe({
      next: (res: any) => {
        this.errorMessage = '';
      },
      error: (err: any) => {
        console.error('Error updating member name:', err);
        this.errorMessage = 'Failed to update member name';
        // Revert the name if save failed
        member.name = member.originalName;
      }
    });
  }

  // Finish editing member name
  finishEditingMemberName(member: any) {
    member.isEditingName = false;
    delete member.originalName;
  }

  // Adjust input width as user types
  adjustInputWidth(event: any) {
    const input = event.target;
    const value = input.value || '';
    // Set width based on content length (ch unit = character width)
    input.style.width = Math.max(value.length + 1, 3) + 'ch';
  }

  // Save member skill update to backend
  private saveMemberSkillUpdate(member: any) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    // Update member skills via user API
    this.teamService.updateUser(member._id, {
      skillLevels: member.skillLevels
    }).subscribe({
      next: (res: any) => {
        this.errorMessage = '';
      },
      error: (err: any) => {
        console.error('Error updating member skills:', err);
        this.errorMessage = 'Failed to update member skills';
        // Reload to get the correct state
        this.loadTeamMembers(currentUser.team._id);
      }
    });
  }

  // Save member update to backend
  private saveMemberUpdate(member: any) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    // Update captain status and skills
    const updatePromises = [
      this.teamService.updateMemberRole(currentUser.team._id, member._id, member.captain),
      this.teamService.updateUser(member._id, { skillLevels: member.skillLevels })
    ];

    forkJoin(updatePromises).subscribe({
      next: (results: any[]) => {
        this.errorMessage = '';
      },
      error: (err: any) => {
        console.error('Error updating member:', err);
        this.errorMessage = 'Failed to update member';
        // Reload to get the correct state
        this.loadTeamMembers(currentUser.team._id);
      }
    });
  }

  // Height drag functionality
  startHeightDrag(event: MouseEvent, member: any) {
    if (member.isNew) return; // Don't allow height changes for new members
    
    event.preventDefault();
    this.isDraggingHeight = true;
    this.dragStartY = event.clientY;
    this.dragStartHeight = (member.feet || 5) * 12 + (member.inches || 6);
    this.dragMember = member;

    // Add global mouse event listeners
    document.addEventListener('mousemove', this.onHeightDrag.bind(this));
    document.addEventListener('mouseup', this.endHeightDrag.bind(this));
    
    // Add visual feedback class
    document.body.classList.add('height-dragging');
  }

  onHeightDrag(event: MouseEvent) {
    if (!this.isDraggingHeight || !this.dragMember) return;

    event.preventDefault();
    
    // Calculate height change (1 pixel = 0.1 inches for sensitivity)
    const deltaY = this.dragStartY - event.clientY; // Inverted: drag up = increase height
    const heightChange = Math.round(deltaY * 0.1); // 0.1 inches per pixel
    
    let newHeightInches = this.dragStartHeight + heightChange;
    
    // Constrain height between 4'0" and 7'0"
    newHeightInches = Math.max(48, Math.min(84, newHeightInches));
    
    // Convert to feet and inches
    const feet = Math.floor(newHeightInches / 12);
    const inches = newHeightInches % 12;
    
    // Update the member's height
    this.dragMember.feet = feet;
    this.dragMember.inches = inches;
    this.dragMember.height = newHeightInches;
  }

  endHeightDrag(event: MouseEvent) {
    if (!this.isDraggingHeight || !this.dragMember) return;

    // Save the height change to backend
    this.saveHeightUpdate(this.dragMember);

    // Clean up
    this.isDraggingHeight = false;
    this.dragMember = null;
    document.body.classList.remove('height-dragging');
    
    // Remove global event listeners
    document.removeEventListener('mousemove', this.onHeightDrag.bind(this));
    document.removeEventListener('mouseup', this.endHeightDrag.bind(this));
  }

  // Save height update to backend
  private saveHeightUpdate(member: any) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    const heightInInches = (member.feet || 5) * 12 + (member.inches || 6);

    this.teamService.updateUser(member._id, {
      height: heightInInches
    }).subscribe({
      next: (res: any) => {
        this.errorMessage = '';
      },
      error: (err: any) => {
        console.error('Error updating member height:', err);
        this.errorMessage = 'Failed to update member height';
        // Reload to get the correct state
        this.loadTeamMembers(currentUser.team._id);
      }
    });
  }

  // Single member add (keeping for backward compatibility with modal if needed)
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