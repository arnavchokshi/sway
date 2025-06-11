import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinTeam } from './join-team';

describe('JoinTeam', () => {
  let component: JoinTeam;
  let fixture: ComponentFixture<JoinTeam>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinTeam]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JoinTeam);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
