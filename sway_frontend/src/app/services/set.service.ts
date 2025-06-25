import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ISet {
  _id: string;
  name: string;
  team: string;
  segments: string[];
  transitionTimes: number[]; // Array of transition times in seconds between segments
}

@Injectable({
  providedIn: 'root'
})
export class SetService {
  private apiUrl = `${environment.apiUrl}/sets`;

  constructor(private http: HttpClient) {}

  createSet(teamId: string, name: string): Observable<any> {
    return this.http.post(this.apiUrl, { teamId, name });
  }

  getSetsForTeam(teamId: string): Observable<{ sets: ISet[] }> {
    return this.http.get<{ sets: ISet[] }>(`${this.apiUrl}/team/${teamId}`);
  }

  getSetById(setId: string): Observable<{ set: ISet }> {
    return this.http.get<{ set: ISet }>(`${this.apiUrl}/${setId}`);
  }

  updateSet(setId: string, update: Partial<ISet>): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${setId}`, update);
  }

  deleteSet(setId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${setId}`);
  }

  addSegmentToSet(setId: string, segmentId: string, transitionTime: number = 0): Observable<any> {
    return this.http.post(`${this.apiUrl}/${setId}/segments`, { segmentId, transitionTime });
  }

  removeSegmentFromSet(setId: string, segmentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${setId}/segments/${segmentId}`);
  }

  reorderSegmentsInSet(setId: string, segmentIds: string[], transitionTimes: number[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${setId}/reorder`, { segmentIds, transitionTimes });
  }

  // Update transition times for a set
  updateTransitionTimes(setId: string, transitionTimes: number[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${setId}/transition-times`, { transitionTimes });
  }

  // Update a specific transition time between two segments
  updateTransitionTime(setId: string, transitionIndex: number, transitionTime: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${setId}/transition-times/${transitionIndex}`, { transitionTime });
  }

  // Get total performance time for a set (sum of all segment durations + transition times)
  getSetPerformanceTime(setId: string): Observable<{ totalTime: number, segmentTimes: number[], transitionTimes: number[] }> {
    return this.http.get<{ totalTime: number, segmentTimes: number[], transitionTimes: number[] }>(`${this.apiUrl}/${setId}/performance-time`);
  }

  // Get sets that are visible to the current user based on their role
  getVisibleSetsForTeam(teamId: string): Observable<{ sets: ISet[] }> {
    return this.http.get<{ sets: ISet[] }>(`${this.apiUrl}/team/${teamId}/visible`);
  }
} 