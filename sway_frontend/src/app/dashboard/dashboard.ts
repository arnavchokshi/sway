import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormationsComponent } from './formations/formations';
import { RosterComponent } from './roster/roster';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
  standalone: true,
  imports: [CommonModule, FormationsComponent, RosterComponent]
})
export class DashboardComponent {
  currentView: string = 'formations';
  activeTab: 'formations' | 'roster' = 'formations';

  setView(view: string): void {
    this.currentView = view;
  }
}