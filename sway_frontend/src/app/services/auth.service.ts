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
  rememberMe: boolean;
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
  saveCredentials(email: string, password: string, rememberMe: boolean) {
    const credentials: SavedCredentials = { email, password, rememberMe };
    localStorage.setItem('savedCredentials', JSON.stringify(credentials));
  }

  getSavedCredentials(): SavedCredentials | null {
    const saved = localStorage.getItem('savedCredentials');
    if (!saved) return null;
    
    try {
      const credentials = JSON.parse(saved);
      
      // Handle migration from old format (without rememberMe flag)
      if (credentials && typeof credentials === 'object') {
        if (credentials.rememberMe === undefined) {
          // Old format - assume user didn't want to be remembered
          // Clear the old credentials and return null
          this.clearSavedCredentials();
          return null;
        }
        return credentials;
      }
      
      return null;
    } catch (error) {
      // Invalid JSON, clear it
      this.clearSavedCredentials();
      return null;
    }
  }

  shouldAutoLogin(): boolean {
    const savedCredentials = this.getSavedCredentials();
    return savedCredentials !== null && savedCredentials.rememberMe === true;
  }

  clearSavedCredentials() {
    localStorage.removeItem('savedCredentials');
  }
} 