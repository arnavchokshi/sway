import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrls: ['./home.scss']
})
export class HomeComponent {
  constructor(private router: Router) {}

  goToLogin() {
    this.router.navigate(['/login']);
  }

  CreateTeam() {
    this.router.navigate(['/create-team']);
  }

  JoinTeam() {
    this.router.navigate(['/join-team']);
  }

  CreateUser() {
    this.router.navigate(['/create-user']);
  }
}
