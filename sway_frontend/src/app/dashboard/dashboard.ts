import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormationsComponent } from './formations/formations';
import { RosterComponent } from './roster/roster';
import { AuthService } from '../services/auth.service';

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

  constructor(private authService: AuthService) {}

  ngOnInit() {
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = !!currentUser?.captain;
  }
}