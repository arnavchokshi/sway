import { Injectable } from '@angular/core';

interface Team {
  _id: string;
  name: string;
}

interface User {
  _id: string;
  name: string;
  team: Team;
  captain: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser: User | null = null;

  constructor() {
    // Load user from localStorage on service initialization
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  setCurrentUser(user: User) {
    this.currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(user));
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('currentUser');
  }
} 