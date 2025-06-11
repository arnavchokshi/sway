import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateRoster } from './create-roster';

describe('CreateRoster', () => {
  let component: CreateRoster;
  let fixture: ComponentFixture<CreateRoster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateRoster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateRoster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
