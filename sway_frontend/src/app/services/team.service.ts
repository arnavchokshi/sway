import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Style {
  name: string;
  color: string;
}

@Injectable({
  providedIn: 'root'
})
export class TeamService {
  private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  getTeamById(teamId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teams/${teamId}`);
  }

  addTeamMember(teamId: string, memberName: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teams/${teamId}/members`, { name: memberName });
  }

  updateMemberRole(teamId: string, memberId: string, isCaptain: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/teams/${teamId}/members/${memberId}`, { captain: isCaptain });
  }

  removeTeamMember(teamId: string, memberId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/teams/${teamId}/members/${memberId}`);
  }

  // Style management methods
  addStyle(teamId: string, style: Style): Observable<any> {
    return this.http.post(`${this.apiUrl}/teams/${teamId}/styles`, style);
  }

  updateStyle(teamId: string, styleIndex: number, style: Style): Observable<any> {
    return this.http.patch(`${this.apiUrl}/teams/${teamId}/styles/${styleIndex}`, style);
  }

  deleteStyle(teamId: string, styleIndex: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/teams/${teamId}/styles/${styleIndex}`);
  }

  // Update user data
  updateUser(userId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${userId}`, updateData);
  }

  addMember(teamId: string, member: { name: string; isDummy?: boolean }): Observable<any> {
    return this.http.post(`${this.apiUrl}/teams/${teamId}/members`, member);
  }

  addDummyUser(name: string) {
    return this.http.post<{ user: any }>(`${this.apiUrl}/dummy-users`, { name });
  }

  getUserById(userId: string) {
    return this.http.get<any>(`${this.apiUrl}/users/${userId}`);
  }

  deleteDummyUser(userId: string) {
    return this.http.delete(`${this.apiUrl}/dummy-users/${userId}`);
  }

  getSegmentById(segmentId: string) {
    return this.http.get<any>(`${this.apiUrl}/segment/${segmentId}`);
  }
} 