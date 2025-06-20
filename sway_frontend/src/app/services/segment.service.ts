import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SegmentService {
  private apiUrl = `${environment.apiUrl}/segments`;

  constructor(private http: HttpClient) {}

  createSegment(teamId: string, name: string, depth: number, width: number, divisions: number, stylesInSegment: any[]): Observable<any> {
    return this.http.post(this.apiUrl, { teamId, name, depth, width, divisions, stylesInSegment });
  }

  getSegmentsForTeam(teamId: string) {
    return this.http.get<{ segments: any[] }>(`${environment.apiUrl}/segments/${teamId}`);
  }

  getSegmentById(segmentId: string) {
    return this.http.get<{ segment: any }>(`${environment.apiUrl}/segment/${segmentId}`);
  }

  updateSegment(segmentId: string, update: any) {
    return this.http.patch(`${environment.apiUrl}/segment/${segmentId}`, update);
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