import { Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

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
  @Output() close = new EventEmitter<void>();

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  login() {
    this.http.post(`${environment.apiUrl}/login`, {
      email: this.email,
      password: this.password
    }).subscribe({
      next: (response: any) => {
        console.log('Login response:', response);
        // Store user data in AuthService
        const userData = {
          _id: response.user._id,
          name: response.user.name,
          team: response.user.team,
          captain: response.user.captain
        };
        console.log('Setting user data:', userData);
        this.authService.setCurrentUser(userData);
        this.close.emit();
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
