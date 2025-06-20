import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-user.html',
  styleUrl: './create-user.scss'
})
export class CreateUser implements OnInit {
  email = '';
  password = '';
  name = '';
  teamName = '';
  showJoinCodePopup = false;
  joinCode = '';

  constructor(private http: HttpClient, private router: Router, private authService: AuthService) {}

  ngOnInit() {}

  createTeamAndUser() {
    // 1. Create the user as captain (no team yet)
    this.http.post(`${environment.apiUrl}/register`, {
      email: this.email,
      password: this.password,
      name: this.name,
      captain: true
    }).subscribe({
      next: (userRes: any) => {
        const userId = userRes.user._id;
        // 2. Create the team with this user as owner and first member
        this.http.post(`${environment.apiUrl}/teams`, {
          name: this.teamName,
          owner: userId,
          members: [userId]
        }).subscribe({
          next: (teamRes: any) => {
            const teamId = teamRes.team._id;
            this.joinCode = teamRes.team.joinCode;
            // 3. Patch the user to assign the team
            this.http.patch(`${environment.apiUrl}/users/${userId}`, {
              team: teamId
            }).subscribe({
              next: () => {
                // Fetch the full user with populated team
                this.getUserById(userId).subscribe({
                  next: (fullUser: any) => {
                    this.authService.setCurrentUser({
                      _id: fullUser._id,
                      name: fullUser.name,
                      team: fullUser.team,
                      captain: fullUser.captain
                    });
                    this.showJoinCodePopup = true;
                  },
                  error: (err: any) => alert('Failed to fetch user: ' + (err.error?.error || err.message))
                });
              },
              error: (err: any) => alert('User update failed: ' + (err.error?.error || err.message))
            });
          },
          error: (err: any) => alert('Team creation failed: ' + (err.error?.error || err.message))
        });
      },
      error: (err: any) => alert('User creation failed: ' + (err.error?.error || err.message))
    });
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  getUserById(userId: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/users/${userId}`);
  }
}
