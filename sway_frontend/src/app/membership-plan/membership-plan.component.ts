import { Component, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StripeService } from '../services/stripe.service';

declare var Stripe: any;
declare var window: any;

@Component({
  selector: 'app-membership-plan',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './membership-plan.component.html',
  styleUrls: ['./membership-plan.component.scss']
})
export class MembershipPlanComponent implements AfterViewInit {
  annual = false;
  showPayment = false;
  stripe: any;
  elements: any;
  paymentElement: any;

  constructor(private stripeService: StripeService) {}

  ngAfterViewInit() {
    // Stripe Elements will be mounted when user clicks 'Pay for Pro'
  }

  startPayment() {
    this.showPayment = true;
    setTimeout(() => this.mountStripeElement(), 0);
  }

  async mountStripeElement() {
    if (!window['Stripe']) {
      alert('Stripe.js not loaded');
      return;
    }
    this.stripe = Stripe('pk_live_51RfsGzAnXImjVuyNbx1Z044O5SpIGe6xO97LF7TKoGgNRbRQLLQScizWN4RkCOsdfOeyw4f4yXii5CpH1ovy22mX00EMnzmzOA');
    const amount = this.annual ? 399 : 499;
    this.stripeService.createPaymentIntent(amount, 'usd').subscribe(async (res) => {
      const clientSecret = res.clientSecret;
      const appearance = { theme: 'stripe' };
      const options = {
        layout: {
          type: 'tabs',
          defaultCollapsed: false,
        }
      };
      this.elements = this.stripe.elements({ clientSecret, appearance });
      this.paymentElement = this.elements.create('payment', options);
      this.paymentElement.mount('#payment-element');
    });
  }

  onAnnualChange(event: Event) {
    this.annual = (event.target instanceof HTMLInputElement) ? event.target.checked : false;
  }
} 