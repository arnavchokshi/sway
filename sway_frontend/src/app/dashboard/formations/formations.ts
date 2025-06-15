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

  // Modal state and form fields
  showSegmentModal = false;
  newSegmentName = '';
  newSegmentDepth = 24;
  newSegmentWidth = 32;
  newSegmentStyles: string[] = [];
  teamStyles: any[] = [];

  constructor(
    private segmentService: SegmentService,
    private authService: AuthService,
    private router: Router,
    private teamService: TeamService
  ) {}

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = currentUser?.captain || false;
    this.loadSegments();
  }

  loadSegments() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.segmentService.getSegmentsForTeam(currentUser.team._id).subscribe({
        next: (res) => {
          if (this.isCaptain) {
            // Captains can see all segments
            this.segments = res.segments;
          } else {
            // Non-captains can only see segments they're in
            this.segments = res.segments.filter(segment => {
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
        0, // divisions removed
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
    this.router.navigate(['/create-segment'], { queryParams: { id: segmentId } });
  }

  deleteSegment(segmentId: string) {
    if (!confirm('Are you sure you want to delete this segment?')) return;
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
} 