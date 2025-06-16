import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormationsComponent } from './formations/formations';
import { RosterComponent } from './roster/roster';
import { AuthService } from '../services/auth.service';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
  standalone: true,
  imports: [CommonModule, FormationsComponent, RosterComponent]
})
export class DashboardComponent implements OnInit {
  isCaptain = false;
  showRosterModal = false;
  team: any = null;
  segment = {
    stylesInSegment: ['bhangra', 'HH']
  };

  constructor(private authService: AuthService, private teamService: TeamService) {}

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = !!currentUser?.captain;
    if (currentUser?.team?._id) {
      this.teamService.getTeamById(currentUser.team._id).subscribe({
        next: (res) => {
          this.team = res.team;
        }
      });
    }
  }

  getStyleColor(style: string): string {
    // Map style names to colors
    const styleColors: { [key: string]: string } = {
      bhangra: '#3b82f6', // blue
      HH: '#ffe14a',      // yellow
      // Add more styles and colors as needed
    };
    return styleColors[style] || '#ccc';
  }
}