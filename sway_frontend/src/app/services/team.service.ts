import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TeamService {
  private apiUrl = 'http://localhost:3000/api';

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
} 