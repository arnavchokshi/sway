import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TeamService } from '../../services/team.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard-roster',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './roster.html',
  styleUrls: ['./roster.scss']
})
export class RosterComponent implements OnInit {
  members: { name: string; role: string }[] = [];

  constructor(private teamService: TeamService, private authService: AuthService) {}

  isCaptain = false;

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = !!currentUser?.captain;
    if (currentUser?.team?._id) {
      this.teamService.getTeamById(currentUser.team._id).subscribe({
        next: (res) => {
          this.members = (res.team.members || []).map((member: any) => ({
            name: member.name,
            role: member.captain ? 'Captain' : 'Member'
          }));
        },
        error: (err) => {
          this.members = [];
        }
      });
    }
  }

  editRoster() {
    // Open a modal, toggle edit mode, or navigate to an edit page
    // For now, just log to console
    console.log('Edit roster clicked!');
  }
} 