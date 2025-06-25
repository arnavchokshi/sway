import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { TeamService } from '../services/team.service';
import { SetService, ISet } from '../services/set.service';
import { SegmentService } from '../services/segment.service';
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
  
  // Drag and drop state
  draggingSegmentIndex: number | null = null;
  draggingSetId: string | null = null;
  draggingSegmentId: string | null = null;
  dragOverIndex: number | null = null;
  dragOverSetId: string | null = null;

  segment = {
    stylesInSegment: ['bhangra', 'HH']
  };

  constructor(
    private authService: AuthService, 
    private teamService: TeamService,
    private setService: SetService,
    private segmentService: SegmentService,
    private router: Router
  ) {}

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = !!currentUser?.captain;
    if (currentUser?.team?._id) {
      this.teamService.getTeamById(currentUser.team._id).subscribe({
        next: (res) => {
          this.team = res.team;
        }
      });
      this.loadSets();
      this.loadSegments();
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
      this.segmentService.getSegmentsForTeam(currentUser.team._id).subscribe({
        next: (res) => {
          this.segments = res.segments;
        },
        error: (err) => {
          console.error('Failed to load segments:', err);
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
    return segments.reduce((total, segment) => total + this.getSegmentDuration(segment), 0);
  }

  getSegmentDuration(segment: any): number {
    // Calculate total duration from formation durations
    if (segment.formationDurations && segment.formationDurations.length > 0) {
      return segment.formationDurations.reduce((total: number, duration: number) => total + duration, 0);
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
    
    this.router.navigate(['/create-segment'], { queryParams: { id: segmentId } });
  }

  deleteSegment(segmentId: string) {
    if (!confirm('Are you sure you want to delete this segment?')) return;
    
    this.segmentService.deleteSegment(segmentId).subscribe({
      next: () => {
        this.loadSegments();
        this.loadSets(); // Reload sets to update segment references
      },
      error: (err) => {
        console.error('Failed to delete segment:', err);
        alert('Failed to delete segment!');
      }
    });
  }

  getStyleColor(styleName: string): string {
    // Map style names to vibrant colors
    const styleColors: { [key: string]: string } = {
      // Hip Hop variations
      'hip hop': '#FF6B35',        // Vibrant orange
      'hiphop': '#FF6B35',         // Vibrant orange
      'HH': '#FF6B35',             // Vibrant orange
      'hip-hop': '#FF6B35',        // Vibrant orange
      
      // Bhangra variations
      'bhangra': '#F7931E',        // Golden orange
      'punjabi': '#F7931E',        // Golden orange
      
      // Contemporary/Modern
      'contemporary': '#9B59B6',   // Purple
      'modern': '#8E44AD',         // Dark purple
      'lyrical': '#BB8FCE',        // Light purple
      
      // Jazz styles
      'jazz': '#E74C3C',           // Red
      'jazz funk': '#C0392B',      // Dark red
      'commercial': '#EC7063',     // Light red
      
      // Latin styles
      'latin': '#F39C12',          // Orange
      'salsa': '#E67E22',          // Dark orange
      'bachata': '#F8C471',        // Light orange
      'reggaeton': '#D68910',      // Amber
      
      // Bollywood styles
      'bollywood': '#E91E63',      // Pink
      'classical': '#AD1457',      // Dark pink
      'folk': '#F06292',           // Light pink
      
      // Street styles
      'breaking': '#2ECC71',       // Green
      'bboy': '#27AE60',           // Dark green
      'bgirl': '#58D68D',          // Light green
      'popping': '#16A085',        // Teal
      'locking': '#48C9B0',        // Light teal
      
      // Ballroom
      'ballroom': '#3498DB',       // Blue
      'waltz': '#2980B9',          // Dark blue
      'tango': '#5DADE2',          // Light blue
      
      // Cultural styles
      'african': '#A569BD',        // Violet
      'caribbean': '#52C0F5',      // Sky blue
      'korean': '#FF5722',         // Deep orange
      'kpop': '#FF8A65',           // Light orange
      
      // Other popular styles
      'acro': '#795548',           // Brown
      'musical theatre': '#607D8B', // Blue grey
      'tap': '#455A64',            // Dark blue grey
      'ballet': '#FCE4EC',         // Very light pink
      'lyra': '#4CAF50',           // Light green
      'pole': '#9C27B0',           // Deep purple
      
      // Default categories
      'fusion': '#FF9800',         // Amber
      'experimental': '#00BCD4',   // Cyan
      'freestyle': '#CDDC39',      // Lime
    };
    
    // Convert to lowercase for case-insensitive matching
    const lowerStyleName = styleName.toLowerCase();
    return styleColors[lowerStyleName] || '#6366F1'; // Default to indigo if not found
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
}