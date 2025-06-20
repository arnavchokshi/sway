import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-create-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-roster.html',
  styleUrl: './create-roster.scss'
})
export class CreateRoster implements OnInit {
  columns = ['name']; // Only 'name'
  members: Record<string, any>[] = [{}];

  constructor(
    private http: HttpClient, 
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Initialize any additional setup if needed
  }

  addMember() {
    this.members.push({});
  }

  removeMember(index: number) {
    this.members.splice(index, 1);
  }

  submitRoster() {
    const teamId = localStorage.getItem('teamId'); // Save this after team creation
    if (!teamId) {
      alert('No team ID found. Please create a team first.');
      return;
    }

    this.http.post(`${environment.apiUrl}/bulk-users`, {
      team: teamId,
      users: this.members
    }).subscribe({
      next: (response: any) => {
        alert('Roster submitted!');
        // Store the first user as the current user
        if (response.users && response.users.length > 0) {
          const firstUser = response.users[0];
          this.authService.setCurrentUser({
            _id: firstUser._id,
            name: firstUser.name,
            team: {
              _id: teamId,
              name: localStorage.getItem('teamName') || ''
            },
            captain: true // Since this is the team creator
          });
        }
      },
      error: (err) => alert('Error: ' + err.error?.error || err.message)
    });
  }

  goToSignIn(member: any) {
    // Store the selected member in localStorage or a service
    localStorage.setItem('selectedMember', JSON.stringify(member));
    this.router.navigate(['/sign-in']);
  }

  goToDashboard() {
    // Get the current user from AuthService
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      // If no user is set, try to get the team info and set a default user
      const teamId = localStorage.getItem('teamId');
      const teamName = localStorage.getItem('teamName');
      if (teamId && teamName) {
        this.authService.setCurrentUser({
          _id: 'temp-id', // This will be updated when they sign in
          name: 'Team Captain',
          team: {
            _id: teamId,
            name: teamName
          },
          captain: true
        });
      }
    }
    this.router.navigate(['/dashboard']);
  }
}
