import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-join-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './join-team.html',
  styleUrl: './join-team.scss'
})
export class JoinTeam {
  joinCode: string = '';
  roster: any[] = [];
  showRoster = false;

  constructor(private http: HttpClient, private router: Router) {}

  joinTeam() {
    if (this.joinCode) {
      this.http.get<any>(`http://localhost:3000/api/team-by-join-code/${this.joinCode}`)
        .subscribe({
          next: (res) => {
            this.roster = res.members;
            this.showRoster = true;
          },
          error: (err) => {
            alert(err.error?.error || 'Team not found');
            this.showRoster = false;
      }
    });
    } else {
      alert('Please enter a join code!');
    }
  }

  closeRoster() {
    this.showRoster = false;
  }

  goToSignIn(member: any) {
    localStorage.setItem('selectedMember', JSON.stringify(member));
    this.showRoster = false;
    this.router.navigate(['/sign-in']);
  }
}
