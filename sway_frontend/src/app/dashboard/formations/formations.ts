import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SegmentService } from '../../services/segment.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-formations',
  templateUrl: './formations.html',
  styleUrls: ['./formations.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule]
})
export class FormationsComponent implements OnInit {
  segments: any[] = [];

  // Modal state and form fields
  showSegmentModal = false;
  newSegmentName = '';
  newSegmentDepth = 24;
  newSegmentWidth = 32;
  newSegmentDivisions = 3;

  constructor(
    private segmentService: SegmentService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadSegments();
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

  openSegmentModal() {
    this.showSegmentModal = true;
    this.newSegmentName = '';
    this.newSegmentDepth = 24;
    this.newSegmentWidth = 32;
    this.newSegmentDivisions = 3;
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
        this.newSegmentDivisions
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
} 