import { Component, OnInit } from '@angular/core';
import { loadStripe } from '@stripe/stripe-js';

@Component({
  selector: 'app-membership-payment',
  standalone: true,
  templateUrl: './membership-payment.component.html',
  styleUrls: ['./membership-payment.component.scss']
})
export class MembershipPaymentComponent implements OnInit {
  async ngOnInit() {
    const stripe = await loadStripe('pk_live_51RfsGzAnXImjVuyNbx1Z044O5SpIGe6xO97LF7TKoGgNRbRQLLQScizWN4RkCOsdfOeyw4f4yXii5CpH1ovy22mX00EMnzmzOA');
    // Fetch clientSecret from backend
    const res = await fetch('http://localhost:4242/api/create-payment-intent', { method: 'POST' });
    const data = await res.json();
    const clientSecret = data.clientSecret;
    if (stripe && clientSecret) {
      const appearance = { /* customize as needed */ };
      const elements = stripe.elements({ clientSecret, appearance });
      const paymentElement = elements.create('payment', {
        layout: { type: 'tabs', defaultCollapsed: false }
      });
      paymentElement.mount('#payment-element');
    }
  }
} 