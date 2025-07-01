import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StripeService {
  constructor(private http: HttpClient) {}

  createPaymentIntent(amount: number, currency: string = 'usd'): Observable<{ clientSecret: string }> {
    return this.http.post<{ clientSecret: string }>('/api/create-payment-intent', { amount, currency });
  }
} 