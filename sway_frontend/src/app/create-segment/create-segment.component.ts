import { Component, OnInit, ElementRef, ViewChild, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TeamService } from '../services/team.service';
import { AuthService } from '../services/auth.service';
import { SegmentService } from '../services/segment.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { environment } from '../../environments/environment';

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
export class CreateSegmentComponent implements OnInit {
  @ViewChild('stageRef') stageRef!: ElementRef<HTMLDivElement>;

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

  signedMusicUrl: string | null = null;

  constructor(
    private teamService: TeamService,
    private authService: AuthService,
    private segmentService: SegmentService,
    private route: ActivatedRoute,
    private renderer: Renderer2
  ) {}

  get performers(): Performer[] {
    return this.formations[this.currentFormationIndex] || [];
  }

  set performers(val: Performer[]) {
    this.formations[this.currentFormationIndex] = val;
  }

  ngOnInit() {
    const segmentId = this.route.snapshot.queryParamMap.get('id') || this.route.snapshot.paramMap.get('id');
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

          // Load roster as before
          const currentUser = this.authService.getCurrentUser();
          if (currentUser?.team?._id) {
            this.teamService.getTeamById(currentUser.team._id).subscribe({
              next: (res) => {
                this.roster = res.team.members || [];
                // Load all formations or create one if missing
                const backendFormations = this.segment.formations && this.segment.formations.length > 0 ? this.segment.formations : [[]];
                console.log('Loading formations:', backendFormations);
                
                this.formations = backendFormations.map((formation: any[]) =>
                  formation.map((p: any) => {
                    console.log('Loading performer:', p);
                    if (p.isDummy || p.user === null) {
                      // Restore dummy performer with a new dummy ID
                      const dummyId = `dummy-${this.dummyCounter++}`;
                      return {
                        id: dummyId,
                        name: p.dummyName || 'Dummy',
                        x: p.x,
                        y: p.y
                      };
                    }
                    // Regular performer
                    const member = this.roster.find(m => m._id === p.user || m._id === p.user?._id);
                    return {
                      id: member?._id || p.user,
                      name: member?.name || 'Unknown',
                      x: p.x,
                      y: p.y
                    };
                  })
                );
                console.log('Final formations:', this.formations);
                
                // If no formations or empty, create one with all roster at center
                if (this.formations.length === 0 || this.formations[0].length === 0) {
                  this.formations = [this.roster.map(member => ({
                    id: member._id,
                    name: member.name,
                    x: this.width / 2,
                    y: this.depth / 2
                  }))];
                }
                // Load animationDurations from backend if present
                if (Array.isArray(this.segment.animationDurations)) {
                  this.animationDurations = this.segment.animationDurations;
                } else {
                  this.animationDurations = Array(Math.max(0, this.formations.length - 1)).fill(1);
                }
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
    if (this.formations.length > 1) {
      this.animationDurations.push(1);
    }
    this.currentFormationIndex = this.formations.length - 1;
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
  addPerformerFromRoster(member: any) {
    // Only add if not already present in current formation
    if (!this.performers.some(p => p.id === member._id)) {
      this.performers = [
        ...this.performers,
        { id: member._id, name: member.name, x: this.width / 2, y: this.depth / 2 }
      ];
    }
  }
  addDummyPerformer() {
    const dummyId = `dummy-${this.dummyCounter++}`;
    const dummyName = `Dummy ${this.dummyCounter - 1}`;
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

  getPerformerStyle(performer: Performer) {
    const performerSize = 30; // px
    // Use animated positions if animating
    let x = performer.x;
    let y = performer.y;
    if (this.isAnimating && this.animatedPositions[performer.id]) {
      x = this.animatedPositions[performer.id].x;
      y = this.animatedPositions[performer.id].y;
    }
    return {
      left: x * this.pixelsPerFoot - performerSize / 2 + 'px',
      top: y * this.pixelsPerFoot - performerSize / 2 + 'px',
      zIndex: this.draggingId === performer.id ? 1000 : 10
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
    this.segmentService.updateSegment(this.segment._id, { formations, animationDurations: this.animationDurations }).subscribe({
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
        this.signedMusicUrl = url; // store in a property
      },
      error: () => alert('Failed to get music URL')
    });
  }
}
 