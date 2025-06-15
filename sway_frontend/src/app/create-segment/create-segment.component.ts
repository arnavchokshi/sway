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

interface Performer {
  id: string;
  name: string;
  x: number; // in feet
  y: number; // in feet
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

  constructor(
    private teamService: TeamService,
    private authService: AuthService,
    private segmentService: SegmentService,
    private route: ActivatedRoute,
    private renderer: Renderer2
  ) {}

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

  set performers(val: Performer[]) {
    this.formations[this.currentFormationIndex] = val;
  }

  ngOnInit() {
    const segmentId = this.route.snapshot.queryParamMap.get('id') || this.route.snapshot.paramMap.get('id');
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = currentUser?.captain || false;
    this.currentUserId = currentUser?._id || '';
    
    if (segmentId) {
      this.segmentService.getSegmentById(segmentId).subscribe({
        next: (res) => {
          this.segment = res.segment;
          console.log('Loaded segment:', this.segment);
          if (this.segment?.musicUrl) {
            this.getSignedMusicUrl();
          }
          this.depth = this.segment.depth;
          this.width = this.segment.width;
          this.divisions = this.segment.divisions;
          this.calculateStage();

          // Load roster first
          if (currentUser?.team?._id) {
            this.teamService.getTeamById(currentUser.team._id).subscribe({
              next: (res) => {
                this.teamRoster = res.team.members || [];
                // Update segment roster based on the segment's roster
                if (this.segment.roster) {
                  this.segmentRoster = this.teamRoster.filter(member => 
                    this.segment.roster.includes(member._id)
                  );
                } else {
                  this.segmentRoster = [];
                }

                // Now map the formations with user data
                if (this.segment.formations && this.segment.formations.length > 0) {
                  this.formations = this.segment.formations.map((formation: any[]) => 
                    formation.map((p: { isDummy?: boolean; dummyName?: string; x: number; y: number; user?: string }) => {
                      if (p.isDummy) {
                        return {
                          id: `dummy-${this.dummyCounter++}`,
                          name: p.dummyName,
                          x: p.x,
                          y: p.y
                        };
                      } else {
                        const user = this.teamRoster.find(m => m._id === p.user);
                        return {
                          id: p.user,
                          name: user ? user.name : 'Unknown',
                          x: p.x,
                          y: p.y
                        };
                      }
                    })
                  );
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
  }

  calculateStage() {
    this.pixelsPerFoot = 20;
    this.stageWidthPx = this.width * this.pixelsPerFoot;
    this.stageHeightPx = this.depth * this.pixelsPerFoot;
    // Main lines
    this.mainVerticals = [];
    this.mainHorizontals = [];
    this.subVerticals = [];
    this.subHorizontals = [];
    for (let i = 1; i <= 7; i++) {
      this.mainVerticals.push((i / 8) * this.stageWidthPx);
    }
    for (let i = 1; i <= 3; i++) {
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

  // Formation navigation
  prevFormation() {
    if (this.currentFormationIndex > 0) this.currentFormationIndex--;
  }

  onNextFormationClick() {
    if (!this.isAnimating && this.currentFormationIndex < this.formations.length - 1) {
      this.animateToNextFormation();
    }
  }

  addFormation() {
    // Clone current formation, no custom path
    const clone = this.performers.map(p => ({ ...p }));
    this.formations.push(clone);
    this.formationDurations.push(5); // Default to 5 seconds
    
    // Add animation duration for the transition from previous formation
    if (this.formations.length > 1) {
      this.animationDurations.push(1); // Default to 1 second transition
    }
    
    this.currentFormationIndex = this.formations.length - 1;

    // Force a reflow to ensure the timeline updates
    setTimeout(() => {
      if (this.timelineBarRef) {
        this.timelineBarRef.nativeElement.scrollLeft = this.getTimelinePixelWidth();
      }
    }, 0);
  }

  // Performer management
  removePerformer(performerId: string) {
    this.formations = this.formations.map(formation => formation.filter(p => p.id !== performerId));
  }
  addPerformer(member: any) {
    // Add to all formations at center
    this.formations = this.formations.map(formation => [
      ...formation,
      { id: member._id, name: member.name, x: this.width / 2, y: this.depth / 2 }
    ]);
  }
  addPerformerFromRoster(dancer: any) {
    // Add the dancer to all formations
    this.formations = this.formations.map(formation => {
      // Check if dancer is already in this formation
      if (!formation.some(p => p.id === dancer._id)) {
        return [...formation, {
          id: dancer._id,
          name: dancer.name,
          x: this.width / 2,
          y: this.depth / 2
        }];
      }
      return formation;
    });

    // Update segment roster if not already included
    if (!this.segmentRoster.some(m => m._id === dancer._id)) {
      this.segmentRoster = [...this.segmentRoster, dancer];
    }
  }
  addDummyPerformer() {
    const dummyId = `dummy-${this.dummyCounter++}`;
    const dummyName = `${this.dummyCounter - 1}`;
    // Add dummy performer to all formations
    this.formations = this.formations.map(formation => [
      ...formation,
      { id: dummyId, name: dummyName, x: this.width / 2, y: this.depth / 2 }
    ]);
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
    this.draggingId = performer.id;
    let clientX = 0, clientY = 0;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    const stageRect = this.stageRef.nativeElement.getBoundingClientRect();
    this.dragOffset.x = clientX - (stageRect.left + performer.x * this.pixelsPerFoot);
    this.dragOffset.y = clientY - (stageRect.top + performer.y * this.pixelsPerFoot);
    this.renderer.listen('window', 'mousemove', this.onDragMove.bind(this));
    this.renderer.listen('window', 'touchmove', this.onDragMove.bind(this));
    this.renderer.listen('window', 'mouseup', this.onDragEnd.bind(this));
    this.renderer.listen('window', 'touchend', this.onDragEnd.bind(this));
    event.preventDefault();
  }

  onDragMove = (event: MouseEvent | TouchEvent) => {
    if (!this.draggingId) return;
    let clientX = 0, clientY = 0;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    const stageRect = this.stageRef.nativeElement.getBoundingClientRect();
    let x = (clientX - stageRect.left - this.dragOffset.x) / this.pixelsPerFoot;
    let y = (clientY - stageRect.top - this.dragOffset.y) / this.pixelsPerFoot;

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

    this.performers = this.performers.map(p =>
      p.id === this.draggingId ? { ...p, x, y } : p
    );
  };

  onDragEnd = () => {
    this.draggingId = null;
  };

  onPerformerClick(performer: Performer) {
    this.selectedPerformerId = this.selectedPerformerId === performer.id ? null : performer.id;
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
    const baseStyle = {
      left: x * this.pixelsPerFoot - performerSize / 2 + 'px',
      top: y * this.pixelsPerFoot - performerSize / 2 + 'px',
      zIndex: this.draggingId === performer.id ? 1000 : 10
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
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
  }

  submitEditModal() {
    this.width = this.editWidth;
    this.depth = this.editDepth;
    this.divisions = this.editDivisions;
    this.calculateStage();
    this.showEditModal = false;
  }

  saveSegment() {
    if (!this.segment?._id) return;
    // Save all formations as arrays of {x, y, user}, including dummy performers
    const formations = this.formations.map(formation =>
      formation.map(p => {
        if (p?.id && p.id.startsWith('dummy-')) {
          // For dummy performers, store the name and position
          const dummyData = {
            x: p.x,
            y: p.y,
            user: null,
            isDummy: true,
            dummyName: p.name
          };
          return dummyData;
        }
        return { x: p.x, y: p.y, user: p.id };
      })
    );

    // Get unique user IDs from all formations (excluding dummy performers)
    const roster = Array.from(new Set(
      formations.flatMap(formation => 
        formation
          .filter(p => p.user) // Filter out dummy performers
          .map(p => p.user)
      )
    ));

    this.segmentService.updateSegment(this.segment._id, { 
      formations, 
      formationDurations: this.formationDurations,
      animationDurations: this.animationDurations,
      roster // Add the roster to the update
    }).subscribe({
      next: () => alert('Segment saved!'),
      error: () => alert('Failed to save segment!')
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
  }

  jumpToFormation(index: number) {
    this.currentFormationIndex = index;
    // Calculate the time offset for the start of this formation
    let t = 0;
    for (let i = 0; i < index; i++) {
      t += (this.formationDurations[i] || 4);
      if (i < this.animationDurations.length) {
        t += (this.animationDurations[i] || 1);
      }
    }
    if (this.waveSurfer) {
      this.waveSurfer.seekTo(t / this.waveSurfer.getDuration());
      this.isPlaying = this.waveSurfer.isPlaying();
    }
    this.playingFormationIndex = index;
  }

  // Returns the total timeline duration (formations + transitions)
  getTimelineTotalDuration(): number {
    let total = 0;
    for (let i = 0; i < this.formations.length; i++) {
      total += this.formationDurations[i] || 4;
      if (i < this.animationDurations.length) {
        total += this.animationDurations[i] || 1;
      }
    }
    return total;
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

  // Returns the formation index for a given time in the audio
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
    this.selectedPerformerId = performer.id;
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
}
 