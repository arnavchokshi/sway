import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormationsComponent } from './formations/formations';
import { RosterComponent } from './roster/roster';
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
  imports: [CommonModule, FormationsComponent, RosterComponent, FormsModule]
})
export class DashboardComponent implements OnInit {
  isCaptain = false;
  showRosterModal = false;
  showInfoModal = false;
  showSetModal = false;
  team: any = null;
  sets: ISet[] = [];
  segments: any[] = [];
  
  // Set modal properties
  newSetName = '';
  editingSet: ISet | null = null;

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
          this.sets = res.sets.sort((a, b) => a.order - b.order);
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

  addSegmentToSet(setId: string) {
    // For now, redirect to create segment - could be enhanced with a segment picker
    this.router.navigate(['/create-segment'], { queryParams: { setId: setId } });
  }

  goToSegment(segmentId: string) {
    this.router.navigate(['/create-segment'], { queryParams: { id: segmentId } });
  }

  getStyleColor(styleName: string): string {
    // Map style names to colors - this should ideally come from team styles
    const styleColors: { [key: string]: string } = {
      bhangra: '#3b82f6', // blue
      HH: '#ffe14a',      // yellow
      // Add more styles and colors as needed
    };
    return styleColors[styleName] || '#E6E6FA';
  }
}