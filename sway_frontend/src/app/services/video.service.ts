import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VideoService {
  constructor(private http: HttpClient) {}

  getVideos(teamId: string): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/videos?team=${teamId}`);
  }

  uploadVideo(data: any): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/videos`, data);
  }

  postVideo(data: any): Observable<any> {
    return this.http.post<any>('http://localhost:3000/api/videos', data);
  }

  likeVideo(id: string): Observable<any> {
    return this.http.post<any>(`/api/videos/${id}/like`, {});
  }

  commentVideo(id: string, user: string, text: string): Observable<any> {
    return this.http.post<any>(`/api/videos/${id}/comment`, { user, text });
  }
} 