import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FormationDraft {
  id: string;
  formation: any[];
  createdAt: Date;
  isMain: boolean;
  name?: string;
}

export interface ISegment {
  _id: string;
  name: string;
  team: string;
  segmentSet?: string;
  roster: string[];
  formations: any[][];
  formationDrafts?: { [formationIndex: number]: FormationDraft };
  dummyTemplates: any[];
  depth: number;
  width: number;
  divisions: number;
  animationDurations: number[];
  formationDurations: number[];
  musicUrl: string;
  videoUrl?: string;
  segmentOrder: number;
  stylesInSegment: string[];
  propSpace: number;
  isPublic: boolean;
  createdBy: string;
}

@Injectable({
  providedIn: 'root'
})
export class SegmentService {
  private apiUrl = `${environment.apiUrl}/segments`;

  constructor(private http: HttpClient) {}

  createSegment(teamId: string, name: string, depth: number, width: number, divisions: number, stylesInSegment: any[], isPublic: boolean = true, setId?: string, createdBy?: string): Observable<any> {
    const payload = { teamId, name, depth, width, divisions, stylesInSegment, isPublic, setId, createdBy };
    return this.http.post(this.apiUrl, payload);
  }

  getSegmentsForTeam(teamId: string) {
    return this.http.get<{ segments: ISegment[] }>(`${environment.apiUrl}/segments/${teamId}`);
  }

  // Get segments that are visible to the current user based on their role and privacy settings
  getVisibleSegmentsForTeam(teamId: string, userId: string): Observable<{ segments: ISegment[] }> {
    return this.http.get<{ segments: ISegment[] }>(`${environment.apiUrl}/segments/${teamId}/visible?userId=${userId}`);
  }

  // Get segments for a specific set (privacy-aware)
  getSegmentsForSet(setId: string): Observable<{ segments: ISegment[] }> {
    return this.http.get<{ segments: ISegment[] }>(`${environment.apiUrl}/segments/set/${setId}`);
  }

  getSegmentById(segmentId: string) {
    return this.http.get<{ segment: ISegment }>(`${environment.apiUrl}/segment/${segmentId}`);
  }

  updateSegment(segmentId: string, update: Partial<ISegment>) {
    return this.http.patch(`${environment.apiUrl}/segment/${segmentId}`, update);
  }

  // Update segment privacy
  updateSegmentPrivacy(segmentId: string, isPublic: boolean): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/segment/${segmentId}/privacy`, { isPublic });
  }

  deleteSegment(segmentId: string) {
    return this.http.delete(`${environment.apiUrl}/segment/${segmentId}`);
  }

  getMusicPresignedUrl(segmentId: string, filename: string, filetype: string) {
    return this.http.post<{ url: string, key: string }>(
      `${environment.apiUrl}/segment/${segmentId}/music-presigned-url`,
      { filename, filetype }
    );
  }

  getMusicUrl(segmentId: string) {
    return this.http.get<{ url: string }>(
      `${environment.apiUrl}/segment/${segmentId}/music-url`
    );
  }

  getVideoPresignedUrl(segmentId: string, filename: string, filetype: string) {
    return this.http.post<{ url: string, key: string }>(
      `${environment.apiUrl}/segment/${segmentId}/video-presigned-url`,
      { filename, filetype }
    );
  }

  getVideoUrl(segmentId: string) {
    return this.http.get<{ url: string }>(
      `${environment.apiUrl}/segment/${segmentId}/video-url`
    );
  }
} 