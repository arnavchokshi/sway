import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './create-user.html',
  styleUrl: './create-user.scss'
})
export class CreateUser {
  email = '';
  password = '';
  name = '';
  teamName = '';
  teamDescription = '';

  constructor(private http: HttpClient, private router: Router) {}

  createUser() {
    // You may want to create the team first, then the user with the team ID
    this.http.post('http://localhost:3000/api/register', {
      email: this.email,
      password: this.password,
      name: this.name,
      // team: teamId, // if you have a team ID
    }).subscribe({
      next: (res: any) => {
        alert('User created!');
        localStorage.setItem('userId', res.user._id);
        this.router.navigate(['/create-team']);
      },
      error: (err) => alert('Error: ' + err.error?.error || err.message)
    });
  }
}
