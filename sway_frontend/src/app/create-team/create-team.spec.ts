import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { CreateTeam } from './create-team';

describe('CreateTeam', () => {
  let component: CreateTeam;
  let fixture: ComponentFixture<CreateTeam>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateTeam],
      providers: [HttpClient, Router]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateTeam);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
