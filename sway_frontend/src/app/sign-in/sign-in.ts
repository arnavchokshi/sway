import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss'
})
export class SignIn implements OnInit {
  member: any = {};
  email: string = '';
  password: string = '';
  gender: string = '';
  height: number | null = null;

  constructor(
    private router: Router, 
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const stored = localStorage.getItem('selectedMember');
    if (stored) {
      this.member = JSON.parse(stored);
    }
    // Do NOT prefill the form fields
    this.email = '';
    this.password = '';
    this.gender = '';
    this.height = null;
  }

  signIn() {
    // Send PATCH request to update user in MongoDB
    this.http.patch(`${environment.apiUrl}/users/${this.member._id}`, {
      email: this.email,
      password: this.password,
      gender: this.gender,
      height: this.height
    }).subscribe({
      next: (response: any) => {
        // Store the complete user data in AuthService
        this.authService.setCurrentUser({
          _id: response._id,
          name: response.name,
          team: response.team,
          captain: response.captain
        });
        alert('User updated and signed in!');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => alert('Error: ' + err.error?.error || err.message)
    });
  }
}
