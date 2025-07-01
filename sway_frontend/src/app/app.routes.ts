import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home';
import { CreateUser } from './create-user/create-user';
import { CreateRoster } from './create-roster/create-roster';
import { JoinTeam } from './join-team/join-team';
import { SignIn } from './sign-in/sign-in';
import { DashboardComponent } from './dashboard/dashboard';
import { CreateSegmentComponent } from './create-segment/create-segment.component';
import { EditRosterComponent } from './edit-roster/edit-roster.component';
import { MembershipPlanComponent } from './membership-plan/membership-plan.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'create-user', component: CreateUser },
  { path: 'create-roster', component: CreateRoster },
  { path: 'join-team', component: JoinTeam },
  { path: 'sign-in', component: SignIn },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'create-segment', component: CreateSegmentComponent },
  { path: 'edit-roster', component: EditRosterComponent },
  { path: 'membership-plan', component: MembershipPlanComponent },
  // ...other routes
];

export { routes };

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }