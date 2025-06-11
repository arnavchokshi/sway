import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-team.html',
  styleUrl: './create-team.scss'
})
export class CreateTeam {
  teamName = '';
  school = '';
  joinCode: string | null = null;

  constructor(private http: HttpClient, private router: Router) {}

  createTeam() {
    const owner = localStorage.getItem('userId');
    if (!owner) {
      alert('No user found. Please sign up first.');
      this.router.navigate(['/create-user']);
      return;
    }

    this.http.post('http://localhost:3000/api/teams', {
      name: this.teamName,
      school: this.school,
      owner: owner
    }).subscribe({
      next: (res: any) => {
        alert('Team created!');
        this.joinCode = res.team.joinCode;
        localStorage.setItem('teamId', res.team._id);
        // Update the user to reference this team
        this.http.patch(`http://localhost:3000/api/users/${owner}`, { team: res.team._id })
          .subscribe({
            next: () => {
              alert('User assigned to team!');
              // Optionally navigate to another page
            },
            error: (err) => alert('Error updating user: ' + err.error?.error || err.message)
          });
      },
      error: (err) => alert('Error: ' + err.error?.error || err.message)
    });
  }

  goToRoster() {
    this.router.navigate(['/create-roster']);
  }
}
