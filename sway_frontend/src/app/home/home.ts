import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Login } from '../login/login';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
  standalone: true,
  imports: [CommonModule, Login]
})
export class HomeComponent {
  showSplit = false;
  showLoginPopup = false;
  isAnimating = false;

  constructor(private router: Router) {}

  onMouseEnter() {
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.showSplit = true;
    }
  }

  onMouseLeave() {
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.showSplit = false;
    }
  }

  onAnimationComplete() {
    this.isAnimating = false;
  }

  goToLogin() {
    this.showLoginPopup = true;
  }

  closeLoginPopup() {
    this.showLoginPopup = false;
  }

  CreateTeam() {
    this.router.navigate(['/create-user']);
  }

  JoinTeam() {
    this.router.navigate(['/join-team']);
  }

  CreateUser() {
    this.router.navigate(['/create-user']);
  }

  
}
