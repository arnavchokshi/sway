import { Component, OnInit, ElementRef, ViewChild, Renderer2, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TeamService } from '../services/team.service';
import { AuthService } from '../services/auth.service';
import { SegmentService } from '../services/segment.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { environment } from '../../environments/environment';
import WaveSurfer from 'wavesurfer.js';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

interface Performer {
  id: string;
  name: string;
  x: number; // in feet
  y: number; // in feet
  skillLevels: { [styleName: string]: number }; // Map of style name to skill level (1-5)
  height?: number; // in feet
  isDummy?: boolean;
  dummyName?: string;
}

interface Style {
  name: string;
  color: string;
}

@Component({
  selector: 'app-create-segment',
  templateUrl: './create-segment.component.html',
  styleUrls: ['./create-segment.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  animations: [
    trigger('movePerformer', [
      transition('* => *', [
        animate('1s ease-in-out', style({ transform: 'translate({{x}}px, {{y}}px)' }))
      ])
    ])
  ]
})
export class CreateSegmentComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('stageRef') stageRef!: ElementRef<HTMLDivElement>;
  @ViewChild('timelineBarRef') timelineBarRef!: ElementRef<HTMLDivElement>;

  isCaptain = false;
  currentUserId: string = '';
  spotlightRadius = 80; // pixels
  spotlightOpacity = 0.35; // 35% opacity for the dark overlay
  roster: any[] = [];
  segment: any = null;
  segmentName: string = 'New Segment';
  depth = 24; // feet
  width = 32; // feet
  divisions = 3;

  // For grid rendering
  gridSpacingFeet = 1;
  mainVerticals: number[] = [];
  mainHorizontals: number[] = [];
  subVerticals: number[] = [];
  subHorizontals: number[] = [];

  // For scaling
  stageWidthPx = 800;
  stageHeightPx = 600;
  pixelsPerFoot = 20;

  // Multi-formation support
  formations: Performer[][] = [];
  currentFormationIndex = 0;

  // Selected performer tracking
  selectedPerformerId: string | null = null;

  // Drag state
  draggingId: string | null = null;
  dragOffset = { x: 0, y: 0 };

  // Modal state for editing stage
  showEditModal = false;
  editWidth = 32;
  editDepth = 24;
  editDivisions = 3;
  editSegmentName = 'New Segment';
  editSelectedStyles: Style[] = [];
  teamStyles: Style[] = [];

  selectedAddPerformer: any = null;

  dummyCounter = 1;

  // Animation state
  isAnimating = false;
  currentAnimationFrame = 0;
  animationDuration = 1000; // ms (default, but not used for per-transition)
  animationStartTime = 0;

  // Per-transition animation durations (in seconds)
  animationDurations: number[] = [];

  // Add this property to the class:
  animatedPositions: { [id: string]: { x: number, y: number } } = {};
  inTransition = false;

  signedMusicUrl: string | null = null;
  waveSurfer: WaveSurfer | null = null;
  isPlaying = false;

  private waveformInitializedForUrl: string | null = null;

  formationDurations: number[] = [];
  playbackTimer: any = null;
  playbackTime = 0;
  playingFormationIndex = 0;

  waveformWidthPx = 900; // Match the default stage grid width, can be dynamic
  resizingFormationIndex: number | null = null;
  resizingStartX: number = 0;
  resizingStartDuration: number = 0;

  resizingTransitionIndex: number | null = null;
  resizingTransitionStartX: number = 0;
  resizingTransitionStartDuration: number = 0;

  pixelsPerSecond = 100; // You can adjust this for zoom level

  activeRosterTab: 'team' | 'segment' = 'team';
  teamRoster: any[] = [];
  segmentRoster: any[] = [];

  hoveredFormationIndex: number | null = null;
  hoveredTimelineTime: number | null = null;
  hoveredTimelineX: number | null = null;

  isMobile = false;

  unifiedFormationInterval: any = null;

  // Make Math available in template
  protected Math = Math;

  // Color by skill properties
  showColorBySkill = false;
  selectedStyle: Style | null = null;

  private saveSubject = new Subject<void>();
  private autoSaveDebounceTime = 2000; // 2 seconds
  lastSaveTime: Date | null = null;

  // Side Panel State
  activePanel: 'roster' | 'details' = 'roster';
  showAddPerformerDropdown = false;
  showUserAssignmentDropdown = false;

  selectedPerformerIds: Set<string> = new Set();
  hoveredPerformerId: string | null = null;
  isShiftPressed = false;

  // Add new property to track initial positions of all selected performers
  private selectedPerformersInitialPositions: { [id: string]: { x: number, y: number } } = {};

  // Add these properties at the top of the class with other properties
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private readonly DRAG_THRESHOLD = 5; // pixels

  constructor(
    private teamService: TeamService,
    private authService: AuthService,
    private segmentService: SegmentService,
    private route: ActivatedRoute,
    private renderer: Renderer2
  ) {
    // Set up auto-save subscription
    this.saveSubject.pipe(
      debounceTime(this.autoSaveDebounceTime)
    ).subscribe(() => {
      this.saveSegment();
    });
  }

  get performers(): Performer[] {
    if (this.inTransition && Object.keys(this.animatedPositions).length > 0) {
      // Return animated positions during transition
      return (this.formations[this.playingFormationIndex] || []).map(p => ({
        ...p,
        ...this.animatedPositions[p.id]
      }));
    }
    return this.formations[this.playingFormationIndex] || [];
  }

  get selectedPerformer(): Performer | null {
    if (!this.selectedPerformerId) return null;
    return this.performers.find(p => p.id === this.selectedPerformerId) || null;
  }

  set performers(val: Performer[]) {
    this.formations[this.currentFormationIndex] = val;
  }

  ngOnInit() {
    // Detect iPhone or small mobile
    this.isMobile = /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 500;
    const segmentId = this.route.snapshot.queryParamMap.get('id') || this.route.snapshot.paramMap.get('id');
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = currentUser?.captain || false;
    this.currentUserId = currentUser?._id || '';
    
    if (segmentId) {
      this.segmentService.getSegmentById(segmentId).subscribe({
        next: (res) => {
          this.segment = res.segment;
          console.log('Loaded segment data:', JSON.stringify(this.segment, null, 2));
          if (this.segment?.musicUrl) {
            this.getSignedMusicUrl();
          }
          this.depth = this.segment.depth;
          this.width = this.segment.width;
          this.divisions = this.segment.divisions;
          this.segmentName = this.segment.name || 'New Segment';
          this.calculateStage();

          // Load roster first
          if (currentUser?.team?._id) {
            this.teamService.getTeamById(currentUser.team._id).subscribe({
              next: (res) => {
                this.teamRoster = res.team.members || [];
                console.log('Loaded team roster:', JSON.stringify(this.teamRoster, null, 2));
                // Update segment roster based on the segment's roster
                if (this.segment.roster) {
                  this.segmentRoster = this.teamRoster.filter(member => 
                    this.segment.roster.includes(member._id)
                  );
                } else {
                  this.segmentRoster = [];
                }

                // Create a map to track dummy performers across formations
                const dummyMap = new Map<string, { id: string, name: string }>();

                // Now map the formations with user data
                if (this.segment.formations && this.segment.formations.length > 0) {
                  console.log('Loading formations from segment:', JSON.stringify(this.segment.formations, null, 2));
                  this.formations = this.segment.formations.map((formation: any[]) => 
                    formation.map((p: { 
                      isDummy?: boolean; 
                      dummyName?: string; 
                      name?: string;
                      x: number; 
                      y: number; 
                      user?: string; 
                      id?: string; 
                      skillLevel?: number; 
                      height?: number; 
                      _id?: string 
                    }) => {
                      console.log('Processing performer:', JSON.stringify(p, null, 2));
                      // Check if this is a dummy performer by looking for isDummy flag or null user
                      if (p.isDummy || p.user === null) {
                        // Use the existing dummy ID if available, or create a new one
                        const dummyId = p.id || `dummy-${this.dummyCounter++}`;
                        
                        // If we haven't seen this dummy before, create a new entry
                        if (!dummyMap.has(dummyId)) {
                          // Extract the number from the dummy name or ID
                          const dummyNumber = p.dummyName || p.name || dummyId.split('-')[1];
                          dummyMap.set(dummyId, {
                            id: dummyId,
                            name: dummyNumber
                          });
                        }

                        const dummyInfo = dummyMap.get(dummyId)!;
                        const dummyPerformer = {
                          id: dummyInfo.id,
                          name: dummyInfo.name,
                          x: p.x,
                          y: p.y,
                          skillLevels: {},
                          height: p.height || 5.5,
                          isDummy: true,
                          dummyName: dummyInfo.name
                        };
                        console.log('Reconstructed dummy performer:', JSON.stringify(dummyPerformer, null, 2));
                        return dummyPerformer;
                      } else {
                        const user = this.teamRoster.find(m => m._id === p.user);
                        console.log('Found user for performer:', { user, performer: p });
                        // Get skill level for the selected style if available
                        const skillLevel = user?.skillLevels?.[this.selectedStyle?.name.toLowerCase() || ''] || p.skillLevel || 1;
                        return {
                          id: p.user,
                          name: user ? user.name : 'Unknown',
                          x: p.x,
                          y: p.y,
                          skillLevels: { ...(user?.skillLevels || {}) },
                          height: p.height || user?.height,
                          isDummy: false
                        };
                      }
                    })
                  );
                  console.log('Reconstructed formations:', JSON.stringify(this.formations, null, 2));
                } else {
                  this.formations = [[]];
                }
                this.formationDurations = this.segment.formationDurations && this.segment.formationDurations.length > 0 ? this.segment.formationDurations : [5];
                this.animationDurations = this.segment.animationDurations || [];
                this.currentFormationIndex = 0;
              },
              error: (err) => {
                console.error('Failed to load team roster:', err);
              }
            });
          }
        },
        error: (err) => {
          console.error('Failed to load segment:', err);
        }
      });
    } else {
      // Only set defaults if creating a new segment
      this.formations = [[]];
      this.formationDurations = [5];
      this.animationDurations = [];
      this.currentFormationIndex = 0;
    }

    // Always load team styles for the skill sliders
    if (currentUser?.team?._id) {
      this.teamService.getTeamById(currentUser.team._id).subscribe({
        next: (res) => {
          this.teamStyles = res.team.styles || [];
        },
        error: (err) => {
          console.error('Failed to load team styles:', err);
        }
      });
    }

    // Add keyboard event listeners for shift key
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  calculateStage() {
    this.pixelsPerFoot = this.isMobile ? 7 : 20;
    this.stageWidthPx = this.width * this.pixelsPerFoot;
    this.stageHeightPx = this.depth * this.pixelsPerFoot;
    // Main lines
    this.mainVerticals = [];
    this.mainHorizontals = [];
    this.subVerticals = [];
    this.subHorizontals = [];
    for (let i = 0; i <= 8; i++) {
      this.mainVerticals.push((i / 8) * this.stageWidthPx);
    }
    for (let i = 0; i <= 4; i++) {
      this.mainHorizontals.push((i / 4) * this.stageHeightPx);
    }
    // Subgrid lines for all 8 vertical and 3 horizontal sections
    if (this.divisions > 0) {
      for (let i = 0; i < 8; i++) {
        const start = (i / 8) * this.stageWidthPx;
        const end = ((i + 1) / 8) * this.stageWidthPx;
        for (let d = 1; d <= this.divisions; d++) {
          const pos = start + ((end - start) * d) / (this.divisions + 1);
          this.subVerticals.push(pos);
        }
      }
      for (let i = 0; i < 4; i++) {
        const start = (i / 4) * this.stageHeightPx;
        const end = ((i + 1) / 4) * this.stageHeightPx;
        for (let d = 1; d <= this.divisions; d++) {
          const pos = start + ((end - start) * d) / (this.divisions + 1);
          this.subHorizontals.push(pos);
        }
      }
    }
    this.mainVerticals = this.mainVerticals.sort((a, b) => a - b);
    this.mainHorizontals = this.mainHorizontals.sort((a, b) => a - b);
    this.subVerticals = this.subVerticals.sort((a, b) => a - b);
    this.subHorizontals = this.subHorizontals.sort((a, b) => a - b);
  }

  // Helper to go to a specific formation index and update all relevant state
  goToFormation(index: number) {
    this.currentFormationIndex = index;
    this.playingFormationIndex = index;
    
    // Simply add up all formation and transition times before this index
    let t = 0;
    for (let i = 0; i < index; i++) {
      t += (this.formationDurations[i] || 4);
      if (i < this.animationDurations.length) {
        t += (this.animationDurations[i] || 1);
      }
    }
    
    this.playbackTime = t;
    if (this.waveSurfer && this.waveSurfer.getDuration()) {
      this.waveSurfer.seekTo(t / this.waveSurfer.getDuration());
      this.isPlaying = this.waveSurfer.isPlaying();
    }
  }

  async prevFormation() {
    if (this.currentFormationIndex > 0 && !this.inTransition) {
      await this.animateFormationTransition(this.currentFormationIndex, this.currentFormationIndex - 1);
      this.goToFormation(this.currentFormationIndex - 1);
    }
  }

  async onNextFormationClick() {
    if (this.currentFormationIndex < this.formations.length - 1 && !this.inTransition) {
      await this.animateFormationTransition(this.currentFormationIndex, this.currentFormationIndex + 1);
      this.goToFormation(this.currentFormationIndex + 1);
    }
  }

  jumpToFormation(index: number) {
    this.goToFormation(index);
  }

  addFormation() {
    // Get the current formation's performers
    const currentFormation = this.formations[this.currentFormationIndex];
    
    // Create a deep copy of the current formation's performers
    const newFormation = currentFormation.map(performer => ({
      ...performer,
      x: performer.x,
      y: performer.y
    }));
    
    // Add the new formation with copied performers
    this.formations.push(newFormation);
    this.formationDurations.push(5); // Default duration
    this.animationDurations.push(2); // Default transition duration

    // If we have a segment ID, save immediately
    if (this.segment?._id) {
      this.saveSegment();
    } else {
      // Otherwise trigger auto-save
      this.triggerAutoSave();
    }
  }

  addPerformer(member: any) {
    const newPerformer: Performer = {
      id: member._id || `dummy-${this.dummyCounter++}`,
      name: member.name || `Dummy ${this.dummyCounter}`,
      x: 0,
      y: 0,
      skillLevels: {}
    };
    this.formations[this.currentFormationIndex].push(newPerformer);
    this.triggerAutoSave();
  }
  addPerformerFromRoster(dancer: any) {
    // Add the dancer to all formations
    this.formations = this.formations.map(formation => {
      // Check if dancer is already in this formation
      if (!formation.some(p => p.id === dancer._id)) {
        return [
          ...formation,
          {
            id: dancer._id,
            name: dancer.name,
            x: this.width / 2,
            y: this.depth / 2,
            skillLevels: { ...(dancer.skillLevels || {}) },
            height: dancer.height || 5.5,
            isDummy: false
          }
        ];
      }
      return formation;
    });

    // Update segment roster if not already included
    if (!this.segmentRoster.some(m => m._id === dancer._id)) {
      this.segmentRoster = [...this.segmentRoster, dancer];
    }
    this.triggerAutoSave();
  }
  addDummyPerformer() {
    const dummyId = `dummy-${this.dummyCounter}`;
    const dummyName = `${this.dummyCounter}`;
    console.log('Creating new dummy performer:', { id: dummyId, name: dummyName });
    
    // Add the dummy performer to the current formation
    const newFormation = [...this.formations[this.currentFormationIndex]];
    newFormation.push({
      id: dummyId,
      name: dummyName,
      x: this.width / 2,  // Place in middle of stage width
      y: this.depth / 2,  // Place in middle of stage depth
      isDummy: true,
      dummyName: dummyName,
      skillLevels: {},
      height: 5.5
    });
    
    this.formations[this.currentFormationIndex] = newFormation;
    this.dummyCounter++;
    console.log('Formations after adding dummy:', JSON.stringify(this.formations, null, 2));
    
    // If we have a segment ID, save immediately
    if (this.segment?._id) {
      this.saveSegment();
    } else {
      this.triggerAutoSave();
    }
  }
  get availablePerformers() {
    // Members not in current formation (ignore dummy performers)
    const ids = new Set(this.performers
      .filter(p => p?.id && !p.id.startsWith('dummy-'))
      .map(p => p.id));
    return this.roster.filter(m => !ids.has(m._id));
  }

  // --- Drag and Drop Logic ---
  onDragStart(event: MouseEvent | TouchEvent, performer: Performer) {
    event.preventDefault();
    event.stopPropagation();

    // Store the initial mouse position
    this.dragStartX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    this.dragStartY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    // If we're not holding shift, clear other selections
    if (!this.isShiftPressed) {
      this.selectedPerformerIds.clear();
    }
    
    // Add this performer to selection
    this.selectedPerformerIds.add(performer.id);
    this.selectedPerformerId = performer.id;

    this.draggingId = performer.id;
    const rect = this.stageRef.nativeElement.getBoundingClientRect();
    this.dragOffset = {
      x: (this.dragStartX - rect.left) - (performer.x * this.pixelsPerFoot),
      y: (this.dragStartY - rect.top) - (performer.y * this.pixelsPerFoot)
    };

    // Store initial positions of all selected performers
    this.selectedPerformersInitialPositions = {};
    this.performers.forEach(p => {
      if (this.selectedPerformerIds.has(p.id)) {
        this.selectedPerformersInitialPositions[p.id] = { x: p.x, y: p.y };
      }
    });

    // Add event listeners for drag and end
    this.renderer.listen('document', 'mousemove', this.onDragMove);
    this.renderer.listen('document', 'touchmove', this.onDragMove);
    this.renderer.listen('document', 'mouseup', this.onDragEnd);
    this.renderer.listen('document', 'touchend', this.onDragEnd);
  }

  onDragMove = (event: MouseEvent | TouchEvent) => {
    if (!this.draggingId) return;

    // Calculate the distance moved
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    const dx = clientX - this.dragStartX;
    const dy = clientY - this.dragStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we haven't moved past the threshold yet, don't start dragging
    if (distance < this.DRAG_THRESHOLD) return;

    let x = (clientX - this.stageRef.nativeElement.getBoundingClientRect().left - this.dragOffset.x) / this.pixelsPerFoot;
    let y = (clientY - this.stageRef.nativeElement.getBoundingClientRect().top - this.dragOffset.y) / this.pixelsPerFoot;

    // Calculate all possible grid positions (main + subgrid)
    const gridPositionsX: number[] = [];
    const gridPositionsY: number[] = [];

    // Main verticals (8 sections, 9 lines)
    for (let i = 0; i <= 8; i++) {
      gridPositionsX.push((i / 8) * this.width);
    }
    // Subgrid verticals
    for (let i = 0; i < 8; i++) {
      const start = (i / 8) * this.width;
      const end = ((i + 1) / 8) * this.width;
      for (let d = 1; d <= this.divisions; d++) {
        gridPositionsX.push(start + ((end - start) * d) / (this.divisions + 1));
      }
    }
    // Main horizontals (4 sections, 5 lines)
    for (let i = 0; i <= 4; i++) {
      gridPositionsY.push((i / 4) * this.depth);
    }
    // Subgrid horizontals
    for (let i = 0; i < 4; i++) {
      const start = (i / 4) * this.depth;
      const end = ((i + 1) / 4) * this.depth;
      for (let d = 1; d <= this.divisions; d++) {
        gridPositionsY.push(start + ((end - start) * d) / (this.divisions + 1));
      }
    }
    // Sort for safety
    gridPositionsX.sort((a, b) => a - b);
    gridPositionsY.sort((a, b) => a - b);

    // Snap to nearest grid intersection
    const snapToGrid = (value: number, gridPositions: number[]): number => {
      return gridPositions.reduce((prev, curr) =>
        Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
      );
    };
    x = snapToGrid(x, gridPositionsX);
    y = snapToGrid(y, gridPositionsY);

    // Clamp to stage boundaries
    x = Math.max(0, Math.min(this.width, x));
    y = Math.max(0, Math.min(this.depth, y));

    // Calculate the movement delta from the initial position
    const draggedPerformer = this.performers.find(p => p.id === this.draggingId);
    if (draggedPerformer && this.selectedPerformersInitialPositions[this.draggingId]) {
      const initialPos = this.selectedPerformersInitialPositions[this.draggingId];
      const deltaX = x - initialPos.x;
      const deltaY = y - initialPos.y;

      // Move all selected performers by the same delta
      this.performers = this.performers.map(p => {
        if (this.selectedPerformerIds.has(p.id)) {
          const initialPos = this.selectedPerformersInitialPositions[p.id];
          if (initialPos) {
            let newX = initialPos.x + deltaX;
            let newY = initialPos.y + deltaY;
            
            // Clamp to stage boundaries
            newX = Math.max(0, Math.min(this.width, newX));
            newY = Math.max(0, Math.min(this.depth, newY));
            
            // Snap to grid
            newX = snapToGrid(newX, gridPositionsX);
            newY = snapToGrid(newY, gridPositionsY);
            
            return { ...p, x: newX, y: newY };
          }
        }
        return p;
      });
    }

    this.triggerAutoSave();
  };

  onDragEnd = (event: MouseEvent | TouchEvent) => {
    if (!this.draggingId) return;

    // Calculate the distance moved
    const clientX = 'touches' in event ? event.changedTouches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.changedTouches[0].clientY : event.clientY;
    const dx = clientX - this.dragStartX;
    const dy = clientY - this.dragStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we haven't moved past the threshold, treat it as a click
    if (distance < this.DRAG_THRESHOLD) {
      const performer = this.performers.find(p => p.id === this.draggingId);
      if (performer) {
        this.onPerformerClick(performer);
      }
    }

    this.draggingId = null;
    this.triggerAutoSave();
  };

  onPerformerClick(performer: Performer) {
    if (this.isShiftPressed) {
      // Toggle selection for this performer
      if (this.selectedPerformerIds.has(performer.id)) {
        this.selectedPerformerIds.delete(performer.id);
        if (this.selectedPerformerId === performer.id) {
          this.selectedPerformerId = null;
        }
      } else {
        this.selectedPerformerIds.add(performer.id);
        this.selectedPerformerId = performer.id;
      }
    } else {
      // Single selection
      this.selectedPerformerIds.clear();
      this.selectedPerformerIds.add(performer.id);
      this.selectedPerformerId = performer.id;
    }
  }

  getPreviousPosition(performerId: string): { x: number, y: number } | null {
    if (this.currentFormationIndex === 0) return null;
    const prevFormation = this.formations[this.currentFormationIndex - 1];
    // For dummy performers, we need to match by name since IDs might be regenerated
    const currentPerformer = this.performers.find(p => p.id === performerId);
    if (!currentPerformer) return null;
    
    const prevPerformer = prevFormation.find(p => 
      // Match by ID for real performers
      p.id === performerId || 
      // Match by name for dummy performers
      (currentPerformer.id.startsWith('dummy-') && p.name === currentPerformer.name)
    );
    return prevPerformer ? { x: prevPerformer.x, y: prevPerformer.y } : null;
  }

  getSpotlightStyle() {
    const currentUserPerformer = this.performers.find(p => p.id === this.currentUserId);
    if (!currentUserPerformer) return {};

    const x = currentUserPerformer.x * this.pixelsPerFoot;
    const y = currentUserPerformer.y * this.pixelsPerFoot;

    return {
      'pointer-events': 'none',
      'position': 'absolute',
      'top': '0',
      'left': '0',
      'width': this.stageWidthPx + 'px',
      'height': this.stageHeightPx + 'px',
      'z-index': 10,
      'background': `radial-gradient(circle ${this.spotlightRadius}px at ${x}px ${y}px, transparent 0%, transparent 70%, rgba(0,0,0,${this.spotlightOpacity}) 100%)`
    };
  }

  getPerformerStyle(performer: Performer) {
    const performerSize = 30; // px
    // Use animated positions if animating
    let x = performer.x;
    let y = performer.y;
    if (this.isAnimating && this.animatedPositions[performer.id]) {
      x = this.animatedPositions[performer.id].x;
      y = this.animatedPositions[performer.id].y;
    }

    const isCurrentUser = performer.id === this.currentUserId;
    const isSelected = this.isPerformerSelected(performer);
    const isHovered = this.isPerformerHovered(performer);

    const baseStyle = {
      left: x * this.pixelsPerFoot - performerSize / 2 + 'px',
      top: y * this.pixelsPerFoot - performerSize / 2 + 'px',
      zIndex: this.draggingId === performer.id ? 1000 : (isSelected ? 100 : (isHovered ? 50 : 10))
    };

    if (isCurrentUser) {
      return {
        ...baseStyle,
        boxShadow: '0 0 15px rgba(255, 255, 255, 0.8)',
        border: '2px solid white',
        borderRadius: '50%'
      };
    }

    return baseStyle;
  }

  getPerformerStyleWithColor(performer: Performer) {
    return {
      ...this.getPerformerStyle(performer),
      'background-color': this.getSkillColor(performer)
    };
  }

  getPreviousPositionStyle(performerId: string) {
    const performerSize = 30; // px
    const prevPos = this.getPreviousPosition(performerId);
    if (!prevPos) return { display: 'none' };
    
    return {
      left: prevPos.x * this.pixelsPerFoot - performerSize / 2 + 'px',
      top: prevPos.y * this.pixelsPerFoot - performerSize / 2 + 'px',
      opacity: 0.5,
      zIndex: 5
    };
  }

  openEditModal() {
    this.editWidth = this.width;
    this.editDepth = this.depth;
    this.editDivisions = this.divisions;
    this.editSegmentName = this.segmentName;
    
    // Initialize editSelectedStyles with the segment's styles
    this.editSelectedStyles = this.segment?.stylesInSegment?.map((styleName: string) => {
      const style = this.teamStyles.find(s => s.name === styleName);
      return style || { name: styleName, color: '#6366f1' }; // Fallback color if style not found
    }) || [];
    
    // Load team styles
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.teamService.getTeamById(currentUser.team._id).subscribe({
        next: (res) => {
          this.teamStyles = res.team.styles || [];
          // Update editSelectedStyles with full style objects after loading team styles
          this.editSelectedStyles = this.segment?.stylesInSegment?.map((styleName: string) => {
            const style = this.teamStyles.find(s => s.name === styleName);
            return style || { name: styleName, color: '#6366f1' };
          }) || [];
          this.showEditModal = true;
        },
        error: (err) => {
          console.error('Failed to load team styles:', err);
          this.showEditModal = true;
        }
      });
    } else {
      this.showEditModal = true;
    }
  }

  closeEditModal() {
    this.showEditModal = false;
  }

  submitEditModal() {
    this.depth = this.editDepth;
    this.width = this.editWidth;
    this.divisions = this.editDivisions;
    this.segmentName = this.editSegmentName;
    this.calculateStage();
    this.closeEditModal();

    // Update the segment object with the new styles
    if (this.segment) {
      this.segment.stylesInSegment = this.editSelectedStyles.map(s => s.name);
    }

    // Save changes to backend
    if (this.segment?._id) {
      this.segmentService.updateSegment(this.segment._id, {
        name: this.segmentName,
        depth: this.depth,
        width: this.width,
        divisions: this.divisions,
        stylesInSegment: this.editSelectedStyles.map(s => s.name)
      }).subscribe({
        next: () => {
          this.lastSaveTime = new Date();
          console.log('Stage settings updated successfully');
          // Trigger auto-save after successful backend save
          this.triggerAutoSave();
        },
        error: (err) => {
          console.error('Failed to update stage settings:', err);
          alert('Failed to save stage settings. Please try again.');
        }
      });
    } else {
      // If no segment ID (new segment), just trigger auto-save
      this.triggerAutoSave();
    }
  }

  saveSegment() {
    if (!this.segment?._id) return;
    console.log('Saving segment, current formations:', JSON.stringify(this.formations, null, 2));
    // Save all formations as arrays of {x, y, user}, including dummy performers
    const formations = this.formations.map(formation =>
      formation.map(p => {
        if (p?.id && p.id.startsWith('dummy-')) {
          // For dummy performers, store all necessary information
          const dummyData = {
            x: p.x,
            y: p.y,
            user: null,
            isDummy: true,
            dummyName: p.name,  // Use the exact name from the performer
            id: p.id,  // Preserve the exact ID
            skillLevels: p.skillLevels,
            height: p.height || 5.5
          };
          console.log('Saving dummy performer:', JSON.stringify(dummyData, null, 2));
          return dummyData;
        }
        return { 
          x: p.x, 
          y: p.y, 
          user: p.id,
          skillLevels: p.skillLevels,
          height: p.height || 5.5
        };
      })
    );
    console.log('Formations to be saved:', JSON.stringify(formations, null, 2));

    // Get unique user IDs from all formations (excluding dummy performers)
    const roster = Array.from(new Set(
      formations.flatMap(formation => 
        formation
          .filter(p => p.user) // Filter out dummy performers
          .map(p => p.user)
      )
    ));

    const updateData = { 
      formations, 
      formationDurations: this.formationDurations,
      animationDurations: this.animationDurations,
      roster,
      name: this.segmentName,
      styles: this.editSelectedStyles,
      stylesInSegment: this.editSelectedStyles.map(s => s.name)
    };
    console.log('Sending update data to backend:', JSON.stringify(updateData, null, 2));

    this.segmentService.updateSegment(this.segment._id, updateData).subscribe({
      next: () => {
        console.log('Segment saved successfully');
        this.lastSaveTime = new Date();
      },
      error: (err) => {
        console.error('Failed to save segment:', err);
        // Log the exact data that caused the error
        console.error('Error data:', JSON.stringify(updateData, null, 2));
      }
    });
  }

  getPerformerPath(performerId: string, prevMap?: { [id: string]: Performer }, nextMap?: { [id: string]: Performer }): string {
    let prevPos, performer;
    if (prevMap && nextMap) {
      prevPos = prevMap[performerId];
      performer = nextMap[performerId];
    } else {
      prevPos = this.getPreviousPosition(performerId);
      performer = this.performers.find(p => p.id === performerId);
    }
    if (!prevPos || !performer) return '';
    const startX = prevPos.x * this.pixelsPerFoot;
    const startY = prevPos.y * this.pixelsPerFoot;
    const endX = performer.x * this.pixelsPerFoot;
    const endY = performer.y * this.pixelsPerFoot;
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  async animateToNextFormation() {
    if (this.currentFormationIndex >= this.formations.length - 1) return;
    this.isAnimating = true;
    // Use the per-transition duration (in seconds), fallback to 1s
    const duration = (this.animationDurations[this.currentFormationIndex] || 1) * 1000;
    this.animationStartTime = Date.now();
    this.currentAnimationFrame = 0;

    // Get previous and next formation
    const prevFormation = this.formations[this.currentFormationIndex];
    const nextFormation = this.formations[this.currentFormationIndex + 1];

    // Map performer IDs to start and end positions
    const prevMap: { [id: string]: Performer } = {};
    prevFormation.forEach(p => { prevMap[p.id] = p; });
    const nextMap: { [id: string]: Performer } = {};
    nextFormation.forEach(p => { nextMap[p.id] = p; });

    const allIds = Array.from(new Set([...Object.keys(prevMap), ...Object.keys(nextMap)]));

    const animate = () => {
      const elapsed = Date.now() - this.animationStartTime;
      const progress = Math.min(elapsed / duration, 1);
      this.animatedPositions = {};
      allIds.forEach(id => {
        const start = prevMap[id] || nextMap[id];
        const end = nextMap[id] || prevMap[id];
        // Animate along path if available
        let x = start.x + (end.x - start.x) * progress;
        let y = start.y + (end.y - start.y) * progress;
        this.animatedPositions[id] = { x, y };
      });
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isAnimating = false;
        this.animatedPositions = {};
        this.currentFormationIndex++;
      }
    };
    requestAnimationFrame(animate);
  }

  onMusicFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.segmentService.getMusicPresignedUrl(this.segment._id, file.name, file.type).subscribe({
      next: ({ url, key }) => {
        fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        }).then(response => {
          if (response.ok) {
            // Construct the S3 URL
            const musicUrl = `https://${environment.s3Bucket}.s3.${environment.s3Region}.amazonaws.com/${key}`;
            // Save musicUrl to segment
            this.segmentService.updateSegment(this.segment._id, { musicUrl }).subscribe({
              next: () => {
                alert('Music uploaded and saved!');
                // Refresh the audio player with a new signed URL
                this.getSignedMusicUrl();
              },
              error: (err) => {
                console.error('Failed to save music URL:', err);
                alert('Failed to save music URL!');
              }
            });
          } else {
            console.error('Upload failed:', response.status, response.statusText);
            alert('Failed to upload file to S3');
          }
        }).catch(err => {
          console.error('Upload error:', err);
          alert('Failed to upload file to S3');
        });
      },
      error: (err) => {
        console.error('Failed to get S3 upload URL:', err);
        alert('Failed to get S3 upload URL');
      }
    });
    this.triggerAutoSave();
  }

  // Add method to get signed URL for playing music
  getSignedMusicUrl() {
    if (!this.segment?._id) return;
    this.segmentService.getMusicUrl(this.segment._id).subscribe({
      next: ({ url }) => {
        this.signedMusicUrl = url;
        this.initWaveform();
      },
      error: () => alert('Failed to get music URL')
    });
  }

  initWaveform() {
    if (this.waveSurfer) {
      this.waveSurfer.destroy();
    }
    this.waveSurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: '#3b82f6',
      progressColor: '#1e40af',
      height: 80,
      barWidth: 2,
      barRadius: 2,
      cursorColor: '#fff'
    });
    this.waveSurfer.load(this.signedMusicUrl!);
    this.waveSurfer.on('finish', () => {
      this.isPlaying = false;
    });
  }

  togglePlay() {
    if (this.waveSurfer) {
      this.waveSurfer.playPause();
      this.isPlaying = this.waveSurfer.isPlaying();
      if (this.isPlaying) {
        this.startFormationPlayback();
      } else {
        this.stopFormationPlayback();
      }
    }
  }

  startFormationPlayback() {
    this.playbackTime = 0;
    this.stopFormationPlayback();
    this.playbackTimer = setInterval(() => {
      if (!this.waveSurfer) return;
      this.playbackTime = this.waveSurfer.getCurrentTime();
      let t = 0;
      let found = false;
      for (let i = 0; i < this.formations.length; i++) {
        const hold = this.formationDurations[i] || 4;
        if (this.playbackTime < t + hold) {
          this.playingFormationIndex = i;
          this.inTransition = false;
          this.animatedPositions = {};
          found = true;
          break;
        }
        t += hold;
        if (i < this.animationDurations.length) {
          const trans = this.animationDurations[i] || 1;
          if (this.playbackTime < t + trans) {
            // During transition, animate between i and i+1
            this.playingFormationIndex = i + 1;
            this.inTransition = true;
            const progress = (this.playbackTime - t) / trans;
            this.animatedPositions = this.interpolateFormations(i, i + 1, progress);
            found = true;
            break;
          }
          t += trans;
        }
      }
      if (!found) {
        // If past all, show last formation
        this.playingFormationIndex = this.formations.length - 1;
        this.inTransition = false;
        this.animatedPositions = {};
      }
    }, 30);
  }

  interpolateFormations(fromIdx: number, toIdx: number, progress: number) {
    const from = this.formations[fromIdx] || [];
    const to = this.formations[toIdx] || [];
    const pos: { [id: string]: { x: number, y: number } } = {};
    // Map by performer id
    const fromMap: { [id: string]: Performer } = {};
    from.forEach(p => { fromMap[p.id] = p; });
    const toMap: { [id: string]: Performer } = {};
    to.forEach(p => { toMap[p.id] = p; });
    const allIds = Array.from(new Set([...Object.keys(fromMap), ...Object.keys(toMap)]));
    allIds.forEach(id => {
      const start = fromMap[id] || toMap[id];
      const end = toMap[id] || fromMap[id];
      pos[id] = {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress
      };
    });
    return pos;
  }

  stopFormationPlayback() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  ngAfterViewChecked() {
    if (
      this.signedMusicUrl &&
      document.getElementById('waveform') &&
      this.waveformInitializedForUrl !== this.signedMusicUrl
    ) {
      this.initWaveform();
      this.waveformInitializedForUrl = this.signedMusicUrl;
    }
  }

  ngOnDestroy() {
    this.stopFormationPlayback();
    if (this.waveSurfer) {
      this.waveSurfer.destroy();
    }
    if (this.unifiedFormationInterval) {
      clearInterval(this.unifiedFormationInterval);
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  getTimelineTotalDuration(): number {
    let total = 0;
    for (let i = 0; i < this.formations.length; i++) {
      total += this.formationDurations[i] || 4;
      if (i < this.animationDurations.length) {
        total += this.animationDurations[i] || 1;
      }
    }
    return Math.max(total, 1); // Ensure we never return 0 to avoid division by zero
  }

  getFormationPercent(i: number): number {
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return 0;
    const duration = this.formationDurations[i] || 5;
    return (duration / this.waveSurfer.getDuration()) * 100;
  }

  getTransitionPercent(i: number): number {
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return 0;
    const duration = this.animationDurations[i] || 1;
    return (duration / this.waveSurfer.getDuration()) * 100;
  }

  getPlayheadPercent(): number {
    const total = this.getTimelineTotalDuration();
    return total ? (this.playbackTime / total) * 100 : 0;
  }

  getFormationAtTime(time: number): number {
    let t = 0;
    for (let i = 0; i < this.formations.length; i++) {
      const hold = this.formationDurations[i] || 4;
      if (time < t + hold) {
        return i;
      }
      t += hold;
      if (i < this.animationDurations.length) {
        const trans = this.animationDurations[i] || 1;
        if (time < t + trans) {
          // During transition, return the next formation index
          return i + 1;
        }
        t += trans;
      }
    }
    // If past all, return last formation
    return this.formations.length - 1;
  }

  onFormationResizeStart(event: MouseEvent, i: number) {
    console.log('Formation resize start', i);
    event.stopPropagation();
    this.resizingFormationIndex = i;
    this.resizingStartX = event.clientX;
    this.resizingStartDuration = this.formationDurations[i];
    window.addEventListener('mousemove', this.onFormationResizeMove);
    window.addEventListener('mouseup', this.onFormationResizeEnd);
  }

  onFormationResizeMove = (event: MouseEvent) => {
    console.log('Formation resize move');
    if (this.resizingFormationIndex === null) return;
    const dx = event.clientX - this.resizingStartX;
    const durationPx = this.waveformWidthPx || 1; // prevent divide by zero
    const timelineDuration = this.getTimelineTotalDuration() || 1;
    const startDuration = this.resizingStartDuration || 1;
    console.log({ dx, durationPx, timelineDuration, startDuration });
    let newDuration = startDuration + (dx / durationPx) * timelineDuration;
    newDuration = Math.max(0.2, newDuration); // minimum duration
    if (isNaN(newDuration)) {
      console.warn('newDuration is NaN', { startDuration, dx, durationPx, timelineDuration });
      return;
    }
    this.formationDurations[this.resizingFormationIndex] = newDuration;
    this.formationDurations = [...this.formationDurations]; // force change detection
    console.log('formationDurations', this.formationDurations);
  };

  onFormationResizeEnd = () => {
    console.log('Formation resize end');
    this.resizingFormationIndex = null;
    window.removeEventListener('mousemove', this.onFormationResizeMove);
    window.removeEventListener('mouseup', this.onFormationResizeEnd);
  };

  getFormationFlex(i: number): number {
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return (this.formationDurations[i] || 4);
    return (this.formationDurations[i] || 4);
  }

  getTransitionFlex(i: number): number {
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return (this.animationDurations[i] || 1);
    return (this.animationDurations[i] || 1);
  }

  onTransitionResizeStart(event: MouseEvent, i: number) {
    event.stopPropagation();
    this.resizingTransitionIndex = i;
    this.resizingTransitionStartX = event.clientX;
    this.resizingTransitionStartDuration = this.animationDurations[i];
    window.addEventListener('mousemove', this.onTransitionResizeMove);
    window.addEventListener('mouseup', this.onTransitionResizeEnd);
  }

  onTransitionResizeMove = (event: MouseEvent) => {
    if (this.resizingTransitionIndex === null) return;
    const dx = event.clientX - this.resizingTransitionStartX;
    const durationPx = this.waveformWidthPx;
    const total = this.getTimelineTotalDuration();
    let newDuration = this.resizingTransitionStartDuration + (dx / durationPx) * total;
    newDuration = Math.max(0.2, newDuration); // minimum duration
    this.animationDurations[this.resizingTransitionIndex] = newDuration;
    this.animationDurations = [...this.animationDurations]; // force change detection
  };

  onTransitionResizeEnd = () => {
    this.resizingTransitionIndex = null;
    window.removeEventListener('mousemove', this.onTransitionResizeMove);
    window.removeEventListener('mouseup', this.onTransitionResizeEnd);
  };

  getTimelinePixelWidth(): number {
    // Calculate total width needed for all formations and transitions
    let totalWidth = 0;
    for (let i = 0; i < this.formations.length; i++) {
      totalWidth += this.getFormationPixelWidth(i);
      if (i < this.animationDurations.length) {
        totalWidth += this.getTransitionPixelWidth(i);
      }
    }
    return Math.max(totalWidth, this.waveformWidthPx);
  }

  getFormationPixelWidth(i: number): number {
    const duration = this.formationDurations[i] || 5;
    // Each second is 100 pixels wide
    return Math.max(duration * 100, 110); // Minimum width of 110px
  }

  getTransitionPixelWidth(i: number): number {
    const duration = this.animationDurations[i] || 1;
    // Each second is 100 pixels wide
    return Math.max(duration * 100, 40); // Minimum width of 40px
  }

  getPlayheadPixel(): number {
    return this.playbackTime * this.pixelsPerSecond;
  }

  selectPerformer(performer: Performer) {
    if (this.isShiftPressed) {
      // Multi-select mode
      if (this.selectedPerformerIds.has(performer.id)) {
        // If already selected, remove from selection
        this.selectedPerformerIds.delete(performer.id);
        // Update primary selection if needed
        if (this.selectedPerformerId === performer.id) {
          this.selectedPerformerId = this.selectedPerformerIds.size > 0 ? 
            Array.from(this.selectedPerformerIds)[0] : null;
        }
      } else {
        // If not selected, add to selection
        this.selectedPerformerIds.add(performer.id);
        this.selectedPerformerId = performer.id;
      }
    } else {
      // Single select mode
      if (this.selectedPerformerIds.has(performer.id)) {
        // If already selected, deselect
        this.selectedPerformerIds.clear();
        this.selectedPerformerId = null;
      } else {
        // If not selected, select only this one
        this.selectedPerformerIds.clear();
        this.selectedPerformerIds.add(performer.id);
        this.selectedPerformerId = performer.id;
      }
    }
    this.triggerAutoSave();
  }

  deleteDancer() {
    if (!this.selectedPerformerId) return;

    // Remove the dancer from all formations
    this.formations = this.formations.map(formation => 
      formation.filter(p => p.id !== this.selectedPerformerId)
    );

    // Remove from segment roster
    this.segmentRoster = this.segmentRoster.filter(
      m => m._id !== this.selectedPerformerId
    );

    this.selectedPerformerId = null;
  }

  getFormationStartPercent(i: number): number {
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return 0;
    let total = 0;
    for (let j = 0; j < i; j++) {
      total += this.formationDurations[j] || 5;
      if (j < this.animationDurations.length) {
        total += this.animationDurations[j] || 1;
      }
    }
    return (total / this.waveSurfer.getDuration()) * 100;
  }

  getTransitionStartPercent(i: number): number {
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return 0;
    let total = 0;
    for (let j = 0; j <= i; j++) {
      total += this.formationDurations[j] || 5;
      if (j < i) {
        total += this.animationDurations[j] || 1;
      }
    }
    return (total / this.waveSurfer.getDuration()) * 100;
  }

  getTimelineBarAtCursor(x: number): { type: 'formation' | 'transition', index: number, startPx: number, widthPx: number } | null {
    // Find which formation or transition bar the cursor is over
    let px = 0;
    for (let i = 0; i < this.formations.length; i++) {
      const width = this.getFormationPixelWidth(i);
      if (x >= px && x < px + width) {
        return { type: 'formation', index: i, startPx: px, widthPx: width };
      }
      px += width;
      if (i < this.animationDurations.length) {
        const tWidth = this.getTransitionPixelWidth(i);
        if (x >= px && x < px + tWidth) {
          return { type: 'transition', index: i, startPx: px, widthPx: tWidth };
        }
        px += tWidth;
      }
    }
    return null;
  }

  getFormationStartAudioTime(i: number): number {
    // Returns the audio time at which this formation starts
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return 0;
    let timelineTotal = this.getTimelineTotalDuration();
    let audioDuration = this.waveSurfer.getDuration();
    let t = 0;
    for (let j = 0; j < i; j++) {
      t += this.formationDurations[j] || 4;
      if (j < this.animationDurations.length) {
        t += this.animationDurations[j] || 1;
      }
    }
    return (t / timelineTotal) * audioDuration;
  }

  getFormationAudioDuration(i: number): number {
    // Returns the audio duration for this formation
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return 0;
    let timelineTotal = this.getTimelineTotalDuration();
    let audioDuration = this.waveSurfer.getDuration();
    const duration = this.formationDurations[i] || 4;
    return (duration / timelineTotal) * audioDuration;
  }

  // Returns the timeline time (in seconds) at the start of a formation
  getFormationStartTimelineTime(i: number): number {
    let t = 0;
    for (let j = 0; j < i; j++) {
      t += this.formationDurations[j] || 4;
      if (j < this.animationDurations.length) {
        t += this.animationDurations[j] || 1;
      }
    }
    return t;
  }

  getTransitionStartTimelineTime(i: number): number {
    // Returns the timeline time at which this transition starts
    let t = 0;
    for (let j = 0; j <= i; j++) {
      t += this.formationDurations[j] || 4;
      if (j < i) {
        t += this.animationDurations[j] || 1;
      }
    }
    return t;
  }

  onTimelineMouseMove(event: MouseEvent) {
    const bar = this.timelineBarRef?.nativeElement;
    if (!bar || !this.waveSurfer || !this.waveSurfer.getDuration()) return;
    const rect = bar.getBoundingClientRect();
    const x = event.clientX - rect.left + bar.scrollLeft;
    this.hoveredTimelineX = x;
    const barInfo = this.getTimelineBarAtCursor(x);
    if (barInfo) {
      let timelineTime = 0;
      if (barInfo.type === 'formation') {
        const percentInFormation = Math.max(0, Math.min(1, (x - barInfo.startPx) / barInfo.widthPx));
        const formationStartTimeline = this.getFormationStartTimelineTime(barInfo.index);
        const formationDurationTimeline = this.formationDurations[barInfo.index] || 4;
        timelineTime = formationStartTimeline + percentInFormation * formationDurationTimeline;
      } else if (barInfo.type === 'transition') {
        const percentInTransition = Math.max(0, Math.min(1, (x - barInfo.startPx) / barInfo.widthPx));
        const transitionStartTimeline = this.getTransitionStartTimelineTime(barInfo.index);
        const transitionDurationTimeline = this.animationDurations[barInfo.index] || 1;
        timelineTime = transitionStartTimeline + percentInTransition * transitionDurationTimeline;
      }
      this.hoveredTimelineTime = timelineTime;
    } else {
      this.hoveredTimelineTime = null;
    }
  }

  onTimelineMouseLeave() {
    this.hoveredTimelineTime = null;
    this.hoveredTimelineX = null;
  }

  onTimelineClick(event: MouseEvent) {
    const bar = this.timelineBarRef?.nativeElement;
    if (!bar || !this.waveSurfer || !this.waveSurfer.getDuration()) return;
    const rect = bar.getBoundingClientRect();
    const x = event.clientX - rect.left + bar.scrollLeft;
    const barInfo = this.getTimelineBarAtCursor(x);
    let timelineTime = null;
    if (barInfo) {
      if (barInfo.type === 'formation') {
        const percentInFormation = Math.max(0, Math.min(1, (x - barInfo.startPx) / barInfo.widthPx));
        const formationStartTimeline = this.getFormationStartTimelineTime(barInfo.index);
        const formationDurationTimeline = this.formationDurations[barInfo.index] || 4;
        timelineTime = formationStartTimeline + percentInFormation * formationDurationTimeline;
      } else if (barInfo.type === 'transition') {
        const percentInTransition = Math.max(0, Math.min(1, (x - barInfo.startPx) / barInfo.widthPx));
        const transitionStartTimeline = this.getTransitionStartTimelineTime(barInfo.index);
        const transitionDurationTimeline = this.animationDurations[barInfo.index] || 1;
        timelineTime = transitionStartTimeline + percentInTransition * transitionDurationTimeline;
      }
    }
    if (timelineTime !== null && this.waveSurfer && this.waveSurfer.getDuration()) {
      const audioDuration = this.waveSurfer.getDuration();
      // Clamp to audio duration
      const audioTime = Math.max(0, Math.min(timelineTime, audioDuration));
      this.waveSurfer.seekTo(audioTime / audioDuration);
      this.isPlaying = this.waveSurfer.isPlaying();
      this.playbackTime = audioTime;
      this.hoveredTimelineTime = audioTime;
    }
  }

  getHoveredPlayheadPixel(): number {
    if (this.hoveredTimelineX !== null) {
      return this.hoveredTimelineX;
    }
    if (this.hoveredTimelineTime !== null && this.waveSurfer && this.waveSurfer.getDuration()) {
      const audioDuration = this.waveSurfer.getDuration();
      const percent = this.hoveredTimelineTime / audioDuration;
      return percent * (this.waveformWidthPx || 1);
    }
    return this.getPlayheadPixel();
  }

  toggleUnifiedPlay() {
    if (this.signedMusicUrl && this.waveSurfer) {
      // If audio is present, use audio controls
      this.togglePlay();
      return;
    }
    // No audio: animate through formations
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.unifiedFormationInterval = setInterval(() => {
        if (this.currentFormationIndex < this.formations.length - 1) {
          this.currentFormationIndex++;
          // Set playbackTime to the start time of the current formation
          let t = 0;
          for (let i = 0; i < this.currentFormationIndex; i++) {
            t += this.formationDurations[i] || 4;
            if (i < this.animationDurations.length) {
              t += this.animationDurations[i] || 1;
            }
          }
          this.playbackTime = t;
        } else {
          this.isPlaying = false;
          clearInterval(this.unifiedFormationInterval);
        }
      }, 1200); // 1.2s per formation (adjust as needed)
    } else {
      this.isPlaying = false;
      clearInterval(this.unifiedFormationInterval);
    }
  }

  getSkillColor(performer: Performer): string {
    if (!this.showColorBySkill || !this.selectedStyle) {
      return '#3b82f6'; // blue
    }

    // Get the user from teamRoster to access their skill levels
    const user = this.teamRoster.find(m => m._id === performer.id);
    if (!user) {
      return '#3b82f6'; // blue
    }

    // Get skill level for the selected style
    const styleName = this.selectedStyle.name.toLowerCase();
    const skillLevel = user.skillLevels?.[styleName];
    if (!skillLevel) {
      return '#3b82f6'; // blue
    }

    // Blue (#3b82f6) to Yellow (#ffe14a) gradient
    const blue = { r: 59, g: 130, b: 246 };    // #3b82f6
    const yellow = { r: 255, g: 225, b: 74 };  // #ffe14a
    const t = (skillLevel - 1) / 4; // skillLevel: 1-5
    const r = Math.round(blue.r + (yellow.r - blue.r) * t);
    const g = Math.round(blue.g + (yellow.g - blue.g) * t);
    const b = Math.round(blue.b + (yellow.b - blue.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  toggleColorBySkill() {
    this.showColorBySkill = !this.showColorBySkill;
    if (!this.showColorBySkill) {
      this.selectedStyle = null;
    } else if (this.segment?.stylesInSegment && this.segment.stylesInSegment.length > 0) {
      // Get the team's styles to get the color
      const currentUser = this.authService.getCurrentUser();
      if (currentUser?.team?._id) {
        this.teamService.getTeamById(currentUser.team._id).subscribe({
          next: (res) => {
            const teamStyle = res.team.styles.find((s: Style) => 
              s.name.toLowerCase() === this.segment.stylesInSegment[0].toLowerCase()
            );
            this.selectedStyle = teamStyle || null;
            console.log('Selected style:', this.selectedStyle);
          }
        });
      }
    } else {
      this.selectedStyle = null;
    }
  }

  selectStyle(style: Style) {
    this.selectedStyle = style;
    console.log('Selected style:', style);
    // Update skill levels for all performers based on the new style
    this.formations = this.formations.map(formation =>
      formation.map(performer => {
        if (performer.id.startsWith('dummy-')) {
          return performer;
        }
        const user = this.teamRoster.find(m => m._id === performer.id);
        const skillLevel = user?.skillLevels?.[style.name.toLowerCase()] || 1;
        console.log('Updated performer skill level:', {
          performer: performer.name,
          style: style.name,
          skillLevel,
          skillLevels: user?.skillLevels
        });
        return {
          ...performer,
          skillLevels: {
            [style.name.toLowerCase()]: skillLevel
          }
        };
      })
    );
  }

  get segmentStyles(): Style[] {
    if (!this.segment?.stylesInSegment) return [];
    // Get the team's styles to get the colors
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return [];
    
    // Return styles with their actual colors from the team
    return this.segment.stylesInSegment.map((name: string) => {
      const teamStyle = this.teamRoster.find(m => m.team?._id === currentUser.team._id)?.team?.styles?.find(
        (s: Style) => s.name.toLowerCase() === name.toLowerCase()
      );
      return {
        name,
        color: teamStyle?.color || '#ffffff'
      };
    });
  }

  toggleStyleSelection(style: Style) {
    const index = this.editSelectedStyles.findIndex(s => s.name === style.name);
    if (index === -1) {
      this.editSelectedStyles.push(style);
    } else {
      this.editSelectedStyles.splice(index, 1);
    }
  }

  isStyleSelected(style: Style): boolean {
    return this.editSelectedStyles.some(s => s.name === style.name);
  }

  // Animate performer movement between two formations for 1 second
  animateFormationTransition(fromIdx: number, toIdx: number): Promise<void> {
    this.inTransition = true;
    const duration = 300; // 0.3s
    const start = performance.now();

    return new Promise((resolve) => {
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        this.animatedPositions = this.interpolateFormations(fromIdx, toIdx, progress);
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.animatedPositions = {};
          this.inTransition = false;
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  }

  // Add new method for triggering auto-save
  private triggerAutoSave() {
    this.saveSubject.next();
  }

  toggleAddPerformerDropdown() {
    this.showAddPerformerDropdown = !this.showAddPerformerDropdown;
    if (this.showAddPerformerDropdown) {
      this.showUserAssignmentDropdown = false;
    }
  }

  toggleUserAssignmentDropdown() {
    this.showUserAssignmentDropdown = !this.showUserAssignmentDropdown;
  }

  isDummyPerformer(performer: Performer): boolean {
    return performer.id.startsWith('dummy-');
  }

  convertToDummy(performer: Performer) {
    // Create a new dummy performer with the same properties
    const dummyPerformer: Performer = {
      id: `dummy-${this.dummyCounter++}`,
      name: `Dummy ${this.dummyCounter}`,
      x: performer.x,
      y: performer.y,
      skillLevels: {},
      height: performer.height,
      isDummy: true,
      dummyName: `Dummy ${this.dummyCounter}`
    };

    // Replace the performer in the current formation
    const index = this.performers.findIndex(p => p.id === performer.id);
    if (index !== -1) {
      this.performers[index] = dummyPerformer;
      this.triggerAutoSave();
    }
  }

  assignDummyToUser(dummyPerformer: Performer, user: any) {
    // Create a new performer with the user's properties
    const newPerformer: Performer = {
      id: user._id,
      name: user.name,
      x: dummyPerformer.x,
      y: dummyPerformer.y,
      skillLevels: user.skillLevels || {},
      height: user.height || 5.5
    };

    // Replace the dummy performer in the current formation
    const index = this.performers.findIndex(p => p.id === dummyPerformer.id);
    if (index !== -1) {
      this.performers[index] = newPerformer;
      this.triggerAutoSave();
    }
  }

  updatePerformerName() {
    if (!this.selectedPerformer) return;
    // Update in teamRoster as well
    const user = this.teamRoster.find(m => m._id === this.selectedPerformer!.id);
    if (user && this.teamService) {
      user.name = this.selectedPerformer.name;
      this.teamService.updateUser(user._id, { name: user.name }).subscribe();
    }
    this.triggerAutoSave();
  }

  updatePerformerHeight() {
    if (!this.selectedPerformer) return;
    // Ensure height is within reasonable bounds
    if (this.selectedPerformer.height) {
      this.selectedPerformer.height = Math.max(0, Math.min(12, this.selectedPerformer.height));
    }
    // Update in teamRoster as well
    const user = this.teamRoster.find(m => m._id === this.selectedPerformer!.id);
    if (user && this.teamService) {
      user.height = this.selectedPerformer.height;
      this.teamService.updateUser(user._id, { height: user.height }).subscribe();
    }
    this.triggerAutoSave();
  }

  updatePerformerSkill(styleName: string) {
    if (!this.selectedPerformer) return;
    // Ensure skill level is within bounds (1-5)
    const skillLevel = this.selectedPerformer.skillLevels[styleName.toLowerCase()];
    if (skillLevel) {
      this.selectedPerformer.skillLevels[styleName.toLowerCase()] = Math.max(1, Math.min(5, skillLevel));
    }
    // Update in teamRoster as well
    const user = this.teamRoster.find(m => m._id === this.selectedPerformer!.id);
    if (user && this.teamService) {
      user.skillLevels = { ...this.selectedPerformer.skillLevels };
      this.teamService.updateUser(user._id, { skillLevels: user.skillLevels }).subscribe();
    }
    this.triggerAutoSave();
  }

  removePerformer() {
    if (this.selectedPerformerIds.size === 0) return;
    
    // Remove all selected performers from current formation
    const currentFormation = this.formations[this.currentFormationIndex];
    if (!currentFormation) return;
    
    this.formations[this.currentFormationIndex] = currentFormation.filter(
      p => !this.selectedPerformerIds.has(p.id)
    );
    
    this.selectedPerformerIds.clear();
    this.selectedPerformerId = null;
    this.triggerAutoSave();
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      this.isShiftPressed = true;
      console.log('Shift pressed, isShiftPressed:', this.isShiftPressed);
    }
  };

  handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      this.isShiftPressed = false;
      console.log('Shift released, isShiftPressed:', this.isShiftPressed);
    }
  };

  onPerformerMouseEnter(performer: Performer) {
    this.hoveredPerformerId = performer.id;
  }

  onPerformerMouseLeave() {
    this.hoveredPerformerId = null;
  }

  isPerformerSelected(performer: Performer): boolean {
    return this.selectedPerformerIds.has(performer.id);
  }

  isPerformerHovered(performer: Performer): boolean {
    return this.hoveredPerformerId === performer.id;
  }

  onStageClick(event: MouseEvent) {
    // Only deselect if clicking directly on the stage (not on a performer)
    if (event.target === this.stageRef.nativeElement) {
      this.selectedPerformerIds.clear();
      this.selectedPerformerId = null;
      this.triggerAutoSave();
    }
  }

  getStageStyle() {
    return {
      'position': 'relative',
      'background-color': '#1a1a1a',
      'border-radius': '4px',
      'overflow': 'hidden'
    };
  }

  swapSelectedPerformers() {
    if (this.selectedPerformerIds.size !== 2) return;

    const currentFormation = this.formations[this.currentFormationIndex];
    if (!currentFormation) return;

    // Get the two selected performers
    const [id1, id2] = Array.from(this.selectedPerformerIds);
    const performer1 = currentFormation.find(p => p.id === id1);
    const performer2 = currentFormation.find(p => p.id === id2);

    if (!performer1 || !performer2) return;

    // Store their current positions
    const tempX = performer1.x;
    const tempY = performer1.y;

    // Swap their positions
    performer1.x = performer2.x;
    performer1.y = performer2.y;
    performer2.x = tempX;
    performer2.y = tempY;

    // Trigger auto-save
    this.triggerAutoSave();
  }
}
 