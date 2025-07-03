import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { TeamService } from '../services/team.service';
import { SetService, ISet } from '../services/set.service';
import { SegmentService } from '../services/segment.service';
import { LimitsService, LimitsStatus } from '../services/limits.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class DashboardComponent implements OnInit {
  isCaptain = false;
  showInfoModal = false;
  showSetModal = false;
  showSegmentModal = false;
  team: any = null;
  sets: ISet[] = [];
  segments: any[] = [];
  
  // Set modal properties
  newSetName = '';
  editingSet: ISet | null = null;
  
  // Segment modal properties
  newSegmentName = '';
  newSegmentDepth = 24;
  newSegmentWidth = 32;
  newSegmentDivisions = 3;
  newSegmentIsPublic = true;
  newSegmentStyles: string[] = [];
  teamStyles: any[] = [];
  showAddStyleInput = false;
  newStyleName = '';
  isAddingStyle = false;
  currentSetId: string | null = null;
  
  // UI state
  activeSetMenu: string | null = null;
  
  // Mobile detection and modal
  isMobile = false;
  showMobileWarningModal = false;
  pendingSegmentId: string | null = null;
  
  // Drag and drop state
  draggingSegmentIndex: number | null = null;
  draggingSetId: string | null = null;
  draggingSegmentId: string | null = null;
  dragOverIndex: number | null = null;
  dragOverSetId: string | null = null;

  segment = {
    name: '',
    depth: 24,
    width: 32,
    divisions: 3,
    isPublic: true,
    stylesInSegment: []
  };

  currentUser: any = null;
  showProfileDropdown = false;
  
  // Limits and violations
  limitsStatus: LimitsStatus | null = null;
  showLimitsViolationModal = false;
  limitsModalReason: 'roster' | 'segment' | 'set' = 'roster';
  limitsModalTargetName: string | null = null;

  // Delete confirmation state
  private deleteConfirmationTimeout: any = null;
  isDeleteConfirming: boolean = false;
  segmentToDelete: string | null = null;

  constructor(
    private authService: AuthService, 
    private teamService: TeamService,
    private setService: SetService,
    private segmentService: SegmentService,
    public limitsService: LimitsService,
    private router: Router
  ) {}

  ngOnInit() {
    // Detect mobile devices
    this.isMobile = /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    this.currentUser = this.authService.getCurrentUser();
    this.isCaptain = !!this.currentUser?.captain;
    if (this.currentUser?.team?._id) {
      this.teamService.getTeamById(this.currentUser.team._id).subscribe({
        next: (res) => {
          this.team = res.team;
          // Set teamId in localStorage for membership plan page
          if (res.team && res.team._id) {
            localStorage.setItem('teamId', res.team._id);
          }
        }
      });
      this.loadSets();
      this.loadSegments();
      
      // Check limits status
      this.checkLimitsStatus();
    }
  }

  loadSets() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.setService.getSetsForTeam(currentUser.team._id).subscribe({
        next: (res) => {
          this.sets = res.sets;
        },
        error: (err) => {
          console.error('Failed to load sets:', err);
        }
      });
    }
  }

  loadSegments() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.segmentService.getVisibleSegmentsForTeam(currentUser.team._id, currentUser._id).subscribe({
        next: (res) => {
          this.segments = res.segments;
        },
        error: (err) => {
          console.error('Failed to load segments:', err);
          // Fallback to the old method if the new endpoint fails
          this.segmentService.getSegmentsForTeam(currentUser.team._id).subscribe({
            next: (fallbackRes) => {
              if (this.isCaptain) {
                this.segments = fallbackRes.segments;
              } else {
                this.segments = fallbackRes.segments.filter(segment => segment.isPublic === true);
              }
            },
            error: (fallbackErr) => {
              console.error('Failed to load segments with fallback:', fallbackErr);
            }
          });
        }
      });
    }
  }

  getSegmentsForSet(setId: string): any[] {
    const set = this.sets.find(s => s._id === setId);
    if (!set) return [];
    
    // Return segments in the order they appear in the set
    return set.segments.map(segmentId => 
      this.segments.find(segment => segment._id === segmentId)
    ).filter(segment => segment !== undefined);
  }

  getTotalDuration(setId: string): number {
    const segments = this.getSegmentsForSet(setId);
    const total = segments.reduce((total, segment) => total + this.getSegmentDuration(segment), 0);
    return Math.round(total * 10) / 10; // Round to nearest tenth
  }

  getSegmentDuration(segment: any): number {
    // Calculate total duration from formation durations
    if (segment.formationDurations && segment.formationDurations.length > 0) {
      const total = segment.formationDurations.reduce((total: number, duration: number) => total + duration, 0);
      return Math.round(total * 10) / 10; // Round to nearest tenth
    }
    // Fallback to default duration if no formation durations
    return 30; // Default 30 seconds
  }

  toggleSetMenu(setId: string) {
    this.activeSetMenu = this.activeSetMenu === setId ? null : setId;
  }

  previewSegment(segmentId: string) {
    // For now, redirect to the segment view - could be enhanced with a preview modal
    this.router.navigate(['/create-segment'], { queryParams: { id: segmentId, preview: true } });
  }

  openSetModal() {
    this.showSetModal = true;
    this.newSetName = '';
    this.editingSet = null;
  }

  closeSetModal() {
    this.showSetModal = false;
    this.editingSet = null;
  }

  submitSetModal() {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    if (this.editingSet) {
      // Update existing set
      this.setService.updateSet(this.editingSet._id, {
        name: this.newSetName
      }).subscribe({
        next: () => {
          this.loadSets();
          this.closeSetModal();
        },
        error: (err) => {
          console.error('Failed to update set:', err);
        }
      });
    } else {
      // Create new set
      this.setService.createSet(
        currentUser.team._id,
        this.newSetName
      ).subscribe({
        next: () => {
          this.loadSets();
          this.closeSetModal();
        },
        error: (err) => {
          console.error('Failed to create set:', err);
        }
      });
    }
  }

  editSet(setId: string) {
    const set = this.sets.find(s => s._id === setId);
    if (!set) return;

    this.editingSet = set;
    this.newSetName = set.name;
    this.showSetModal = true;
  }

  deleteSet(setId: string) {
    if (!confirm('Are you sure you want to delete this set?')) return;

    this.setService.deleteSet(setId).subscribe({
      next: () => {
        this.loadSets();
      },
      error: (err) => {
        console.error('Failed to delete set:', err);
        alert('Failed to delete set!');
      }
    });
  }

  // Segment Modal Methods
  openSegmentModal(setId?: string) {
    this.showSegmentModal = true;
    this.currentSetId = setId || null;
    this.newSegmentName = '';
    this.newSegmentDepth = 24;
    this.newSegmentWidth = 32;
    this.newSegmentDivisions = 3;
    this.newSegmentIsPublic = true;
    this.newSegmentStyles = [];
    this.loadTeamStyles();
  }

  closeSegmentModal() {
    this.showSegmentModal = false;
    this.currentSetId = null;
  }

  submitSegmentModal() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team) {
      this.segmentService.createSegment(
        currentUser.team._id,
        this.newSegmentName,
        this.newSegmentDepth,
        this.newSegmentWidth,
        this.newSegmentDivisions,
        this.newSegmentStyles,
        this.newSegmentIsPublic,
        undefined, // setId
        currentUser._id // createdBy
      ).subscribe({
        next: (response) => {
          // If we have a currentSetId, add the segment to that set
          if (this.currentSetId) {
            const set = this.sets.find(s => s._id === this.currentSetId);
            if (set) {
              const updatedSegments = [...set.segments, response.segment._id];
              this.setService.updateSet(this.currentSetId, { segments: updatedSegments }).subscribe({
                next: () => {
                  this.loadSets();
                  this.loadSegments();
                  this.closeSegmentModal();
                  this.router.navigate(['/create-segment'], { queryParams: { id: response.segment._id } });
                },
                error: (err) => {
                  console.error('Failed to add segment to set:', err);
                  // Still navigate to the segment even if adding to set failed
                  this.loadSegments();
                  this.closeSegmentModal();
                  this.router.navigate(['/create-segment'], { queryParams: { id: response.segment._id } });
                }
              });
            }
          } else {
            this.loadSegments();
            this.closeSegmentModal();
            this.router.navigate(['/create-segment'], { queryParams: { id: response.segment._id } });
          }
        },
        error: (error) => {
          console.error('Error creating segment:', error);
          alert('Failed to create segment!');
        }
      });
    } else {
      console.error('No user or team found');
    }
  }

  loadTeamStyles() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.teamService.getTeamById(currentUser.team._id).subscribe({
        next: (res) => {
          this.teamStyles = res.team.styles || [];
        },
        error: (err) => {
          this.teamStyles = [];
        }
      });
    }
  }

  isStyleSelected(style: any): boolean {
    return this.newSegmentStyles.includes(style.name);
  }

  toggleStyle(style: any, checked: boolean): void {
    if (checked) {
      if (!this.newSegmentStyles.includes(style.name)) {
        this.newSegmentStyles.push(style.name);
      }
    } else {
      this.newSegmentStyles = this.newSegmentStyles.filter(s => s !== style.name);
    }
  }

  addNewStyle() {
    if (!this.newStyleName.trim() || this.isAddingStyle) return;
    this.isAddingStyle = true;
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;
    // Optionally, you can generate a random color or use a default
    const color = '#6366f1';
    this.teamService.addStyle(currentUser.team._id, { name: this.newStyleName.trim(), color }).subscribe({
      next: (res) => {
        this.teamStyles = res.team.styles || [];
        this.newStyleName = '';
        this.showAddStyleInput = false;
        this.isAddingStyle = false;
      },
      error: (err) => {
        alert('Failed to add style.');
        this.isAddingStyle = false;
      }
    });
  }

  cancelAddStyle() {
    this.showAddStyleInput = false;
    this.newStyleName = '';
  }

  deleteStyle(style: any, event: MouseEvent) {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to delete the style "${style.name}"?`)) return;
    
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;
    
    // Find the index of the style in the teamStyles array
    const styleIndex = this.teamStyles.findIndex(s => s.name === style.name);
    if (styleIndex === -1) {
      alert('Style not found.');
      return;
    }
    
    this.teamService.deleteStyle(currentUser.team._id, styleIndex).subscribe({
      next: (res) => {
        this.teamStyles = res.team.styles || [];
        // Remove from selected styles if it was selected
        this.newSegmentStyles = this.newSegmentStyles.filter(s => s !== style.name);
      },
      error: (err) => {
        alert('Failed to delete style.');
      }
    });
  }

  addSegmentToSet(setId: string) {
    // Open the segment modal with the set context
    this.openSegmentModal(setId);
  }

  goToSegment(segmentId: string) {
    // Prevent navigation if we just finished dragging
    if (this.draggingSegmentIndex !== null) return;
    
    // Check if captain is on mobile and show warning
    if (this.isCaptain && this.isMobile) {
      this.pendingSegmentId = segmentId;
      this.showMobileWarningModal = true;
      return;
    }
    
    this.router.navigate(['/create-segment'], { queryParams: { id: segmentId } });
  }

  deleteSegment(segmentId: string) {
    if (!this.isDeleteConfirming || this.segmentToDelete !== segmentId) {
      // First click - show confirmation
      this.isDeleteConfirming = true;
      this.segmentToDelete = segmentId;
      
      // Set timeout to reset confirmation state after 3 seconds
      if (this.deleteConfirmationTimeout) {
        clearTimeout(this.deleteConfirmationTimeout);
      }
      this.deleteConfirmationTimeout = setTimeout(() => {
        this.isDeleteConfirming = false;
        this.segmentToDelete = null;
      }, 3000);
      return;
    }

    // Second click - actually delete
    this.isDeleteConfirming = false;
    this.segmentToDelete = null;
    if (this.deleteConfirmationTimeout) {
      clearTimeout(this.deleteConfirmationTimeout);
      this.deleteConfirmationTimeout = null;
    }

    this.segmentService.deleteSegment(segmentId).subscribe({
      next: () => {
        this.loadSets();
        this.loadSegments();
        this.checkLimitsStatus();
      },
      error: (err) => {
        console.error('Failed to delete segment:', err);
        alert('Failed to delete segment!');
      }
    });
  }

  getStyleColor(styleName: string): string {
    if (this.team?.styles) {
      const style = this.team.styles.find((s: any) => s.name === styleName);
      return style ? style.color : '#6366f1';
    }
    return '#6366f1';
  }

  // Check if current user is in a segment
  isUserInSegment(segment: any): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id || !segment) return false;
    
    // Check if user is in the roster
    const inRoster = segment.roster?.some((id: any) => 
      id === currentUser._id || id?._id === currentUser._id
    );
    
    // Check if user is in any formation
    const inFormation = segment.formations?.some((formation: any[]) =>
      formation.some((performer: any) =>
        performer.user === currentUser._id || performer.user?._id === currentUser._id
      )
    );
    
    return inRoster || inFormation;
  }

  getSetVisibilityStatus(setId: string): boolean {
    const segments = this.getSegmentsForSet(setId);
    if (segments.length === 0) return true; // Default to public for empty sets
    
    // Return true (public/eye open) if ALL segments are public
    return segments.every(segment => segment.isPublic === true);
  }

  toggleSetVisibility(setId: string) {
    if (!this.isCaptain) return;
    
    const segments = this.getSegmentsForSet(setId);
    if (segments.length === 0) return;
    
    const currentlyAllPublic = this.getSetVisibilityStatus(setId);
    const newVisibility = !currentlyAllPublic;
    
    // Update all segments in the set
    const updatePromises = segments.map(segment => 
      this.segmentService.updateSegmentPrivacy(segment._id, newVisibility).toPromise()
    );
    
    Promise.all(updatePromises).then(() => {
      // Reload segments to reflect changes
      this.loadSegments();
    }).catch(err => {
      console.error('Failed to update segment visibility:', err);
      alert('Failed to update segment visibility!');
    });
  }

  // Drag and Drop Methods
  onSegmentDragStart(event: DragEvent, segmentIndex: number, setId: string, segmentId: string) {
    if (!this.isCaptain) {
      event.preventDefault();
      return;
    }
    
    this.draggingSegmentIndex = segmentIndex;
    this.draggingSetId = setId;
    this.draggingSegmentId = segmentId;
    
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', segmentIndex.toString());
    }
  }

  onSegmentDragOver(event: DragEvent, segmentIndex: number, setId: string) {
    if (!this.isCaptain || this.draggingSetId !== setId) return;
    
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    
    this.dragOverIndex = segmentIndex;
    this.dragOverSetId = setId;
  }

  onSegmentDrop(event: DragEvent, targetIndex: number, setId: string) {
    if (!this.isCaptain || this.draggingSetId !== setId) return;
    
    event.preventDefault();
    
    const sourceIndex = this.draggingSegmentIndex;
    if (sourceIndex === null || sourceIndex === targetIndex) {
      this.onSegmentDragEnd();
      return;
    }

    // Get the current set
    const set = this.sets.find(s => s._id === setId);
    if (!set) {
      this.onSegmentDragEnd();
      return;
    }

    // Create a new segments array with the reordered segments
    const newSegments = [...set.segments];
    const draggedSegmentId = newSegments[sourceIndex];
    
    // Remove the dragged segment from its original position
    newSegments.splice(sourceIndex, 1);
    
    // Insert it at the new position
    newSegments.splice(targetIndex, 0, draggedSegmentId);

    // Update the set with the new segment order
    this.setService.updateSet(setId, { segments: newSegments }).subscribe({
      next: () => {
        this.loadSets();
        this.onSegmentDragEnd();
      },
      error: (err) => {
        console.error('Failed to update segment order:', err);
        alert('Failed to update segment order!');
        this.onSegmentDragEnd();
      }
    });
  }

  onSegmentDragEnd() {
    this.draggingSegmentIndex = null;
    this.draggingSetId = null;
    this.draggingSegmentId = null;
    this.dragOverIndex = null;
    this.dragOverSetId = null;
  }

  toggleSegmentPrivacy(segmentId: string, currentPrivacy: boolean) {
    const newPrivacy = !currentPrivacy;
    
    this.segmentService.updateSegmentPrivacy(segmentId, newPrivacy).subscribe({
      next: () => {
        // Update only the local segment data without affecting set-level indicators
        const segment = this.segments.find(s => s._id === segmentId);
        if (segment) {
          segment.isPublic = newPrivacy;
        }
      },
      error: (err) => {
        console.error('Failed to update segment privacy:', err);
        alert('Failed to update segment privacy!');
      }
    });
  }

  navigateToEditRoster() {
    this.router.navigate(['/edit-roster']);
  }

  // Mobile warning modal methods
  closeMobileWarningModal() {
    this.showMobileWarningModal = false;
    this.pendingSegmentId = null;
  }

  viewAsMemeber() {
    // Navigate to segment with viewAsMemeber parameter to force member view
    if (this.pendingSegmentId) {
      this.showMobileWarningModal = false;
      this.router.navigate(['/create-segment'], { queryParams: { id: this.pendingSegmentId, viewAsMemeber: 'true' } });
      this.pendingSegmentId = null;
    }
  }

  // Limits and violations methods
  checkLimitsStatus() {
    if (!this.currentUser?.team?._id) return;
    
    this.limitsService.checkLimitsStatus(this.currentUser.team._id).subscribe({
      next: (status) => {
        this.limitsStatus = status;
        // Only show modal on load if captains or teamMembers are over the limit
        if ((status.violations.captains || status.violations.teamMembers) && !status.isProAccount) {
          this.showLimitsViolationModal = true;
          this.limitsModalReason = 'roster';
        } else {
          this.showLimitsViolationModal = false;
        }
      },
      error: (err) => {
        console.error('Error checking limits status:', err);
      }
    });
  }

  closeLimitsViolationModal() {
    this.showLimitsViolationModal = false;
    this.limitsModalTargetName = null;
  }

  goToEditRoster() {
    this.closeLimitsViolationModal();
    this.router.navigate(['/edit-roster']);
  }

  goToMembershipPlan() {
    this.closeLimitsViolationModal();
    this.router.navigate(['/membership-plan']);
  }

  // Check if a set is accessible (not grayed out due to limits)
  isSetAccessible(set: ISet): boolean {
    if (!this.limitsStatus) return true;
    if (this.limitsStatus.isProAccount) return true;
    // Only block if sets are over the limit
    return !this.limitsStatus.violations.sets;
  }

  // Check if a segment is accessible
  isSegmentAccessible(segment: any): boolean {
    console.log('Checking segment accessibility:');
    console.log('Limits status:', this.limitsStatus);
    console.log('Is pro account:', this.limitsStatus?.isProAccount);
    console.log('Segments violation:', this.limitsStatus?.violations.segments);
    
    if (!this.limitsStatus) {
      console.log('No limits status, allowing access');
      return true;
    }
    if (this.limitsStatus.isProAccount) {
      console.log('Pro account, allowing access');
      return true;
    }
    // Only block if segments are over the limit
    const isAccessible = !this.limitsStatus.violations.segments;
    console.log('Segment accessible:', isAccessible);
    return isAccessible;
  }

  // Handle set click with limits check
  onSetClick(set: ISet) {
    if (!this.isSetAccessible(set)) {
      this.limitsModalReason = 'set';
      this.limitsModalTargetName = set.name;
      this.showLimitsViolationModal = true;
      return;
    }
    // If set is accessible, proceed with adding segment
    this.addSegmentToSet(set._id);
  }

  // Handle segment click with limits check
  onSegmentClick(segment: any) {
    console.log('Segment clicked:', segment.name);
    console.log('Limits status:', this.limitsStatus);
    console.log('Is segment accessible:', this.isSegmentAccessible(segment));
    
    // If limits status is not loaded yet, load it first
    if (!this.limitsStatus) {
      console.log('Limits status not loaded, loading now...');
      this.checkLimitsStatus();
      // Wait a bit and try again
      setTimeout(() => {
        this.onSegmentClick(segment);
      }, 500);
      return;
    }
    
    if (!this.isSegmentAccessible(segment)) {
      console.log('Showing limits violation modal for segment');
      this.limitsModalReason = 'segment';
      this.limitsModalTargetName = segment.name;
      this.showLimitsViolationModal = true;
      return;
    }
    console.log('Proceeding to segment');
    this.goToSegment(segment._id);
  }

  navigateToMembershipPlan() {
    this.router.navigate(['/membership-plan']);
  }

  signOut() {
    // Clear all authentication data
    this.authService.logout();
    
    // Clear any other stored data
    localStorage.removeItem('teamId');
    localStorage.removeItem('selectedMember');
    
    // Redirect to home page
    this.router.navigate(['/']);
  }

  get userInitial(): string {
    return this.currentUser?.name ? this.currentUser.name.charAt(0).toUpperCase() : '?';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile-container')) {
      this.closeProfileDropdown();
    }
  }

  toggleProfileDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.showProfileDropdown = !this.showProfileDropdown;
  }

  closeProfileDropdown() {
    this.showProfileDropdown = false;
  }

  ngOnDestroy() {
    // Clean up timeout when component is destroyed
    if (this.deleteConfirmationTimeout) {
      clearTimeout(this.deleteConfirmationTimeout);
    }
  }
}