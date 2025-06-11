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

  createSegment(teamId: string, name: string, depth: number, width: number, divisions: number): Observable<any> {
    return this.http.post(this.apiUrl, { teamId, name, depth, width, divisions });
  }

  getSegmentsForTeam(teamId: string) {
    return this.http.get<{ segments: any[] }>(`http://localhost:3000/api/segments/${teamId}`);
  }

  getSegmentById(segmentId: string) {
    return this.http.get<{ segment: any }>(`http://localhost:3000/api/segment/${segmentId}`);
  }

  updateSegment(segmentId: string, update: any) {
    return this.http.patch(`http://localhost:3000/api/segment/${segmentId}`, update);
  }

  deleteSegment(segmentId: string) {
    return this.http.delete(`http://localhost:3000/api/segment/${segmentId}`);
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
} 