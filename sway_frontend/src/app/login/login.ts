import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  email: string = '';
  password: string = '';

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  login() {
    this.http.post('http://localhost:3000/api/login', {
      email: this.email,
      password: this.password
    }).subscribe({
      next: (response: any) => {
        // Store user data in AuthService
        this.authService.setCurrentUser({
          _id: response.user._id,
          name: response.user.name,
          team: response.user.team,
          captain: response.user.captain
        });
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        alert('Login failed: ' + (err.error?.error || err.message));
      }
    });
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
