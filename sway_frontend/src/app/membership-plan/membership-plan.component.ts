import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-membership-plan',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './membership-plan.component.html',
  styleUrls: ['./membership-plan.component.scss']
})
export class MembershipPlanComponent {
  annual = false;
  constructor(private router: Router) {}

  onAnnualChange(event: Event) {
    this.annual = (event.target instanceof HTMLInputElement) ? event.target.checked : false;
  }

  async goToPayment() {
    const res = await fetch('http://localhost:3000/api/create-checkout-session', { method: 'POST' });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }
} 