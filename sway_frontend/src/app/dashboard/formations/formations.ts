import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SegmentService } from '../../services/segment.service';
import { AuthService } from '../../services/auth.service';
import { TeamService } from '../../services/team.service';

@Component({
  selector: 'app-formations',
  templateUrl: './formations.html',
  styleUrls: ['./formations.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule]
})
export class FormationsComponent implements OnInit {
  segments: any[] = [];
  isCaptain = false;
  draggingIndex: number | null = null;
  dragOverIndex: number | null = null;

  // Modal state and form fields
  showSegmentModal = false;
  newSegmentName = '';
  newSegmentDepth = 24;
  newSegmentWidth = 32;
  newSegmentStyles: string[] = [];
  teamStyles: any[] = [];
  showAddStyleInput = false;
  newStyleName = '';
  isAddingStyle = false;

  // Mobile detection and modal
  isMobile = false;
  showMobileWarningModal = false;
  pendingSegmentId: string | null = null;

  constructor(
    private segmentService: SegmentService,
    private authService: AuthService,
    private router: Router,
    private teamService: TeamService
  ) {}

  ngOnInit() {
    // Detect mobile devices
    this.isMobile = /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = currentUser?.captain || false;
    this.loadSegments();
  }

  loadSegments() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.segmentService.getSegmentsForTeam(currentUser.team._id).subscribe({
        next: (res) => {
          let segments = [];
          if (this.isCaptain) {
            // Captains can see all segments
            segments = res.segments;
          } else {
            // Non-captains can only see segments they're in
            segments = res.segments.filter(segment => {
              // Check if user is in the roster OR in any formation
              const inRoster = segment.roster?.some((id: any) =>
                id === currentUser._id || id?._id === currentUser._id
              );
              const inFormation = segment.formations?.some((formation: any[]) =>
                formation.some((performer: any) =>
                  performer.user === currentUser._id || performer.user?._id === currentUser._id
                )
              );
              return inRoster || inFormation;
            });
          }
          // Sort by segmentOrder (ascending, fallback to _id for undefined)
          this.segments = segments.sort((a, b) => {
            if (a.segmentOrder !== undefined && b.segmentOrder !== undefined) {
              return a.segmentOrder - b.segmentOrder;
            } else if (a.segmentOrder !== undefined) {
              return -1;
            } else if (b.segmentOrder !== undefined) {
              return 1;
            } else {
              return a._id.localeCompare(b._id);
            }
          });
        },
        error: (err) => {
          console.error('Failed to load segments:', err);
        }
      });
    }
  }

  openSegmentModal() {
    this.showSegmentModal = true;
    this.newSegmentName = '';
    this.newSegmentDepth = 24;
    this.newSegmentWidth = 32;
    this.newSegmentStyles = [];
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

  closeSegmentModal() {
    this.showSegmentModal = false;
  }

  submitSegmentModal() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team) {
      this.segmentService.createSegment(
        currentUser.team._id,
        this.newSegmentName,
        this.newSegmentDepth,
        this.newSegmentWidth,
        3, // divisions removed
        this.newSegmentStyles
      ).subscribe({
          next: (response) => {
          this.loadSegments();
          this.closeSegmentModal();
          this.router.navigate(['/create-segment'], { queryParams: { id: response.segment._id } });
          },
          error: (error) => {
            console.error('Error creating segment:', error);
          }
        });
    } else {
      console.error('No user or team found');
    }
  }

  goToCreateSegment() {
    this.openSegmentModal();
  }

  goToSegment(segmentId: string) {
    // Check if captain is on mobile and show warning
    if (this.isCaptain && this.isMobile) {
      this.pendingSegmentId = segmentId;
      this.showMobileWarningModal = true;
      return;
    }
    
    this.router.navigate(['/create-segment'], { queryParams: { id: segmentId } });
  }

  deleteSegment(segmentId: string) {
    if (!confirm('Are you sure you want to delete this segment?')) return;
    
    // Delete the segment directly - dummy templates will be cleaned up automatically by the backend
    this.segmentService.deleteSegment(segmentId).subscribe({
      next: () => this.loadSegments(),
      error: (err) => alert('Failed to delete segment!')
    });
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

  getStyleColor(styleName: string): string {
    // Try to find the style in teamStyles (which has color info)
    const style = this.teamStyles.find(s => s.name === styleName);
    if (style && style.color) return style.color;
    // Fallback colors for common styles
    const fallback: { [key: string]: string } = {

      // Add more as needed
    };
    return fallback[styleName] || '#E6E6FA';
  }

  onDragStart(event: DragEvent, index: number) {
    if (!this.isCaptain) return;
    this.draggingIndex = index;
    event.dataTransfer?.setData('text/plain', index.toString());
    event.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, index: number) {
    if (!this.isCaptain) return;
    event.preventDefault();
    this.dragOverIndex = index;
  }

  onDrop(event: DragEvent, index: number) {
    if (!this.isCaptain) return;
    event.preventDefault();
    const fromIndex = this.draggingIndex;
    const toIndex = index;
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) {
      this.draggingIndex = null;
      this.dragOverIndex = null;
      return;
    }
    // Move the segment in the array
    const moved = this.segments.splice(fromIndex, 1)[0];
    this.segments.splice(toIndex, 0, moved);
    // Update segmentOrder for all segments
    this.segments.forEach((segment, i) => {
      segment.segmentOrder = i + 1;
    });
    // Persist the new order
    this.saveSegmentOrder();
    this.draggingIndex = null;
    this.dragOverIndex = null;
  }

  onDragEnd() {
    this.draggingIndex = null;
    this.dragOverIndex = null;
  }

  saveSegmentOrder() {
    // Save the new order for all segments
    const updateObservables = this.segments.map((segment, i) => {
      // Always update segmentOrder to match the new order
      return this.segmentService.updateSegment(segment._id, { segmentOrder: i + 1 });
    });
    // Optionally, wait for all to finish before reloading (to ensure backend is in sync)
    Promise.all(updateObservables.map(obs => obs.toPromise?.() ?? obs)).then(() => {
      this.loadSegments(); // Refresh from backend to ensure order is correct
    });
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

  // New methods for mobile warning modal
  closeMobileWarningModal() {
    this.showMobileWarningModal = false;
    this.pendingSegmentId = null;
  }

  viewAsMemeber() {
    // Navigate to segment with viewAsMemember parameter to force member view
    if (this.pendingSegmentId) {
      this.showMobileWarningModal = false;
      this.router.navigate(['/create-segment'], { queryParams: { id: this.pendingSegmentId, viewAsMemeber: 'true' } });
      this.pendingSegmentId = null;
    }
  }
} 