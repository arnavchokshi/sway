import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

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

interface SavedCredentials {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser: User | null = null;

  constructor(private http: HttpClient) {
    // Load user from localStorage on service initialization
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null && this.currentUser._id !== undefined;
  }

  setCurrentUser(user: User) {
    this.currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(user));
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('currentUser');
    // Also clear saved credentials when logging out
    this.clearSavedCredentials();
  }

  forgotPassword(email: string) {
    return this.http.post(`${environment.apiUrl}/forgot-password`, { email });
  }

  // Remember me functionality
  saveCredentials(email: string, password: string) {
    const credentials: SavedCredentials = { email, password };
    localStorage.setItem('savedCredentials', JSON.stringify(credentials));
  }

  getSavedCredentials(): SavedCredentials | null {
    const saved = localStorage.getItem('savedCredentials');
    return saved ? JSON.parse(saved) : null;
  }

  clearSavedCredentials() {
    localStorage.removeItem('savedCredentials');
  }
} 