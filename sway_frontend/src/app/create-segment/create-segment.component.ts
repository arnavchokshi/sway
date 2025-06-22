import { Component, OnInit, ElementRef, ViewChild, Renderer2, AfterViewChecked, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TeamService } from '../services/team.service';
import { AuthService } from '../services/auth.service';
import { SegmentService } from '../services/segment.service';
import { PerformerConsistencyService, ConsistencyWarning, FormationTip } from '../services/performer-consistency.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { environment } from '../../environments/environment';
import WaveSurfer from 'wavesurfer.js';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

interface Performer {
  id: string;
  name: string;
  x: number; // in feet
  y: number; // in feet
  skillLevels: { [styleName: string]: number }; // Map of style name to skill level (1-5)
  height?: number; // in inches
  isDummy?: boolean;
  dummyName?: string;
  customColor?: string; // Custom color for this performer in this segment
}

interface Style {
  name: string;
  color: string;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
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
export class CreateSegmentComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @ViewChild('stageRef') stageRef!: ElementRef<HTMLDivElement>;
  @ViewChild('timelineBarRef') timelineBarRef!: ElementRef<HTMLDivElement>;
  @ViewChild('threeContainer') threeContainer!: ElementRef<HTMLDivElement>;

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
  selectedPerformerFeet: number = 5;
  selectedPerformerInches: number = 6;

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

  pixelsPerSecond = 50; // Reduced from 100 to 50 for better base scaling

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
  private saveSubscription: any = null; // Add subscription tracking

  // Side Panel State
  activePanel: 'roster' | 'details' = 'roster';
  showAddPerformerDropdown = false;
  showUserAssignmentDropdown = false;
  showPerformerPairingDropdown = false;

  selectedPerformerIds: Set<string> = new Set();
  hoveredPerformerId: string | null = null;
  isShiftPressed = false;
  isCommandPressed = false; // Add Command key tracking
  
  // Add property to track which performer's previous position should be shown
  selectedPerformerForPreviousPosition: string | null = null;

  // Add new property to track initial positions of all selected performers
  private selectedPerformersInitialPositions: { [id: string]: { x: number, y: number } } = {};

  // Add these properties at the top of the class with other properties
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private readonly DRAG_THRESHOLD = 5; // pixels
  private lastClickTime = 0; // Track last click time for debouncing
  private readonly CLICK_DEBOUNCE_MS = 300; // Minimum 300ms between clicks
  private justDragged = false; // Track if we just finished dragging

  sidePanelMode: 'roster' | 'performer' | '3d' = 'roster';

  async setSidePanelMode(mode: 'roster' | 'performer' | '3d') {
    this.sidePanelMode = mode;
    
    // Remove the refresh call that was causing the page to become unresponsive
    // The performer data is already available in the component
  }

  // Touch gesture properties
  private touchStartDistance = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private isPinching = false;
  private lastTouchDistance = 0;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private currentTranslateX = 0;
  private currentTranslateY = 0;

  // 3D View Properties
  is3DView = false;
  isStageFlipped = false;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private performerMeshes: { [id: string]: THREE.Group } = {};
  private stageMesh: THREE.Mesh | null = null;
  private animationFrameId: number | null = null;
  private videoMesh: THREE.Mesh | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private youtubeIframe: HTMLIFrameElement | null = null;
  private videoContainer: HTMLDivElement | null = null;
  private videoCanvas: HTMLCanvasElement | null = null;
  private videoContext: CanvasRenderingContext2D | null = null;
  private pendingVideoId: string | null = null;
  private videoPlane: THREE.Mesh | null = null;
  youtubeUrl: string = '';
  private youtubePlayer: any = null;

  showYoutubeOverlay: boolean = false;
  sanitizedYoutubeEmbedUrl: SafeResourceUrl | null = null;

  directVideoUrl: string = '';
  private directVideoObjectUrl: string | null = null;

  isUploadingMusic = false;

  // Zoom properties
  private currentZoom = 1;
  private minZoom = 0.5;
  private maxZoom = 2;
  private zoomStep = 0.1;
  private lastZoomTime = 0;
  private zoomDebounceTime = 50; // ms

  // Add timeline zoom properties
  timelineZoom = 1;
  minTimelineZoom = 0.05;
  maxTimelineZoom = 1.5;  // Changed from 1.0 to 2.0 to allow zooming in
  timelineZoomStep = 0.01;

  // Add these properties after other drag-related properties
  draggingFormationIndex: number | null = null;
  dragFormationStartX: number = 0;
  dragFormationStartIndex: number = 0;
  dragFormationOverIndex: number | null = null;

  stageGridHeightPx: number = 0;

  // Add new property for stage vertical offset
  stageVerticalOffset: number = 0;

  // Add these properties
  private isDraggingSlider = false;
  private sliderRect: DOMRect | null = null;

  // Add these properties after the existing properties
  consistencyWarnings: ConsistencyWarning[] = [];
  showConsistencyWarnings = false;
  showPositioningTips = false; // New property for collapsible tab

  // Predefined color options for custom performer color
  customColorOptions: string[] = [
    '#dc2626', // Red
    '#ea580c', // Orange
    '#eab308', // Yellow
    '#059669', // Green
    '#3b82f6', // Light Blue
    '#a78bfa', // Lavender
    '#000000'  // Black
  ];

  // New properties for formation positioning tips
  formationTips: FormationTip[] = [];
  currentFormationTips: FormationTip[] = [];

  // Add this property near the top of the class with other properties
  private isRefreshingData = false;
  private refreshTimeout: any = null;
  private currentRefreshRequest: any = null; // To track and cancel ongoing requests
  private lastRefreshTime = 0; // Track last refresh time for throttling
  private readonly REFRESH_THROTTLE_MS = 500; // Minimum 500ms between refreshes
  isPerformerSelectionLoading = false; // Add loading state for UI feedback
  private refreshDisabled = false; // Add flag to disable refresh temporarily

  // Event listener tracking for cleanup
  private resizeListener: (() => void) | null = null;
  private windowResizeListener: (() => void) | null = null;

  private _lastColorCall: string | null = null;

  // Add caching properties for performance optimization
  private _selectedUserCache: any = null;
  private _selectedUserSkillLevelsCache: { [styleKey: string]: number } = {};
  private _segmentStylesCache: Style[] = [];
  private _isUpdating3D = false;
  private _3DUpdateFrameId: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private teamService: TeamService,
    private authService: AuthService,
    private segmentService: SegmentService,
    private performerConsistencyService: PerformerConsistencyService,
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    // Set up auto-save with debouncing
    this.saveSubscription = this.saveSubject.pipe(debounceTime(this.autoSaveDebounceTime)).subscribe(() => {
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
    const performer = this.performers.find(p => p.id === this.selectedPerformerId);
    if (!performer) return null;
    
    if (performer.isDummy) return performer;
    
    // Always merge in the latest user data for real users
    const user = this.teamRoster.find(m => m._id === performer.id);
    
    if (user && user.skillLevels) {
      const mergedPerformer = {
        ...performer,
        name: user.name,
        skillLevels: { ...(user.skillLevels || {}) },
        height: user.height // Always use the latest height
      };
      return mergedPerformer;
    }
    
    return performer;
  }

  set performers(val: Performer[]) {
    this.formations[this.currentFormationIndex] = val;
  }

  ngOnInit() {
    // Detect iPhone or small mobile
    this.isMobile = /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 500;
    
    // Additional iPhone-specific detection
    const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);
    if (isIPhone) {
      this.isMobile = true;
      // Ensure proper viewport handling for iPhone
      const viewport = document.querySelector('meta[name=viewport]');
      if (!viewport) {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(meta);
      }
    }
    
    // Initialize mobile audio context if needed
    if (this.isMobile) {
      this.initializeMobileAudioContextOnLoad();
    }
    
    const segmentId = this.route.snapshot.queryParamMap.get('id') || this.route.snapshot.paramMap.get('id');
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = currentUser?.captain || false;
    this.currentUserId = currentUser?._id || '';
    
    // Always load team roster first, regardless of whether it's a new or existing segment
    if (currentUser?.team?._id) {
      this.loadTeamRosterAndMapFormations(currentUser.team._id);
    }
    
    if (segmentId) {
      this.segmentService.getSegmentById(segmentId).subscribe({
        next: (res) => {
          this.segment = res.segment;
          if (this.segment?.musicUrl) {
            this.getSignedMusicUrl();
          }
          this.depth = this.segment.depth;
          this.width = this.segment.width;
          this.divisions = this.segment.divisions;
          this.segmentName = this.segment.name || 'New Segment';
          this.calculateStage();
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
          // Clear segment styles cache when team styles change
          this.clearSegmentStylesCache();
        },
        error: (err) => {
          console.error('Failed to load team styles:', err);
        }
      });
    }

    // Add keyboard event listeners for shift key
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.resetKeyStates);

    // Set initial side panel mode
    this.sidePanelMode = this.selectedPerformer ? 'performer' : 'roster';

    // Check for consistency warnings after a short delay to ensure all data is loaded
    setTimeout(() => {
      this.checkConsistencyWarnings();
      this.checkFormationPositioningTips();
    }, 2000);
  }

  // Method to refresh data when component is activated
  public onActivate() {
    // Refresh team roster data when component is activated
    this.refreshData();
  }

  // Method to refresh data when component is activated (called by router)
  public onComponentActivate() {
    // Refresh team roster data when component is activated
    this.refreshData();
  }

  // New method to load team roster and map formations with fresh user data
  private loadTeamRosterAndMapFormations(teamId: string) {
    this.teamService.getTeamById(teamId).subscribe({
      next: async (res) => {
        this.teamRoster = res.team.members || [];
        console.log('🔍 DEBUG Team roster loaded:', this.teamRoster.map(m => ({ id: m._id, name: m.name })));
        
        // For new segments, just set up the basic roster and segment roster
        if (!this.segment) {
          this.segmentRoster = [...this.teamRoster];
          // Clear caches for new segments
          this.clearAllCaches();
          return;
        }
        
        // After loading, find the highest dummy number to set the counter
        let maxDummyNum = 0;
        if (this.segment && this.segment.formations) {
          this.segment.formations.forEach((formation: any[]) => {
            formation.forEach((p: { isDummy?: boolean; dummyName?: string; name?: string }) => {
              if (p.isDummy) {
                const name = p.dummyName || p.name || '';
                const match = name.match(/(\d+)$/);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (num > maxDummyNum) {
                    maxDummyNum = num;
                  }
                }
              }
            });
          });
        }
        this.dummyCounter = maxDummyNum + 1;

        // --- Fetch missing users for segmentRoster (dummies) ---
        const teamIds = new Set(this.teamRoster.map(m => m._id));
        const segmentUserIds = (this.segment?.roster || []);
        const missingIds = segmentUserIds.filter((id: string) => !teamIds.has(id));
        const fetchedUsers = await Promise.all(
          missingIds.map((id: string) =>
            this.teamService.getUserById(id).toPromise()
              .then(res => {
                if (res.user) return res.user;
                if (res._id) return res;
                // If it's a wrapper, unwrap
                if (res && typeof res === 'object' && Object.values(res as any).length === 1 && (Object.values(res as any)[0] as any)._id) {
                  return Object.values(res as any)[0];
                }
                return null;
              })
              .catch(() => null)
          )
        );
        this.segmentRoster = [
          ...this.teamRoster,
          ...fetchedUsers.filter(u => u)
        ];

        if (this.segment) {
          const nameToIdMap = new Map<string, string>(); // key: dummyName, value: canonical dummyId
          // Pass 1: Scan all formations to build a consistent map of dummy names to IDs.
          if (this.segment.formations) {
            this.segment.formations.forEach((formation: any[]) => {
              formation.forEach(p => {
                if ((p.isDummy || p.user === null) && p.id) {
                  const name = p.dummyName || p.name;
                  if (name && !nameToIdMap.has(name)) {
                    nameToIdMap.set(name, p.id);
                  }
                }
              });
            });
            // Second sub-pass: fill in for dummies that didn't have an ID.
            this.segment.formations.forEach((formation: any[]) => {
              formation.forEach(p => {
                if (p.isDummy || p.user === null) {
                  const name = p.dummyName || p.name;
                  if (name && !nameToIdMap.has(name)) {
                    nameToIdMap.set(name, `dummy-${this.dummyCounter++}`);
                  }
                }
              });
            });
          }

          // Pass 2: Map formations using the consistent ID map.
          if (this.segment.formations && this.segment.formations.length > 0) {
            this.formations = this.segment.formations.map((formation: any[]) => 
              formation.map((p: any) => {
                // Check if this is a dummy performer by looking for isDummy flag or null user
                if (p.isDummy || p.user === null) {
                  const originalName = p.dummyName || p.name;
                  const canonicalId = nameToIdMap.get(originalName);
                  if (!canonicalId) {
                    const id = p.id || `dummy-${this.dummyCounter++}`;
                    const name = `Dumb ${id.split('-')[1]}`;
                    return {
                      id: id, name: name, x: p.x, y: p.y, skillLevels: {},
                      height: p.height || 5.5, isDummy: true, dummyName: name,
                      customColor: p.customColor // Include custom color if present
                    };
                  }
                  const nameNumberMatch = originalName ? String(originalName).match(/(\d+)$/) : null;
                  const idNumber = canonicalId.split('-')[1];
                  const nameNumber = nameNumberMatch ? nameNumberMatch[1] : idNumber;
                  const canonicalName = `Dumb ${nameNumber}`;
                  const dummyPerformer = {
                    id: canonicalId,
                    name: canonicalName,
                    x: p.x,
                    y: p.y,
                    skillLevels: {},
                    height: p.height || 5.5,
                    isDummy: true,
                    dummyName: canonicalName,
                    customColor: p.customColor // Include custom color if present
                  };
                  console.log('Reconstructed dummy performer:', JSON.stringify(dummyPerformer, null, 2));
                  return dummyPerformer;
                } else {
                  // Handle real performers - check both user field and id field
                  const performerId = p.user || p.id || p._id;
                  console.log('🔍 DEBUG Mapping performer:', { 
                    original: p, 
                    performerId, 
                    hasUser: !!p.user, 
                    hasId: !!p.id, 
                    has_id: !!p._id 
                  });
                  
                  const user = this.teamRoster.find(m => String(m._id) === String(performerId)) || 
                              this.segmentRoster.find(m => String(m._id) === String(performerId));
                  
                  console.log('🔍 DEBUG Found user:', user ? { id: user._id, name: user.name } : 'NOT FOUND');
                  
                  if (user && user.skillLevels) {
                    const skillLevel = user?.skillLevels?.[this.selectedStyle?.name?.toLowerCase() || ''] || p.skillLevel || 1;
                    const mappedPerformer = {
                      id: performerId,
                      name: user.name,
                      x: p.x,
                      y: p.y,
                      skillLevels: { ...(user?.skillLevels || {}) },
                      height: user.height, // Use user height if available
                      isDummy: !!user.isDummy,
                      customColor: p.customColor // Include custom color if present
                    };
                    console.log('✅ DEBUG Mapped performer successfully:', mappedPerformer.name);
                    return mappedPerformer;
                  } else {
                    // Fallback if user not found in roster
                    console.log('⚠️ DEBUG User not found in roster, using fallback for ID:', performerId);
                    return {
                      id: performerId,
                      name: 'Unknown',
                      x: p.x,
                      y: p.y,
                      skillLevels: {},
                      height: p.height || 66, // Default height
                      isDummy: false,
                      customColor: p.customColor // Include custom color if present
                    };
                  }
                }
              })
            );
          } else {
            this.formations = [[]];
          }
          this.formationDurations = this.segment.formationDurations && this.segment.formationDurations.length > 0 ? this.segment.formationDurations : [5];
          this.animationDurations = this.segment.animationDurations || [];
          this.currentFormationIndex = 0;
        }

        // Update segment roster based on the segment's roster
        if (this.segment.roster) {
          this.segmentRoster = this.teamRoster.filter(member => 
            this.segment.roster.includes(member._id)
          );
        } else {
          this.segmentRoster = [];
        }
        
        // Clear caches AFTER segment data is properly mapped
        this.clearAllCaches();
      },
      error: (err) => {
        console.error('Failed to load team roster:', err);
      }
    });
  }

  // New method to refresh team roster data
  private refreshTeamRoster() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.teamService.getTeamById(currentUser.team._id).subscribe({
        next: (res) => {
          this.teamRoster = res.team.members || [];
          console.log('Refreshed team roster:', JSON.stringify(this.teamRoster, null, 2));
          
          // Update performers with fresh user data
          this.formations = this.formations.map(formation =>
            formation.map(performer => {
              if (performer.isDummy) {
                return performer; // Keep dummy performers as is
              }
              
              const currentUser = this.teamRoster.find(m => m._id === performer.id);
              if (currentUser && currentUser.skillLevels) {
                return {
                  ...performer,
                  name: currentUser.name,
                  skillLevels: { ...(currentUser.skillLevels || {}) },
                  height: currentUser.height // Update with fresh height
                };
              }
              return performer;
            })
          );
          
          // Update segment roster
          if (this.segment.roster) {
            this.segmentRoster = this.teamRoster.filter(member => 
              this.segment.roster.includes(member._id)
            );
          }
          
          // Clear caches after updating formations
          this.clearAllCaches();
        },
        error: (err) => {
          console.error('Failed to refresh team roster:', err);
        }
      });
    }
  }

  // Method to refresh data when component becomes active
  public refreshData() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.refreshTeamRoster();
    }
  }

  // Method to refresh data before selecting a performer
  private refreshDataBeforeSelection(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔄 DEBUG refreshDataBeforeSelection: Starting...');
      
      // Check if refresh is disabled (fallback mechanism)
      if (this.refreshDisabled) {
        console.log('🔄 DEBUG refreshDataBeforeSelection: Refresh disabled, skipping...');
        resolve(); // Resolve immediately if refresh is disabled
        return;
      }
      
      const now = Date.now();
      
      // Throttle refreshes to prevent overwhelming the system
      if (now - this.lastRefreshTime < this.REFRESH_THROTTLE_MS) {
        console.log('🔄 DEBUG refreshDataBeforeSelection: Throttled, skipping...');
        resolve(); // Resolve immediately if throttled
        return;
      }

      // Clear any pending timeout
      if (this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = null;
      }

      // Cancel any ongoing request
      if (this.currentRefreshRequest) {
        console.log('🔄 DEBUG refreshDataBeforeSelection: Cancelling previous request');
        this.currentRefreshRequest.unsubscribe();
        this.currentRefreshRequest = null;
      }

      // Prevent multiple simultaneous calls
      if (this.isRefreshingData) {
        console.log('🔄 DEBUG refreshDataBeforeSelection: Already refreshing, skipping...');
        resolve(); // Resolve immediately if already refreshing
        return;
      }

      const currentUser = this.authService.getCurrentUser();
      console.log('🔄 DEBUG refreshDataBeforeSelection:');
      console.log('  - currentUser:', currentUser);
      console.log('  - currentUser.team._id:', currentUser?.team?._id);
      
      if (currentUser?.team?._id) {
        this.isRefreshingData = true;
        this.lastRefreshTime = now;
        
        console.log('🔄 DEBUG refreshDataBeforeSelection: Setting timeout...');
        
        // Add a timeout to prevent hanging
        const requestTimeout = setTimeout(() => {
          console.warn('⚠️ DEBUG refreshDataBeforeSelection: Request timed out after 10 seconds');
          this.isRefreshingData = false;
          this.currentRefreshRequest = null;
          // Disable refresh temporarily if it times out
          this.refreshDisabled = true;
          setTimeout(() => {
            this.refreshDisabled = false; // Re-enable after 30 seconds
            console.log('🔄 DEBUG refreshDataBeforeSelection: Refresh re-enabled');
          }, 30000);
          resolve(); // Resolve anyway to prevent hanging
        }, 10000); // 10 second timeout
        
        // Add a small delay to throttle rapid requests
        this.refreshTimeout = setTimeout(() => {
          console.log('🔄 DEBUG refreshDataBeforeSelection: Timeout fired, making HTTP request...');
          
          // Quick refresh of team roster to ensure we have latest data
          this.currentRefreshRequest = this.teamService.getTeamById(currentUser.team._id).subscribe({
            next: (res) => {
              console.log('🔄 DEBUG refreshDataBeforeSelection: HTTP request successful');
              clearTimeout(requestTimeout); // Clear the timeout since we got a response
              try {
                this.teamRoster = res.team.members || [];
                console.log('✅ DEBUG Team roster refreshed:');
                console.log('  - teamRoster length:', this.teamRoster.length);
                console.log('  - teamRoster members:', this.teamRoster.map(m => ({ id: m._id, name: m.name, height: m.height })));
                
                // Update performers with fresh user data
                console.log('🔄 DEBUG refreshDataBeforeSelection: Updating formations...');
                this.formations = this.formations.map(formation =>
                  formation.map(performer => {
                    if (performer.isDummy) {
                      return performer; // Keep dummy performers as is
                    }
                    
                    const user = this.teamRoster.find(m => m._id === performer.id);
                    if (user && user.skillLevels) {
                      console.log(`🔄 DEBUG Updating performer ${performer.id} with fresh user data:`, {
                        oldHeight: performer.height,
                        newHeight: user.height,
                        userName: user.name
                      });
                      return {
                        ...performer,
                        name: user.name,
                        skillLevels: { ...(user.skillLevels || {}) },
                        height: user.height // Always use the latest height
                      };
                    } else {
                      console.warn(`⚠️ DEBUG Performer ${performer.id} not found in refreshed team roster, keeping existing data`);
                      return performer; // Keep existing data if user not found
                    }
                  })
                );
                
                // Update the current performers array
                this.performers = this.formations[this.currentFormationIndex];
                console.log('✅ DEBUG Performers updated with fresh data');
                
                // Clear caches after updating formations
                this.clearAllCaches();
                
                console.log('🔄 DEBUG refreshDataBeforeSelection: Resolving promise...');
                resolve(); // Resolve the promise successfully
              } catch (error) {
                console.error('❌ DEBUG Error processing refreshed data:', error);
                reject(error); // Reject the promise on error
              } finally {
                console.log('🔄 DEBUG refreshDataBeforeSelection: Cleaning up...');
                this.isRefreshingData = false;
                this.currentRefreshRequest = null;
              }
            },
            error: (err) => {
              console.error('❌ DEBUG Error refreshing team roster:', err);
              clearTimeout(requestTimeout); // Clear the timeout since we got an error
              this.isRefreshingData = false;
              this.currentRefreshRequest = null;
              
              // Show user-friendly error message
              if (err.status === 429) {
                console.warn('⚠️ Rate limit exceeded - too many requests to MongoDB');
                // Disable refresh temporarily if rate limited
                this.refreshDisabled = true;
                setTimeout(() => {
                  this.refreshDisabled = false; // Re-enable after 60 seconds
                  console.log('🔄 DEBUG refreshDataBeforeSelection: Refresh re-enabled after rate limit');
                }, 60000);
              } else if (err.status >= 500) {
                console.warn('⚠️ Server error - MongoDB may be under load');
                // Disable refresh temporarily if server error
                this.refreshDisabled = true;
                setTimeout(() => {
                  this.refreshDisabled = false; // Re-enable after 30 seconds
                  console.log('🔄 DEBUG refreshDataBeforeSelection: Refresh re-enabled after server error');
                }, 30000);
              }
              
              reject(err); // Reject the promise on error
            }
          });
        }, 100); // 100ms delay to throttle rapid clicks
      } else {
        console.log('❌ DEBUG No team ID found, cannot refresh roster');
        resolve(); // Resolve immediately if no team ID
      }
    });
  }

  ngAfterViewInit() {
    console.log('View initialized, setting up touch gestures');
    if (this.stageRef && this.stageRef.nativeElement) {
      this.setupZoomGestures();
      this.setupSliderDebug();
      // Fix: recalculate grid using actual DOM size
      this.calculateStageWithDOMSize();
      this.resizeListener = () => this.calculateStageWithDOMSize();
      window.addEventListener('resize', this.resizeListener);
      
      // Fix: Use ChangeDetectorRef to handle the height change properly
      setTimeout(() => {
        this.calculateStageWithDOMSize();
        this.cdr.detectChanges();
      }, 0);
    } else {
      console.error('Stage reference not available in ngAfterViewInit');
    }
  }

  private setupSliderDebug() {
    const sliderElement = document.querySelector('.stage-position-slider') as HTMLElement;
    const stageArea = this.stageRef.nativeElement;
    
    if (sliderElement) {
      const events = ['mousedown', 'mouseup', 'mousemove', 'click', 'pointerdown', 'pointerup', 'pointermove'];
      events.forEach(eventType => {
        sliderElement.addEventListener(eventType, (e) => {
          console.log(`Slider ${eventType}:`, {
            event: e,
            sliderValue: (e.target as HTMLInputElement).value,
            stageTransform: stageArea.style.transform
          });
        });
      });
    }

    if (stageArea) {
      const events = ['mousedown', 'mouseup', 'mousemove', 'click'];
      events.forEach(eventType => {
        stageArea.addEventListener(eventType, (e) => {
          // Removed console.log statement
        });
      });
    }
  }

  calculateStageWithDOMSize() {
    // Update mobile flag on every resize so sizing logic in calculateStage works correctly
    this.isMobile = window.innerWidth <= 500;
    // Get available space (subtracting for header and bottom panel)
    const availableWidth = window.innerWidth * 0.98; // 98vw
    const availableHeight = window.innerHeight - 200; // leave space for header/bottom panel

    // Calculate aspect ratio (width:depth in feet)
    const aspect = this.width / this.depth;

    // Calculate the largest size that fits while maintaining aspect ratio
    let stageWidthPx = availableWidth;
    let stageHeightPx = stageWidthPx / aspect;
    if (stageHeightPx > availableHeight) {
      stageHeightPx = availableHeight;
      stageWidthPx = stageHeightPx * aspect;
    }

    this.stageWidthPx = stageWidthPx;
    this.stageHeightPx = stageHeightPx;

    this.calculateStage();
  }

  calculateStage() {
    if (!this.isMobile) {
      this.pixelsPerFoot = 20;
      this.stageWidthPx = this.width * this.pixelsPerFoot;
      this.stageHeightPx = this.depth * this.pixelsPerFoot;
    }
    // Main lines - create 8 columns (9 lines) and 4 rows (5 lines)
    this.mainVerticals = [];
    this.mainHorizontals = [];
    this.subVerticals = [];
    this.subHorizontals = [];
    
    // Create 9 vertical lines to create 8 columns (0, 1/8, 2/8, 3/8, 4/8, 5/8, 6/8, 7/8, 8/8)
    for (let i = 0; i <= 8; i++) {
      this.mainVerticals.push((i / 8) * this.stageWidthPx);
    }
    
    // Create 5 horizontal lines to create 4 rows (0, 1/4, 2/4, 3/4, 4/4)
    for (let i = 0; i <= 4; i++) {
      this.mainHorizontals.push((i / 4) * this.stageHeightPx);
    }
    
    // Subgrid lines for all 8 vertical and 4 horizontal sections
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
    // Calculate the grid height in px
    this.stageGridHeightPx = this.mainHorizontals[this.mainHorizontals.length - 1] - this.mainHorizontals[0];
  }

  // Helper to go to a specific formation index and update all relevant state
  goToFormation(index: number) {
    this.currentFormationIndex = index;
    this.playingFormationIndex = index;
    
    // Don't clear the previous position display when navigating between formations
    // This allows the selected performer's previous position to persist across formation changes
    // this.selectedPerformerForPreviousPosition = null;
    
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
    
    // Create a deep copy of the current formation's performers with their exact positions
    const newFormation = currentFormation.map(performer => ({
      ...performer,
      x: performer.x,
      y: performer.y,
      skillLevels: { ...performer.skillLevels },
      height: performer.height,
      isDummy: performer.isDummy,
      dummyName: performer.dummyName
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

    // Check for consistency warnings after adding formation
    setTimeout(() => {
      this.checkConsistencyWarnings();
      this.checkFormationPositioningTips();
    }, 1000); // Small delay to ensure the formation is properly saved
  }

  addPerformer(member: any) {
    const newPerformer: Performer = {
      id: member._id || `dummy-${this.dummyCounter++}`,
      name: member.name || `Dumb ${this.dummyCounter}`,
      x: 0,
      y: 0,
      skillLevels: {}
    };
    this.formations[this.currentFormationIndex].push(newPerformer);
    this.triggerAutoSave();
  }
  addPerformerFromRoster(dancer: any) {
    // Find an available position for the new performer
    const position = this.findAvailablePosition();
    
    // Add the dancer to all formations
    this.formations = this.formations.map(formation => {
      // Check if dancer is already in this formation
      if (!formation.some(p => p.id === dancer._id)) {
        return [
          ...formation,
          {
            id: dancer._id,
            name: dancer.name,
            x: position.x,
            y: position.y,
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
    
    // Force immediate save for new segments to ensure they're created in MongoDB
    this.forceSaveForNewSegment();
    
    // Also trigger regular auto-save for existing segments
    this.triggerAutoSave();

    // Check for positioning guidance for this specific performer
    this.checkPerformerPositioningGuidance(dancer._id);
  }

  /**
   * Check for positioning guidance for a specific performer
   */
  private checkPerformerPositioningGuidance(performerId: string) {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.performerConsistencyService.analyzePerformerAcrossSegments(performerId, currentUser.team._id).subscribe({
      next: (positions) => {
        if (positions.length >= 2) {
          const lastPosition = positions[positions.length - 2]; // Previous segment
          const currentPosition = positions[positions.length - 1]; // Current segment
          
          if (lastPosition.side !== currentPosition.side) {

          }
        }
      },
      error: (err) => {
      }
    });
  }

  addDummyPerformer() {

    const dummyName = `Dumb ${this.dummyCounter}`;
    this.teamService.addDummyUser(dummyName).subscribe({
      next: (res: any) => {

        const newUser = res?.user;
        if (!newUser || !newUser._id) {
          alert('Failed to create dummy user.');
          return;
        }
        // Only add to segment roster if not already present
        if (!this.segmentRoster.some(m => m._id === newUser._id)) {
          this.segmentRoster.push(newUser);
        }
        
        // Find an available position for the new dummy performer
        const position = this.findAvailablePosition();
        
        // Add dummy to all formations
        this.formations = this.formations.map(formation => [
          ...formation,
          {
            id: newUser._id,
            name: dummyName,
            x: position.x,
            y: position.y,
            isDummy: true,
            dummyName: dummyName,
            skillLevels: {},
            height: 5.5
          }
        ]);
        this.dummyCounter++;
        
        // Force immediate save for new segments to ensure they're created in MongoDB
        this.forceSaveForNewSegment();
        
        // Also trigger regular auto-save for existing segments
        this.triggerAutoSave();
      },
      error: (err: any) => {
        alert('Failed to add dummy performer.');
      }
    });
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

    // If we're not holding shift or command, clear other selections
    if (!this.isMultiSelectionEnabled()) {
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

    // Only set justDragged flag if we actually moved significantly
    if (distance > this.DRAG_THRESHOLD) {
      this.justDragged = true;
      setTimeout(() => {
        this.justDragged = false;
      }, 100); // Reset after 100ms
    }

    this.draggingId = null;
    this.triggerAutoSave();

    // Check for consistency warnings after moving performers
    setTimeout(() => {
      this.checkConsistencyWarnings();
      this.checkFormationPositioningTips();
    }, 500); // Small delay to ensure the movement is properly saved
  };

  async onPerformerClick(performer: Performer) {
    console.log('🎯 DEBUG onPerformerClick called for:', performer.name, performer.id);
    console.log('🎯 DEBUG onPerformerClick: segment stylesInSegment:', this.segment?.stylesInSegment);
    console.log('🎯 DEBUG onPerformerClick: teamStyles length:', this.teamStyles?.length);
    console.log('🎯 DEBUG onPerformerClick: selectedStyle:', this.selectedStyle);
    console.log('🎯 DEBUG onPerformerClick: showColorBySkill:', this.showColorBySkill);
    
    // Safety check: ensure performer is valid
    if (!performer || !performer.id) {
      console.error('❌ DEBUG onPerformerClick: Invalid performer data:', performer);
      return;
    }
    
    // Prevent click if we just finished dragging
    if (this.justDragged) {
      console.log('🔄 DEBUG onPerformerClick: Just dragged, skipping click...');
      return;
    }
    
    const now = Date.now();
    
    // Debounce rapid clicks
    if (now - this.lastClickTime < this.CLICK_DEBOUNCE_MS) {
      console.log('🔄 DEBUG onPerformerClick: Debounced, skipping...');
      return;
    }
    
    // Prevent multiple simultaneous clicks
    if (this.isPerformerSelectionLoading) {
      console.log('🔄 DEBUG onPerformerClick: Already loading, skipping...');
      return;
    }
    
    this.lastClickTime = now;
    
    try {
      console.log('🎯 DEBUG onPerformerClick: Starting performer selection...');
      this.isPerformerSelectionLoading = true;
      
      // Set this performer as the one to show previous position for
      this.selectedPerformerForPreviousPosition = performer.id;
      
      if (this.isMultiSelectionEnabled()) {
        console.log('🎯 DEBUG onPerformerClick: Multi-selection mode');
        // Toggle selection for this performer
        if (this.selectedPerformerIds.has(performer.id)) {
          this.selectedPerformerIds.delete(performer.id);
          console.log('🎯 DEBUG onPerformerClick: Removed from selection');
        } else {
          this.selectedPerformerIds.add(performer.id);
          console.log('🎯 DEBUG onPerformerClick: Added to selection');
        }
        
        // Update the selected performer ID to the last one selected
        this.selectedPerformerId = performer.id;
      } else {
        console.log('🎯 DEBUG onPerformerClick: Single-selection mode');
        // Single selection mode
        this.selectedPerformerIds.clear();
        this.selectedPerformerIds.add(performer.id);
        this.selectedPerformerId = performer.id;
      }
      
      // Update feet and inches when selecting a performer
      if (this.selectedPerformerId) {
        try {
          console.log('🎯 DEBUG onPerformerClick: Updating height data...');
          // Get the most up-to-date user data from team roster
          const currentUser = this.teamRoster && this.teamRoster.length > 0 ? 
            this.teamRoster.find(m => m._id === this.selectedPerformerId) : null;
          const heightToUse = currentUser?.height || performer.height;

          const heightData = this.getHeightInFeetAndInches(heightToUse);
          this.selectedPerformerFeet = heightData.feet;
          this.selectedPerformerInches = heightData.inches;
          console.log('🎯 DEBUG onPerformerClick: Height updated:', heightData);
        } catch (heightError) {
          console.error('❌ DEBUG Error updating height data:', heightError);
          // Use default values if height calculation fails
          this.selectedPerformerFeet = 5;
          this.selectedPerformerInches = 6;
        }
      }
      
      // Switch to performer details panel
      this.sidePanelMode = 'performer';
      console.log('🎯 DEBUG onPerformerClick: Switched to performer panel');
      
      // Trigger auto-save
      this.triggerAutoSave();
      console.log('🎯 DEBUG onPerformerClick: Triggered auto-save');
      
      console.log('✅ DEBUG onPerformerClick completed successfully');
      
    } catch (error) {
      console.error('❌ DEBUG Error in onPerformerClick:', error);
      console.error('❌ DEBUG Error stack:', (error as Error).stack);
      // Try to recover gracefully
      this.selectedPerformerIds.clear();
      this.selectedPerformerId = null;
    } finally {
      this.isPerformerSelectionLoading = false;
      console.log('🎯 DEBUG onPerformerClick: Loading state cleared');
    }
  }

  getPreviousPosition(performerId: string): { x: number, y: number } | null {
    // Only show previous position if this performer is selected for previous position display
    if (this.selectedPerformerForPreviousPosition !== performerId) {
      return null;
    }
    
    // If we're on the first formation, there's no previous formation to show
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

    // Correct: use proportional position
    const xPercent = (currentUserPerformer.x / this.width) * 100;
    const yPercent = (currentUserPerformer.y / this.depth) * 100;

    return {
      'pointer-events': 'none',
      'position': 'absolute',
      'top': '0',
      'left': '0',
      'width': this.stageWidthPx + 'px',
      'height': this.stageHeightPx + 'px',
      'z-index': 10,
      'background': `radial-gradient(circle ${this.spotlightRadius}px at ${xPercent}% ${yPercent}%, transparent 0%, transparent 70%, rgba(0,0,0,${this.spotlightOpacity}) 100%)`
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

    // Use proportional positioning
    const left = (x / this.width) * this.stageWidthPx - performerSize / 2;
    const top = (y / this.depth) * this.stageHeightPx - performerSize / 2;

    const isCurrentUser = performer.id === this.currentUserId;
    const isSelected = this.isPerformerSelected(performer);
    const isHovered = this.isPerformerHovered(performer);

    const baseStyle = {
      left: `${left}px`,
      top: `${top}px`,
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
      'background-color': this.getPerformerColor(performer)
    };
  }

  getPreviousPositionStyle(performerId: string) {
    const performerSize = 30; // px
    const prevPos = this.getPreviousPosition(performerId);
    if (!prevPos) return { display: 'none' };

    // Use proportional positioning
    const left = (prevPos.x / this.width) * this.stageWidthPx - performerSize / 2;
    const top = (prevPos.y / this.depth) * this.stageHeightPx - performerSize / 2;

    return {
      left: `${left}px`,
      top: `${top}px`,
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
    // Enforce limits on width and depth
    this.editWidth = Math.min(Math.max(this.editWidth, 8), 60);
    this.editDepth = Math.min(Math.max(this.editDepth, 8), 45);
    
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
    
          this.triggerAutoSave();
        },
        error: (err) => {

          alert('Failed to save stage settings. Please try again.');
        }
      });
    } else {
      // If no segment ID (new segment), just trigger auto-save
      this.triggerAutoSave();
    }
  }

  saveSegment() {
    console.log('💾 DEBUG saveSegment called');
    console.log('💾 DEBUG saveSegment: segment stylesInSegment:', this.segment?.stylesInSegment);
    
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) {
      console.log('💾 DEBUG saveSegment: No current user or team, skipping save');
      return;
    }

    // If no segment exists, create a new one
    if (!this.segment || !this.segment._id) {
      console.log('💾 DEBUG saveSegment: Creating new segment');
      
      this.segmentService.createSegment(
        currentUser.team._id,
        this.segmentName,
        this.depth,
        this.width,
        this.divisions,
        this.segment?.stylesInSegment || []
      ).subscribe({
        next: (response) => {
          console.log('✅ DEBUG saveSegment: New segment created successfully');
          this.segment = response.segment;
          
          // Immediately update the segment with formations data
          const transformedFormations = this.formations.map(formation => 
            formation.map(performer => ({
              x: performer.x,
              y: performer.y,
              user: performer.isDummy ? null : performer.id, // Convert 'id' to 'user' for backend schema
              customColor: performer.customColor
            }))
          );
          
          console.log('💾 DEBUG Transformed formations for new segment:', transformedFormations);
          
          const updateData = {
            formations: transformedFormations,
            formationDurations: this.formationDurations,
            animationDurations: this.animationDurations
          };
          
          this.segmentService.updateSegment(this.segment._id, updateData).subscribe({
            next: () => {
              console.log('✅ DEBUG saveSegment: Segment formations updated successfully');
              this.lastSaveTime = new Date();
              
              // Update the URL to include the new segment ID
              this.router.navigate([], {
                relativeTo: this.route,
                queryParams: { id: this.segment._id },
                queryParamsHandling: 'merge'
              });
            },
            error: (err) => {
              console.error('❌ DEBUG saveSegment: Error updating segment formations:', err);
            }
          });
        },
        error: (err) => {
          console.error('❌ DEBUG saveSegment: Error creating new segment:', err);
        }
      });
      return;
    }

    // Update existing segment
    const transformedFormations = this.formations.map(formation => 
      formation.map(performer => ({
        x: performer.x,
        y: performer.y,
        user: performer.isDummy ? null : performer.id, // Convert 'id' to 'user' for backend schema
        customColor: performer.customColor
      }))
    );
    
    console.log('💾 DEBUG Transformed formations for saving:', transformedFormations);
    
    const updateData = {
      name: this.segmentName,
      width: this.width,
      depth: this.depth,
      divisions: this.divisions,
      formations: transformedFormations,
      formationDurations: this.formationDurations,
      animationDurations: this.animationDurations,
      stylesInSegment: this.segment.stylesInSegment || []
    };

    console.log('💾 DEBUG saveSegment: About to call segmentService.updateSegment');
    
    this.segmentService.updateSegment(this.segment._id, updateData).subscribe({
      next: () => {
        console.log('✅ DEBUG saveSegment: Segment saved successfully');
        this.lastSaveTime = new Date();
        
        // TEMPORARILY DISABLED: Check for consistency warnings after saving
        // This might be causing the hang
        // this.checkConsistencyWarnings();
        // this.checkFormationPositioningTips();
      },
      error: (err) => {
        console.error('❌ DEBUG saveSegment: Error saving segment:', err);
      }
    });
    
    console.log('💾 DEBUG saveSegment: updateSegment subscription created');
  }

  /**
   * Check for performer consistency warnings across segments
   */
  private checkConsistencyWarnings() {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) return;

    this.performerConsistencyService.analyzePerformerConsistency(currentUser.team._id).subscribe({
      next: (warnings) => {
        this.consistencyWarnings = warnings;
        this.showConsistencyWarnings = warnings.length > 0;
        
        if (warnings.length > 0) {

        }
      },
      error: (err) => {

      }
    });
  }

  /**
   * Check for formation positioning tips (mirror heights and skill-based recommendations)
   */
  private checkFormationPositioningTips() {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id || !this.segment) {
      return;
    }

    // Get the current formation data
    const currentFormation = this.formations[this.currentFormationIndex];
    if (!currentFormation || currentFormation.length === 0) {
      return;
    }

    // Convert formation to the format expected by the service
    const formationData = currentFormation.map(performer => ({
      user: performer.isDummy ? null : performer.id,
      x: performer.x,
      y: performer.y,
      isDummy: performer.isDummy
    }));

    this.performerConsistencyService.analyzeFormationPositioning(formationData, this.segment, currentUser.team._id).subscribe({
      next: (tips) => {
        this.formationTips = tips;
        this.updateCurrentFormationTips();
      },
      error: (err) => {
        console.error('Failed to analyze formation positioning:', err);
      }
    });
  }

  /**
   * Update the current formation tips based on the current formation index
   */
  private updateCurrentFormationTips() {
    this.currentFormationTips = this.formationTips;
  }

  /**
   * Get all tips for the current formation (consistency warnings + formation tips)
   */
  getAllCurrentTips(): Array<{ type: string; message: string; details?: any }> {
    const tips: Array<{ type: string; message: string; details?: any }> = [];
    
    // Add consistency warnings
    const consistencyWarnings = this.getCurrentSegmentWarnings();
    consistencyWarnings.forEach(warning => {
      tips.push({
        type: 'consistency',
        message: warning.message,
        details: {
          previousSegment: warning.previousSegment,
          currentSegment: warning.currentSegment,
          previousSide: warning.previousSide,
          currentSide: warning.currentSide
        }
      });
    });
    
    // Add formation positioning tips
    this.currentFormationTips.forEach(tip => {
      tips.push({
        type: tip.type,
        message: tip.warning.message,
        details: tip.warning
      });
    });
    
    return tips;
  }

  /**
   * Public method to manually trigger consistency check (for testing/debugging)
   */
  public triggerConsistencyCheck() {
    this.checkConsistencyWarnings();
  }

  /**
   * Public method to manually trigger formation positioning check
   */
  public triggerFormationPositioningCheck() {
    this.checkFormationPositioningTips();
  }

  /**
   * Dismiss consistency warnings
   */
  dismissConsistencyWarnings() {
    this.showConsistencyWarnings = false;
  }

  /**
   * Toggle the positioning tips panel
   */
  togglePositioningTips() {
    this.showPositioningTips = !this.showPositioningTips;
  }

  /**
   * Get warnings for the current segment, filtered by current formation
   */
  getCurrentSegmentWarnings(): ConsistencyWarning[] {
    if (!this.segment?.name) return [];
    
    const segmentWarnings = this.consistencyWarnings.filter(warning => 
      warning.currentSegment === this.segment.name || 
      warning.previousSegment === this.segment.name
    );
    
    // Filter warnings based on current formation index
    return segmentWarnings.filter(warning => {
      const isFirstFormation = this.currentFormationIndex === 0;
      const isLastFormation = this.currentFormationIndex === this.formations.length - 1;
      
      if (isFirstFormation) {
        // Only show warnings about the start of this segment when on first formation
        return warning.currentSegment === this.segment.name;
      } else if (isLastFormation) {
        // Only show warnings about the end of this segment when on last formation
        return warning.previousSegment === this.segment.name;
      } else {
        // Don't show any warnings for middle formations
        return false;
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
    const startX = (prevPos.x / this.width) * this.stageWidthPx;
    const startY = (prevPos.y / this.depth) * this.stageHeightPx;
    const endX = (performer.x / this.width) * this.stageWidthPx;
    const endY = (performer.y / this.depth) * this.stageHeightPx;
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

  async onMusicFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.isUploadingMusic = true;
    try {
      this.segmentService.getMusicPresignedUrl(this.segment._id, file.name, file.type).subscribe({
        next: async ({ url, key }) => {
          try {
            const response = await fetch(url, {
              method: 'PUT',
              headers: { 'Content-Type': file.type },
              body: file
            });
            
            if (response.ok) {
              // Construct the S3 URL
              const musicUrl = `https://${environment.s3Bucket}.s3.${environment.s3Region}.amazonaws.com/${key}`;
              // Save musicUrl to segment
              this.segmentService.updateSegment(this.segment._id, { musicUrl }).subscribe({
                next: () => {

                  // Get signed URL for playback
                  this.getSignedMusicUrl();
                  this.isUploadingMusic = false;
                },
                error: (err) => {

                  this.isUploadingMusic = false;
                }
              });
            } else {

              this.isUploadingMusic = false;
            }
          } catch (err) {

            this.isUploadingMusic = false;
          }
        },
        error: (err) => {

          this.isUploadingMusic = false;
        }
      });
    } catch (error) {

      this.isUploadingMusic = false;
    }
  }

  // Add method to get signed URL for playing music
  getSignedMusicUrl() {
    if (!this.segment?._id) return;
    this.segmentService.getMusicUrl(this.segment._id).subscribe({
      next: ({ url }) => {
        this.signedMusicUrl = url;

        // Wait for the next render cycle to ensure the waveform container exists
        setTimeout(() => {
          this.initWaveform();
        }, 0);
      },
      error: (err) => {

      }
    });
  }

  initWaveform() {

    const container = document.getElementById('waveform');
    
    if (!container) {

      return;
    }

    try {
      if (this.waveSurfer) {

        this.waveSurfer.destroy();
      }


      
      // Mobile-specific configuration
      const config: any = {
        container: '#waveform',
        waveColor: '#3b82f6',
        progressColor: '#ffd700',
        cursorColor: '#ffd700',
        barWidth: 2,
        barRadius: 3,
        cursorWidth: 2,
        height: 80,
        barGap: 2,
        normalize: true,
        backend: 'WebAudio'
      };

      // Mobile-specific settings
      if (this.isMobile) {
        config.backend = 'WebAudio';
        config.mediaControls = false;
        config.autoplay = false;
        config.interact = true;

      }

      this.waveSurfer = WaveSurfer.create(config);

      
      if (this.signedMusicUrl) {

        this.waveSurfer.load(this.signedMusicUrl);
        this.waveSurfer.on('finish', () => {
          this.isPlaying = false;
        });

        // Mobile-specific audio event handlers
        if (this.isMobile) {
          this.waveSurfer.on('ready', () => {

            this.handleMobileAudioReady();
          });

          this.waveSurfer.on('play', () => {

            // Resume audio context when play starts
            if (this.waveSurfer && (this.waveSurfer as any).backend && (this.waveSurfer as any).backend.audioContext) {
              (this.waveSurfer as any).backend.audioContext.resume();
            }
          });

          this.waveSurfer.on('error', (error) => {

          });
        }
      }
    } catch (error) {

    }
  }

  togglePlay() {


    if (this.isPlaying) {
      // Stop playback
      if (this.waveSurfer) {
        this.waveSurfer.pause();
      }
      if (this.videoElement) {
        this.videoElement.pause();
      }
      if (this.playbackTimer) {
        cancelAnimationFrame(this.playbackTimer);
        this.playbackTimer = null;
      }
      this.isPlaying = false;
      this.hoveredTimelineTime = null;

    } else {
      // Start playback - with mobile audio context handling
      if (this.isMobile && this.waveSurfer) {
        this.initializeMobileAudioContextOnLoad();
      }
      
      if (this.waveSurfer) {
        this.waveSurfer.play();
      }
      if (this.videoElement) {
        this.videoElement.play();
      }

      // Use requestAnimationFrame for smoother updates
      const updatePlayback = () => {
        if (this.waveSurfer) {
          this.playbackTime = this.waveSurfer.getCurrentTime();
        } else {
          this.playbackTime += 0.016; // Approximately 60fps
        }
        const currentTime = this.playbackTime;
        
        // Force change detection for playhead update
        this.cdr.detectChanges();
        
        // Update video if needed
        const videoElement = this.videoElement;
        if (videoElement) {
          if (currentTime <= videoElement.duration) {
            if (videoElement.paused) {
              videoElement.play();
            }
          } else {
            // If past video duration, pause at last frame
            videoElement.pause();
            videoElement.currentTime = videoElement.duration;
          }
        }

        let t = 0;
        let found = false;
        for (let i = 0; i < this.formations.length; i++) {
          const hold = this.formationDurations[i] || 4;
          if (currentTime < t + hold) {
            this.playingFormationIndex = i;
            this.inTransition = false;
            this.animatedPositions = {};
            found = true;
            break;
          }
          t += hold;
          if (i < this.animationDurations.length) {
            const trans = this.animationDurations[i] || 1;
            if (currentTime < t + trans) {
              // During transition, animate between i and i+1
              this.playingFormationIndex = i + 1;
              this.inTransition = true;
              const progress = (currentTime - t) / trans;
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

        // Schedule next frame if still playing
        if (this.isPlaying) {
          this.playbackTimer = requestAnimationFrame(updatePlayback);
        }
      };

      this.isPlaying = true;
      this.playbackTimer = requestAnimationFrame(updatePlayback);

    }
  }

  initializeMobileAudioContext() {
    if (!this.isMobile || !this.waveSurfer) return;
    
    try {
      // Resume audio context for mobile browsers
      if ((this.waveSurfer as any).backend && (this.waveSurfer as any).backend.audioContext) {
        const audioContext = (this.waveSurfer as any).backend.audioContext;
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {

          }).catch((error: any) => {

          });
        }
      }
      
      // Also try to resume any existing audio context
      if (window.AudioContext || (window as any).webkitAudioContext) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

      }
    } catch (error) {

    }
  }

  startFormationPlayback() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.playbackTime = 0;
    this.playingFormationIndex = 0;
    if (this.waveSurfer) {
      this.waveSurfer.play();
    }
    if (this.videoElement) {
      this.videoElement.play();
    }
    this.playbackTimer = setInterval(() => {
      this.playbackTime += 0.1;
      const currentTime = this.playbackTime;
      let t = 0;
      let found = false;
      for (let i = 0; i < this.formations.length; i++) {
        const hold = this.formationDurations[i] || 4;
        if (currentTime < t + hold) {
          this.playingFormationIndex = i;
          this.inTransition = false;
          this.animatedPositions = {};
          found = true;
          break;
        }
        t += hold;
        if (i < this.animationDurations.length) {
          const trans = this.animationDurations[i] || 1;
          if (currentTime < t + trans) {
            // During transition, animate between i and i+1
            this.playingFormationIndex = i + 1;
            this.inTransition = true;
            const progress = (currentTime - t) / trans;
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

  stopFormationPlayback() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.isPlaying = false;
    this.playbackTime = 0;
    this.playingFormationIndex = 0;
    if (this.waveSurfer) {
      this.waveSurfer.pause();
    }
    if (this.videoElement) {
      this.videoElement.pause();
    }
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

  ngAfterViewChecked() {
    if (
      this.signedMusicUrl &&
      document.getElementById('waveform') &&
      this.waveformInitializedForUrl !== this.signedMusicUrl
    ) {
      this.initWaveform();
      this.waveformInitializedForUrl = this.signedMusicUrl;
    }
    
    // Update 3D performers if in 3D view, but debounce to prevent excessive calls
    if (this.is3DView && !this._isUpdating3D) {
      this._isUpdating3D = true;
      
      // Cancel any pending 3D update
      if (this._3DUpdateFrameId) {
        cancelAnimationFrame(this._3DUpdateFrameId);
      }
      
      // Debounce 3D updates to prevent excessive calls during change detection
      this._3DUpdateFrameId = requestAnimationFrame(() => {
        this.update3DPerformers();
        this._isUpdating3D = false;
        this._3DUpdateFrameId = null;
      });
    }
  }

  ngOnDestroy() {
    // Stop all playback
    this.stopFormationPlayback();
    
    // Clean up caches
    this.clearAllCaches();
    
    // Clean up WaveSurfer
    if (this.waveSurfer) {
      this.waveSurfer.destroy();
      this.waveSurfer = null;
    }
    
    // Clean up intervals
    if (this.unifiedFormationInterval) {
      clearInterval(this.unifiedFormationInterval);
      this.unifiedFormationInterval = null;
    }
    
    // Clean up playback timer
    if (this.playbackTimer) {
      cancelAnimationFrame(this.playbackTimer);
      this.playbackTimer = null;
    }
    
    // Clean up refresh-related properties
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    if (this.currentRefreshRequest) {
      this.currentRefreshRequest.unsubscribe();
      this.currentRefreshRequest = null;
    }
    
    // Clean up saveSubject subscription
    if (this.saveSubscription) {
      this.saveSubscription.unsubscribe();
      this.saveSubscription = null;
    }
    if (this.saveSubject) {
      this.saveSubject.complete();
    }
    
    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.resetKeyStates);
    
    // Remove tracked resize listeners
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
    if (this.windowResizeListener) {
      window.removeEventListener('resize', this.windowResizeListener);
      this.windowResizeListener = null;
    }
    
    // Remove formation resize event listeners
    document.removeEventListener('mousemove', this.onFormationResizeMove);
    document.removeEventListener('mouseup', this.onFormationResizeEnd);
    document.removeEventListener('mousemove', this.onTransitionResizeMove);
    document.removeEventListener('mouseup', this.onTransitionResizeEnd);
    
    // Clean up 3D scene
    this.cleanup3DScene();
    
    // Clean up animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Clean up YouTube player
    if (this.youtubePlayer) {
      this.youtubePlayer.destroy();
      this.youtubePlayer = null;
    }
    
    // Clean up video elements
    if (this.videoContainer && this.videoContainer.parentNode) {
      this.videoContainer.parentNode.removeChild(this.videoContainer);
      this.videoContainer = null;
    }
    if (this.videoPlane && this.scene) {
      this.scene.remove(this.videoPlane);
      this.videoPlane = null;
    }
    if (this.videoElement && this.videoElement.parentNode) {
      this.videoElement.parentNode.removeChild(this.videoElement);
      this.videoElement = null;
    }
    if (this.youtubeIframe && this.youtubeIframe.parentNode) {
      this.youtubeIframe.parentNode.removeChild(this.youtubeIframe);
      this.youtubeIframe = null;
    }
    
    // Clean up video textures
    this.clearDirectVideoTexture();
    
    // Reset state
    this.showYoutubeOverlay = false;
    this.sanitizedYoutubeEmbedUrl = null;
    this.youtubeUrl = '';
    
    // Clear all arrays and objects to help garbage collection
    this.formations = [];
    this.formationDurations = [];
    this.animationDurations = [];
    this.teamRoster = [];
    this.segmentRoster = [];
    this.consistencyWarnings = [];
    this.formationTips = [];
    this.currentFormationTips = [];
    this.selectedPerformerIds.clear();
    this.performerMeshes = {};
    this.animatedPositions = {};
    this.selectedPerformersInitialPositions = {};
    
    console.log('✅ DEBUG ngOnDestroy: Component cleanup completed');
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
    event.stopPropagation();
    this.resizingFormationIndex = i;
    this.resizingStartX = event.clientX;
    this.resizingStartDuration = this.formationDurations[i] || 4;
    
    // Add event listeners to window to handle drag outside the timeline
    window.addEventListener('mousemove', this.onFormationResizeMove);
    window.addEventListener('mouseup', this.onFormationResizeEnd);
  }

  onFormationResizeMove = (event: MouseEvent) => {
    if (this.resizingFormationIndex === null) return;
    
    const dx = event.clientX - this.resizingStartX;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    
    // Account for zoom level in the calculation
    const pixelsToDuration = totalTimelineDuration / (this.waveformWidthPx * this.timelineZoom);
    
    let newDuration = this.resizingStartDuration + (dx * pixelsToDuration);
    newDuration = Math.max(1, Math.min(100, newDuration));
    
    if (isNaN(newDuration)) {

      return;
    }
    
    this.formationDurations[this.resizingFormationIndex] = newDuration;
    this.formationDurations = [...this.formationDurations]; // force change detection
  };

  onFormationResizeEnd = () => {
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
    this.resizingTransitionStartDuration = this.animationDurations[i] || 1;
    
    // Add event listeners to window to handle drag outside the timeline
    window.addEventListener('mousemove', this.onTransitionResizeMove);
    window.addEventListener('mouseup', this.onTransitionResizeEnd);
  }

  onTransitionResizeMove = (event: MouseEvent) => {
    if (this.resizingTransitionIndex === null) return;
    
    const dx = event.clientX - this.resizingTransitionStartX;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    
    // Account for zoom level in the calculation
    const pixelsToDuration = totalTimelineDuration / (this.waveformWidthPx * this.timelineZoom);
    
    let newDuration = this.resizingTransitionStartDuration + (dx * pixelsToDuration);
    newDuration = Math.max(0.2, newDuration);
    
    if (isNaN(newDuration)) {

      return;
    }
    
    this.animationDurations[this.resizingTransitionIndex] = newDuration;
    this.animationDurations = [...this.animationDurations]; // force change detection
  };

  onTransitionResizeEnd = () => {
    this.resizingTransitionIndex = null;
    window.removeEventListener('mousemove', this.onTransitionResizeMove);
    window.removeEventListener('mouseup', this.onTransitionResizeEnd);
  };

  getTimelinePixelWidth(): number {
    // Calculate total width based on all formations and transitions
    let totalWidth = 0;
    for (let i = 0; i < this.formations.length; i++) {
      totalWidth += this.getFormationPixelWidth(i);
      if (i < this.animationDurations.length) {
        totalWidth += this.getTransitionPixelWidth(i);
      }
    }
    return totalWidth;
  }

  getFormationPixelWidth(i: number): number {
    const duration = this.formationDurations[i] || 4;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    
    // Calculate the width based on the formation's proportion of the total timeline
    const baseWidth = (duration / totalTimelineDuration) * this.waveformWidthPx;
    
    return baseWidth * this.timelineZoom;
  }

  getTransitionPixelWidth(i: number): number {
    const duration = this.animationDurations[i] || 1;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    
    // Calculate the width based on the transition's proportion of the total timeline
    const baseWidth = (duration / totalTimelineDuration) * this.waveformWidthPx;
    
    return baseWidth * this.timelineZoom;
  }

  getPlayheadPixel(): number {
    // Calculate position based on playback time and zoom level
    const totalWidth = this.getTimelinePixelWidth();
    const totalDuration = this.getTimelineTotalDuration();
    
    // Calculate the base position without zoom
    const basePosition = (this.playbackTime / totalDuration) * totalWidth;
    
    // Calculate the scroll offset
    const scrollLeft = this.timelineBarRef?.nativeElement?.scrollLeft || 0;
    
    // Calculate the final position, maintaining consistent speed regardless of zoom
    const finalPosition = basePosition - scrollLeft;
    
    // Ensure the position is within bounds
    return Math.max(0, Math.min(finalPosition, totalWidth));
  }

  getHoveredPlayheadPixel(): number {
    if (this.isPlaying) {
      // During playback, use the current playback time
      return this.getPlayheadPixel();
    }
    
    // When not playing, use hover position
    if (this.hoveredTimelineX === null) return 0;
    
    const totalWidth = this.getTimelinePixelWidth();
    const totalDuration = this.getTimelineTotalDuration();
    
    // Calculate position based on hovered time
    if (this.hoveredTimelineTime !== null) {
      const timePercent = this.hoveredTimelineTime / totalDuration;
      return timePercent * totalWidth;
    }
    
    // Fallback to direct x position if time is not available
    return Math.max(0, Math.min(this.hoveredTimelineX, totalWidth));
  }

  async selectPerformer(performer: Performer) {
    // Clear user cache when selection changes
    this.clearSelectedUserCache();
    
    // Rest of the existing method...
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - this.lastClickTime;
    
    // If it's a rapid click (within debounce time), treat as double-click
    if (timeSinceLastClick < this.CLICK_DEBOUNCE_MS && !this.justDragged) {
      // Double-click behavior - show previous position
      this.selectedPerformerForPreviousPosition = performer.id;
      this.lastClickTime = 0; // Reset to prevent triple-click
      return;
    }
    
    this.lastClickTime = currentTime;
    this.justDragged = false;
    
    // Check if multi-selection is enabled
    if (this.isMultiSelectionEnabled()) {
      // Multi-selection mode
      if (this.selectedPerformerIds.has(performer.id)) {
        this.selectedPerformerIds.delete(performer.id);
        if (this.selectedPerformerIds.size === 0) {
          this.selectedPerformerId = null;
          this.sidePanelMode = 'roster';
        } else {
          // Keep the first selected performer as the main selection
          this.selectedPerformerId = Array.from(this.selectedPerformerIds)[0];
        }
      } else {
        this.selectedPerformerIds.add(performer.id);
        this.selectedPerformerId = performer.id;
        this.sidePanelMode = 'performer';
      }
    } else {
      // Single selection mode
      this.selectedPerformerIds.clear();
      this.selectedPerformerIds.add(performer.id);
      this.selectedPerformerId = performer.id;
      this.sidePanelMode = 'performer';
    }
    
    // Store initial positions for all selected performers
    this.selectedPerformersInitialPositions = {};
    this.selectedPerformerIds.forEach(id => {
      const selectedPerformer = this.performers.find(p => p.id === id);
      if (selectedPerformer) {
        this.selectedPerformersInitialPositions[id] = { x: selectedPerformer.x, y: selectedPerformer.y };
      }
    });
    
    // Trigger auto-save
    this.triggerAutoSave();
  }

  removePerformer() {
    if (!this.selectedPerformer) return;
    const performerId = this.selectedPerformer.id;
    const isDummy = this.selectedPerformer.isDummy;
    // Remove from all formations
    this.formations = this.formations.map(formation => 
      formation.filter(p => p.id !== performerId)
    );
    // Remove from segment roster if present
    this.segmentRoster = this.segmentRoster.filter(m => m._id !== performerId);
    // If dummy, delete from backend
    if (isDummy) {
      this.teamService.deleteDummyUser(performerId).subscribe({
        next: () => console.log('Dummy user deleted from backend'),
        error: (err) => console.error('Failed to delete dummy user from backend', err)
      });
    }
    // Clear selection
    this.selectedPerformerIds.delete(performerId);
    this.selectedPerformerId = null;
    // Switch back to roster panel
    this.sidePanelMode = 'roster';
    // Trigger auto-save
    this.triggerAutoSave();
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
    
    // Calculate total timeline width
    const totalWidth = this.getTimelinePixelWidth();
    const totalDuration = this.getTimelineTotalDuration();
    
    // Calculate time based on position relative to total width
    const timePercent = Math.max(0, Math.min(1, x / totalWidth));
    this.hoveredTimelineTime = timePercent * totalDuration;
    
    // Update formation index based on time
    let currentTime = 0;
    for (let i = 0; i < this.formations.length; i++) {
      const formationDuration = this.formationDurations[i] || 4;
      if (this.hoveredTimelineTime < currentTime + formationDuration) {
        this.hoveredFormationIndex = i;
        break;
      }
      currentTime += formationDuration;
      if (i < this.animationDurations.length) {
        currentTime += this.animationDurations[i] || 1;
      }
    }
  }

  onTimelineMouseLeave() {
    this.hoveredTimelineX = null;
    this.hoveredTimelineTime = null;
    this.hoveredFormationIndex = null;
  }

  onTimelineClick(event: MouseEvent) {
    const bar = this.timelineBarRef?.nativeElement;
    if (!bar) return;

    const rect = bar.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const timelineTime = (x / this.getTimelinePixelWidth()) * this.getTimelineTotalDuration();



    if (timelineTime !== null && this.waveSurfer && this.waveSurfer.getDuration()) {
      // Initialize mobile audio context on timeline interaction
      if (this.isMobile) {
        this.initializeMobileAudioContext();
      }
      
      const audioDuration = this.waveSurfer.getDuration();
      // Clamp to audio duration
      const audioTime = Math.max(0, Math.min(timelineTime, audioDuration));
      this.waveSurfer.seekTo(audioTime / audioDuration);
      this.isPlaying = this.waveSurfer.isPlaying();
      this.playbackTime = audioTime;
      this.hoveredTimelineTime = audioTime;

      // Update video position if it exists
      const videoElement = this.videoElement;
      if (videoElement) {
        if (audioTime <= videoElement.duration) {
          videoElement.currentTime = audioTime;
        } else {
          // If seeking past video duration, pause at last frame
          videoElement.currentTime = videoElement.duration;
          videoElement.pause();
        }
      }

      // Update formation position
      let t = 0;
      for (let i = 0; i < this.formations.length; i++) {
        const hold = this.formationDurations[i] || 4;
        if (audioTime < t + hold) {
          this.playingFormationIndex = i;
          this.inTransition = false;
          this.animatedPositions = {};
          break;
        }
        t += hold;
        if (i < this.animationDurations.length) {
          const trans = this.animationDurations[i] || 1;
          if (audioTime < t + trans) {
            // During transition, animate between i and i+1
            this.playingFormationIndex = i + 1;
            this.inTransition = true;
            const progress = (audioTime - t) / trans;
            this.animatedPositions = this.interpolateFormations(i, i + 1, progress);
            break;
          }
          t += trans;
        }
      }
    }
  }

  toggleUnifiedPlay() {
    if (this.signedMusicUrl && this.waveSurfer) {
      // If audio is present, use audio controls
      // For mobile, ensure audio context is initialized on user interaction
      if (this.isMobile) {
        this.initializeMobileAudioContext();
      }
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
      // Return custom color if set, otherwise default color
      return performer.customColor || '#00b4d8';
    }

    // Get the user from teamRoster to access their skill levels
    const user = this.teamRoster.find(m => m._id === performer.id);
    
    if (!user || !user.skillLevels) {
      return '#00b4d8'; // electric blue
    }

    // Get skill level for the selected style - add proper null checking
    const styleName = this.selectedStyle?.name?.toLowerCase();
    
    if (!styleName) {
      return '#00b4d8'; // electric blue
    }
    
    const skillLevel = user.skillLevels?.[styleName];
    
    if (!skillLevel) {
      return '#00b4d8'; // electric blue
    }

    // Return the color based on the skill level section
    const color = this.getGradientColor(skillLevel);
    return color;
  }

  getGradientColor(skillLevel: number): string {
    // Define the color stops for each section with more contrast while maintaining theme
    const colors = [
      '#4c1d95', // Very dark purple for level 1
      '#7c3aed', // Deep purple for level 2
      '#d946ef', // Bright magenta for level 3
      '#f472b6', // Soft pink for level 4
      '#FFDF00'  // Hot pink for level 5
    ];

    // Ensure skill level is within bounds
    const index = Math.max(0, Math.min(Math.floor(skillLevel) - 1, colors.length - 1));
    return colors[index];
  }

  toggleColorBySkill() {
    this.showColorBySkill = !this.showColorBySkill;
    if (!this.showColorBySkill) {
      this.selectedStyle = null;
    }
  }

  selectStyle(style: Style) {
    this.selectedStyle = style;

    // Update skill levels for all performers based on the new style
    this.formations = this.formations.map(formation =>
      formation.map(performer => {
        if (performer.id.startsWith('dummy-')) {
          return performer;
        }
        const user = this.teamRoster.find(m => m._id === performer.id);
        const skillLevel = user?.skillLevels?.[style.name.toLowerCase()] || 1;

      return {
        ...performer,
          skillLevels: {
            ...performer.skillLevels, // Preserve existing skill levels
            [style.name.toLowerCase()]: skillLevel
          }
        };
      })
    );
  }

  get segmentStyles(): Style[] {
    if (!this.segment?.stylesInSegment) return [];
    
    // Return cached styles if available and segment hasn't changed
    if (this._segmentStylesCache.length > 0) {
      return this._segmentStylesCache;
    }
    
    // Build styles with their actual colors from the team
    const styles = this.segment.stylesInSegment.map((name: string) => {
      const teamStyle = this.teamStyles.find(s => s.name.toLowerCase() === name.toLowerCase());
      return {
        name,
        color: teamStyle?.color || '#ffffff'
      };
    });
    
    // Cache the result
    this._segmentStylesCache = styles;
    
    return styles;
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
    console.log('💾 DEBUG triggerAutoSave called');
    console.log('💾 DEBUG triggerAutoSave: segment stylesInSegment:', this.segment?.stylesInSegment);
    this.saveSubject.next();
    console.log('💾 DEBUG triggerAutoSave: saveSubject.next() called');
  }

  // Add method to force immediate save for new segments
  private forceSaveForNewSegment() {
    if (!this.segment || !this.segment._id) {
      console.log('💾 DEBUG forceSaveForNewSegment: Forcing immediate save for new segment');
      this.saveSegment(); // Call save directly without debouncing
    }
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

  togglePerformerPairingDropdown() {
    this.showPerformerPairingDropdown = !this.showPerformerPairingDropdown;
    if (this.showPerformerPairingDropdown) {
      this.showAddPerformerDropdown = false;
      this.showUserAssignmentDropdown = false;
    }
  }

  isDummyPerformer(performer: Performer): boolean {
    return performer.id.startsWith('dummy-');
  }

  convertToDummy() {
    if (!this.selectedPerformer) return;

    const dummyName = `Dumb ${this.dummyCounter}`;
    const dummyId = `dummy-${this.dummyCounter}`;

    // Create a new dummy performer with the same properties
    const dummyPerformer: Performer = {
      id: dummyId,
      name: dummyName,
      x: this.selectedPerformer.x,
      y: this.selectedPerformer.y,
      skillLevels: { ...this.selectedPerformer.skillLevels },
      height: this.selectedPerformer.height,
      isDummy: true,
      dummyName: dummyName
    };

    this.formations = this.formations.map(formation =>
      formation.map(p => p.id === this.selectedPerformer?.id ? dummyPerformer : p)
    );

    // Update selection
    this.selectedPerformerIds.delete(this.selectedPerformer.id);
    this.selectedPerformerIds.add(dummyPerformer.id);
    this.selectedPerformerId = dummyPerformer.id;

    // Close the dropdown
    this.showPerformerPairingDropdown = false;

    this.dummyCounter++;
    this.triggerAutoSave();
  }

  convertToUser(user: any) {
    if (!this.selectedPerformer || !this.selectedPerformer.isDummy) return;

    // Create a new user performer
    const userPerformer: Performer = {
      id: user._id,
        name: user.name,
      x: this.selectedPerformer.x,
      y: this.selectedPerformer.y,
      skillLevels: user?.skillLevels || {},
      height: user?.height || 5.5,
      isDummy: false
    };

    // Replace the performer in all formations
    this.formations = this.formations.map(formation =>
      formation.map(p => p.id === this.selectedPerformer?.id ? userPerformer : p)
    );

    // Update selection
    this.selectedPerformerIds.delete(this.selectedPerformer.id);
    this.selectedPerformerIds.add(userPerformer.id);
    this.selectedPerformerId = userPerformer.id;

    // Close the dropdown
    this.showPerformerPairingDropdown = false;

    this.triggerAutoSave();
  }

  updatePerformerName() {
    if (!this.selectedPerformerId) return;
    const user = this.teamRoster.find(m => m._id === this.selectedPerformerId);
    if (user) {
      this.teamService.updateUser(user._id, { name: user.name }).subscribe({
        next: (res) => console.log('Name updated:', res),
        error: (err) => console.error('Name update failed:', err)
      });
    }
    this.triggerAutoSave();
  }

  updatePerformerHeight() {
    if (!this.selectedPerformerId) return;
    const user = this.teamRoster.find(m => m._id === this.selectedPerformerId);
    if (user) {
      const heightInInches = this.getHeightInInches(this.selectedPerformerFeet, this.selectedPerformerInches);
      this.teamService.updateUser(user._id, { height: heightInInches }).subscribe({
        next: (res) => console.log('Height updated:', res),
        error: (err) => console.error('Height update failed:', err)
      });
    }
    this.triggerAutoSave();
  }

  getSelectedUserSkillLevel(styleKey: string): number {
    if (!this.selectedPerformerId) return 1;
    
    // Use cached skill levels if available
    if (this._selectedUserSkillLevelsCache[styleKey] !== undefined) {
      return this._selectedUserSkillLevelsCache[styleKey];
    }
    
    // Cache the selected user to avoid repeated find operations
    if (!this._selectedUserCache || this._selectedUserCache._id !== this.selectedPerformerId) {
      this._selectedUserCache = this.teamRoster.find(m => m._id === this.selectedPerformerId);
    }
    
    const skillLevel = this._selectedUserCache?.skillLevels?.[styleKey] || 1;
    
    // Cache the result
    this._selectedUserSkillLevelsCache[styleKey] = skillLevel;
    
    return skillLevel;
  }

  updatePerformerSkill(styleName: string, newValue: number) {
    if (!this.selectedPerformerId) {
      console.warn('[SkillSlider] No selectedPerformerId');
      return;
    }
    const styleKey = styleName.toLowerCase();
    // Find the user in teamRoster
    const user = this.teamRoster.find(m => m._id === this.selectedPerformerId);
    if (user) {
      // Update the skill level directly in teamRoster
      if (!user.skillLevels) {
        user.skillLevels = {};
      }
      user.skillLevels[styleKey] = newValue;
      const payload = { skillLevels: user.skillLevels };
      console.log('[SkillSlider] Sending PATCH payload:', payload, 'to userId:', user._id);
      this.teamService.updateUser(user._id, payload).subscribe({
        next: (res) => console.log('[SkillSlider] Skill updated:', res),
        error: (err) => console.error('[SkillSlider] Skill update failed:', err)
      });
    } else {
      console.warn('[SkillSlider] No user found in teamRoster for selectedPerformerId:', this.selectedPerformerId);
    }
    
    // Clear skill level cache for this style
    delete this._selectedUserSkillLevelsCache[styleKey];
    
    this.triggerAutoSave();
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      this.isShiftPressed = true;
      console.log('Shift pressed, isShiftPressed:', this.isShiftPressed);
    }
    if (event.key === 'Meta' || event.metaKey) {
      this.isCommandPressed = true;
      console.log('Command pressed, isCommandPressed:', this.isCommandPressed);
    }
  };

  handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      this.isShiftPressed = false;
      console.log('Shift released, isShiftPressed:', this.isShiftPressed);
    }
    if (event.key === 'Meta') {
      this.isCommandPressed = false;
      console.log('Command released, isCommandPressed:', this.isCommandPressed);
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
      // Clear the previous position display when clicking on stage
      this.selectedPerformerForPreviousPosition = null;
      this.triggerAutoSave();
      // Switch to roster mode when deselecting
      this.sidePanelMode = 'roster';
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

  deleteFormation(index: number) {
    if (!this.isCaptain || this.formations.length <= 1) return;
    
    // Remove the formation
    this.formations.splice(index, 1);
    
    // Remove the corresponding duration
    this.formationDurations.splice(index, 1);
    
    // Remove the corresponding transition duration if it exists
    if (index < this.animationDurations.length) {
      this.animationDurations.splice(index, 1);
    }
    
    // Update current formation index if needed
    if (this.currentFormationIndex >= this.formations.length) {
      this.currentFormationIndex = this.formations.length - 1;
    }
    
    // Update playing formation index if needed
    if (this.playingFormationIndex >= this.formations.length) {
      this.playingFormationIndex = this.formations.length - 1;
    }
    
    // Force change detection
    this.formations = [...this.formations];
    this.formationDurations = [...this.formationDurations];
    this.animationDurations = [...this.animationDurations];
  }

  duplicateFormation(index: number) {
    if (!this.isCaptain || this.formations.length === 0) return;
    // Deep copy the formation
    const formationCopy = this.formations[index].map(p => ({ ...p }));
    this.formations.splice(index + 1, 0, formationCopy);
    // Copy the duration
    this.formationDurations.splice(index + 1, 0, this.formationDurations[index]);
    // Copy the transition duration (or set a default if not present)
    if (this.animationDurations[index]) {
      this.animationDurations.splice(index + 1, 0, this.animationDurations[index]);
    } else {
      this.animationDurations.splice(index + 1, 0, 1);
    }
    // Force change detection
    this.formations = [...this.formations];
    this.formationDurations = [...this.formationDurations];
    this.animationDurations = [...this.animationDurations];
  }

  private updateStageTransform() {
    const stageArea = this.stageRef?.nativeElement;
    if (!stageArea) return;

    stageArea.style.transform = this.getStageTransform();
    stageArea.style.transformOrigin = 'center center';
  }

  private enforcePanBounds() {
    const stageArea = this.stageRef?.nativeElement;
    if (!stageArea) return;

    const rect = stageArea.getBoundingClientRect();
    const maxX = (rect.width - rect.width) / 2;
    const maxY = (rect.height - rect.height) / 2;

    // Clamp the translation values
    this.currentTranslateX = Math.max(-maxX, Math.min(maxX, this.currentTranslateX));
    this.currentTranslateY = Math.max(-maxY, Math.min(maxY, this.currentTranslateY));
  }

  toggle3DView() {
    this.is3DView = !this.is3DView;
    if (this.is3DView) {
      // Set side panel to 3D mode when entering 3D view
      this.sidePanelMode = '3d';
      // Wait for the view to update and DOM to be ready
      setTimeout(() => {
        if (this.threeContainer && this.threeContainer.nativeElement) {
          this.init3DScene();
        } else {
          // Try again on next tick if not ready
          setTimeout(() => this.init3DScene(), 30);
        }
      }, 0);
    } else {
      this.cleanup3DScene();
      // Reinitialize zoom gestures when returning to 2D view
      setTimeout(() => {
        if (this.stageRef && this.stageRef.nativeElement) {
          this.setupZoomGestures();
        }
      }, 0);
    }
  }

  flipStage() {
    this.isStageFlipped = !this.isStageFlipped;
    
    // Flip all performers in all formations by mirroring their Y coordinates
    this.formations.forEach(formation => {
      formation.forEach(performer => {
        // Mirror the Y coordinate across the middle horizontal line
        performer.y = this.depth - performer.y;
      });
    });
    
    // Trigger auto-save to persist the changes
    this.triggerAutoSave();
  }

  private cleanup3DScene() {
    // Cancel animation
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    // Remove all meshes from scene
    if (this.scene) {
      while (this.scene.children.length > 0) {
        const obj = this.scene.children[0];
        if ((obj as any).geometry) (obj as any).geometry.dispose?.();
        if ((obj as any).material) {
          if (Array.isArray((obj as any).material)) {
            (obj as any).material.forEach((m: any) => m.dispose?.());
          } else {
            (obj as any).material.dispose?.();
          }
        }
        this.scene.remove(obj);
      }
    }
    // Remove renderer DOM element
    if (this.threeRenderer && this.threeRenderer.domElement && this.threeContainer?.nativeElement.contains(this.threeRenderer.domElement)) {
      this.threeContainer.nativeElement.removeChild(this.threeRenderer.domElement);
    }
    // Dispose renderer
    if (this.threeRenderer) {
      this.threeRenderer.dispose();
      this.threeRenderer = null;
    }
    // Dispose controls
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    this.scene = null;
    this.camera = null;
    this.performerMeshes = {};
    this.stageMesh = null;
  }

  private init3DScene() {
    if (!this.threeContainer) {
      console.error('3D container not found');
      return;
    }
    console.log('Initializing 3D scene...');
    this.scene = new THREE.Scene();
    this.scene.background = null; // Make background transparent
    const container = this.threeContainer.nativeElement;
    const width = container.clientWidth || 1500;
    const height = container.clientHeight || 700;
    const stageCenter = { x: 0, y: 0, z: 0 };
    const distance = Math.max(this.width, this.depth) * 1.5;
   
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 20, distance); // Default front view
    this.camera.lookAt(stageCenter.x, 0, stageCenter.z);
    this.threeRenderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true // Enable transparency
    });
    this.threeRenderer.setSize(width, height);
    this.threeRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.threeRenderer.domElement);

    // Add click event listener for performer selection
    this.threeRenderer.domElement.addEventListener('click', (event) => this.on3DViewClick(event));

    // Restore OrbitControls and restrict movement
    this.controls = new OrbitControls(this.camera, this.threeRenderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = distance * 0.5;
    this.controls.maxDistance = distance * 2;
    // Restrict azimuth to 0 (no side-to-side rotation)
    this.controls.minAzimuthAngle = 0;
    this.controls.maxAzimuthAngle = 0;
    // Restrict polar angle to only allow a small tilt from the front
    this.controls.minPolarAngle = Math.PI / 6; // 30 degrees from horizontal
    this.controls.maxPolarAngle = Math.PI / 2; // 90 degrees (straight on)
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    // Stage
    const stageGeometry = new THREE.BoxGeometry(this.width, 0.12, this.depth);
    const stageMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x23263a,
      shininess: 60
    });
    this.stageMesh = new THREE.Mesh(stageGeometry, stageMaterial);
    this.stageMesh.position.set(0, -0.06, 0); // Centered at origin
    this.scene.add(this.stageMesh);

    // Custom grid lines
    const gridColor = 0x3b82f6; // Match the 2D stage blue color
    const gridMaterial = new THREE.LineBasicMaterial({ 
      color: gridColor,
      transparent: true,
      opacity: 0.95
    });

    // Create main vertical lines (8 sections)
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8 - 0.5) * this.width;
      const points = [];
      points.push(new THREE.Vector3(x, 0.01, -this.depth/2));
      points.push(new THREE.Vector3(x, 0.01, this.depth/2));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      this.scene.add(line);
    }

    // Create main horizontal lines (4 sections)
    for (let i = 0; i <= 4; i++) {
      const z = (i / 4 - 0.5) * this.depth;
      const points = [];
      points.push(new THREE.Vector3(-this.width/2, 0.01, z));
      points.push(new THREE.Vector3(this.width/2, 0.01, z));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      this.scene.add(line);
    }

    // Create subgrid lines if divisions > 0
    if (this.divisions > 0) {
      const subGridMaterial = new THREE.LineBasicMaterial({ 
        color: gridColor,
        transparent: true,
        opacity: 0.13 // Match the 2D subgrid opacity
      });

      // Subgrid verticals
      for (let i = 0; i < 8; i++) {
        const start = (i / 8 - 0.5) * this.width;
        const end = ((i + 1) / 8 - 0.5) * this.width;
        for (let d = 1; d <= this.divisions; d++) {
          const x = start + ((end - start) * d) / (this.divisions + 1);
          const points = [];
          points.push(new THREE.Vector3(x, 0.01, -this.depth/2));
          points.push(new THREE.Vector3(x, 0.01, this.depth/2));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, subGridMaterial);
          this.scene.add(line);
        }
      }

      // Subgrid horizontals
      for (let i = 0; i < 4; i++) {
        const start = (i / 4 - 0.5) * this.depth;
        const end = ((i + 1) / 4 - 0.5) * this.depth;
        for (let d = 1; d <= this.divisions; d++) {
          const z = start + ((end - start) * d) / (this.divisions + 1);
          const points = [];
          points.push(new THREE.Vector3(-this.width/2, 0.01, z));
          points.push(new THREE.Vector3(this.width/2, 0.01, z));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, subGridMaterial);
          this.scene.add(line);
        }
      }
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);
    // Performers
    this.update3DPerformers();
    this.animate();
    this.windowResizeListener = () => this.onWindowResize();
    window.addEventListener('resize', this.windowResizeListener);
    console.log('3D scene initialized');
  }

  private update3DPerformers() {
    if (!this.scene) return;
    // Remove old performer meshes if count changed
    const performerIds = this.performers.map(p => p.id);
    Object.keys(this.performerMeshes).forEach(id => {
      if (!performerIds.includes(id)) {
        this.scene?.remove(this.performerMeshes[id]);
        delete this.performerMeshes[id];
      }
    });
    // Create or update performer meshes
    this.performers.forEach(performer => {
      // Convert height from inches to feet for 3D
      const heightInFeet = performer.isDummy ? 5 : Math.max(3, Math.min((performer.height || 66) / 12, 8)); // Fixed 5ft for dummies, otherwise clamp between 3ft and 8ft
      const radius = 0.6;
      let mesh = this.performerMeshes[performer.id];
      if (!mesh) {
        // Create a group to hold the pill shape components
        const group = new THREE.Group();
        
        // Create the main cylinder (slightly shorter to account for the hemispheres)
        const cylinderHeight = heightInFeet - radius * 2;
        const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 32);
        const material = new THREE.MeshPhongMaterial({
          color: this.getPerformerColor(performer),
          transparent: true,
          opacity: 0.9,
          shininess: 60
        });
        const cylinder = new THREE.Mesh(cylinderGeometry, material);
        cylinder.position.y = 0; // Center the cylinder
        group.add(cylinder);

        // Create the top hemisphere
        const topHemisphereGeometry = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const topHemisphere = new THREE.Mesh(topHemisphereGeometry, material);
        topHemisphere.position.y = cylinderHeight / 2;
        group.add(topHemisphere);

        // Create the bottom hemisphere
        const bottomHemisphereGeometry = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        const bottomHemisphere = new THREE.Mesh(bottomHemisphereGeometry, material);
        bottomHemisphere.position.y = -cylinderHeight / 2;
        group.add(bottomHemisphere);

        // Add name label
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = 512; // Increased from 256
          canvas.height = 128; // Increased from 64
          context.fillStyle = '#fff';
          context.font = 'bold 90px Arial'; // Increased from 24px
          context.textAlign = 'center';
          context.fillText(performer.name, 256, 80); // Adjusted position for new canvas size
          const texture = new THREE.CanvasTexture(canvas);
          const labelMaterial = new THREE.SpriteMaterial({ map: texture });
          const label = new THREE.Sprite(labelMaterial);
          label.position.set(0, heightInFeet / 2 + 1.2, 0); // Increased height offset from 0.7 to 1.2
          label.scale.set(4, 1, 1); // Increased width scale from 2 to 4
          group.add(label);
        }

        this.scene?.add(group);
        this.performerMeshes[performer.id] = group;
        mesh = group;
      } else {
        // If height changed, update all geometries
        const group = mesh as THREE.Group;
        const cylinderHeight = heightInFeet - radius * 2;
        
        // Update cylinder
        const cylinder = group.children[0] as THREE.Mesh;
        cylinder.geometry.dispose();
        cylinder.geometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 32);
        cylinder.position.y = 0;

        // Update top hemisphere
        const topHemisphere = group.children[1] as THREE.Mesh;
        topHemisphere.geometry.dispose();
        topHemisphere.geometry = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        topHemisphere.position.y = cylinderHeight / 2;

        // Update bottom hemisphere
        const bottomHemisphere = group.children[2] as THREE.Mesh;
        bottomHemisphere.geometry.dispose();
        bottomHemisphere.geometry = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        bottomHemisphere.position.y = -cylinderHeight / 2;

        // Update label position
        const label = group.children[3] as THREE.Sprite;
        label.position.y = heightInFeet / 2 + 0.7;
      }
      // Center performers on the stage: x and z are offset from -width/2 and -depth/2
      mesh.position.set(
        (performer.x - this.width / 2),
        heightInFeet / 2,
        (performer.y - this.depth / 2)
      );
    });
  }

  private animate() {
    if (!this.scene || !this.camera || !this.threeRenderer || !this.controls) return;
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    
    // Update video texture if it exists
    if (this.videoMesh) {
      const material = this.videoMesh.material as THREE.MeshBasicMaterial;
      if (material.map) {
        material.map.needsUpdate = true;
      }
    }
    
    this.controls.update();
    this.threeRenderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    if (!this.threeContainer || !this.camera || !this.threeRenderer) return;

    const container = this.threeContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.threeRenderer.setSize(width, height);
  }

  addVideoBackdrop() {
    console.log('Starting addVideoBackdrop with URL:', this.youtubeUrl);
    if (!this.youtubeUrl || !this.scene) return;
    
    // Extract video ID from YouTube URL
    const videoId = this.youtubeUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
    console.log('Extracted video ID:', videoId);
    if (!videoId) {
      console.error('Invalid YouTube URL');
      return;
    }

    // Create video container if it doesn't exist
    if (!this.videoContainer) {
      console.log('Creating video container');
      this.videoContainer = document.createElement('div');
      this.videoContainer.style.position = 'absolute';
      this.videoContainer.style.top = '0';
      this.videoContainer.style.left = '0';
      this.videoContainer.style.width = '100%';
      this.videoContainer.style.height = '100%';
      this.videoContainer.style.pointerEvents = 'none';
      this.videoContainer.style.zIndex = '-1';
      document.body.appendChild(this.videoContainer);
    }

    // Create iframe if it doesn't exist
    if (!this.youtubeIframe) {
      console.log('Creating YouTube iframe');
      this.youtubeIframe = document.createElement('iframe');
      this.youtubeIframe.style.width = '100%';
      this.youtubeIframe.style.height = '100%';
      this.youtubeIframe.style.border = 'none';
      this.youtubeIframe.style.pointerEvents = 'none';
      this.videoContainer.appendChild(this.youtubeIframe);
    }

    // Set iframe source with proper parameters
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${videoId}&mute=1&enablejsapi=1`;
    console.log('Setting iframe source to:', embedUrl);
    this.youtubeIframe.src = embedUrl;

    // Create or update video plane in 3D scene
    if (!this.videoPlane) {
      console.log('Creating video plane in 3D scene');
      
      // Create a plane above the stage
      const videoGeometry = new THREE.PlaneGeometry(20, 12); // Width and height in feet
      const videoMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      
      this.videoPlane = new THREE.Mesh(videoGeometry, videoMaterial);
      this.videoPlane.position.set(0, 15, -10); // Position above and behind the stage
      this.videoPlane.rotation.x = -Math.PI / 6; // Tilt slightly downward
      this.scene.add(this.videoPlane);
      console.log('Video plane added to scene at position:', this.videoPlane.position);
    }

    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        console.log('YouTube API ready');
        this.youtubePlayer = new window.YT.Player(this.youtubeIframe, {
          videoId: videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            showinfo: 0,
            rel: 0,
            loop: 1,
            playlist: videoId,
            mute: 1
          },
          events: {
            onReady: (event: any) => {
              console.log('Player ready');
              event.target.playVideo();
            },
            onStateChange: (event: any) => {
              console.log('Player state changed:', event.data);
            }
          }
        });
      };
    } else {
      console.log('YouTube API already loaded');
      this.youtubePlayer = new window.YT.Player(this.youtubeIframe, {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          showinfo: 0,
          rel: 0,
          loop: 1,
          playlist: videoId,
          mute: 1
        },
        events: {
          onReady: (event: any) => {
            console.log('Player ready');
            event.target.playVideo();
          },
          onStateChange: (event: any) => {
            console.log('Player state changed:', event.data);
          }
        }
      });
    }
  }

  onSetDirectVideoUrl() {
    if (!this.directVideoUrl) return;
    this.clearYoutubeOverlay();
    
    // Clean up any existing video
    this.clearDirectVideoTexture();

    // Create and set up the video element
    this.videoElement = document.createElement('video');
    this.videoElement.src = this.directVideoUrl;
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.loop = false; // Don't loop the video
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);

    // Add ended event listener to only pause the video
    this.videoElement.addEventListener('ended', () => {
      if (this.videoElement) {
        this.videoElement.pause();
      }
    });

    // Wait for the video to be loaded before setting the texture
    this.videoElement.addEventListener('loadeddata', () => {
      if (!this.is3DView) this.toggle3DView();
      if (!this.scene) return;

      const videoTexture = new THREE.VideoTexture(this.videoElement!);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBFormat;

      // Make the video plane half the size
      const videoGeometry = new THREE.PlaneGeometry(20, 12);
      const videoMaterial = new THREE.MeshBasicMaterial({
        map: videoTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0
      });

      this.videoPlane = new THREE.Mesh(videoGeometry, videoMaterial);
      // Position the video plane lower and closer
      this.videoPlane.position.set(0, 10, -15); // Lower height and closer to stage
      this.videoPlane.rotation.x = -Math.PI / 18; // 10 degrees tilt (π/18 radians)
      this.scene.add(this.videoPlane);
    });

    this.videoElement.load();
  }

  clearDirectVideoTexture() {
    if (this.videoPlane && this.scene) {
      this.scene.remove(this.videoPlane);
      this.videoPlane = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
    if (this.directVideoObjectUrl) {
      URL.revokeObjectURL(this.directVideoObjectUrl);
      this.directVideoObjectUrl = null;
    }
    this.directVideoUrl = '';
  }

  onSetYoutubeUrl() {
    if (!this.youtubeUrl) return;
    this.clearDirectVideoTexture();
    this.setYoutubeOverlay(this.youtubeUrl);
  }

  setYoutubeOverlay(url: string) {
    this.showYoutubeOverlay = false;
    const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
    if (!videoId) {
      alert('Invalid YouTube URL');
      return;
    }
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${videoId}&mute=1&enablejsapi=1`;
    this.sanitizedYoutubeEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.showYoutubeOverlay = true;
    if (!this.is3DView) this.toggle3DView();
  }

  clearYoutubeOverlay() {
    this.showYoutubeOverlay = false;
    this.sanitizedYoutubeEmbedUrl = null;
    this.youtubeUrl = '';
  }

  clearVideoBackdrop() {
    this.clearDirectVideoTexture();
    this.directVideoUrl = '';
  }

  onDirectVideoFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Clean up any existing video
    this.clearDirectVideoTexture();

    // Create a new blob URL for the selected file
    this.directVideoObjectUrl = URL.createObjectURL(file);
    this.directVideoUrl = this.directVideoObjectUrl;
    
    // Create and set up the video element
    this.videoElement = document.createElement('video');
    this.videoElement.src = this.directVideoObjectUrl;
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.loop = false; // Don't loop the video
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);

    // Add ended event listener to only pause the video
    this.videoElement.addEventListener('ended', () => {
      if (this.videoElement) {
        this.videoElement.pause();
      }
    });

    // Wait for the video to be loaded before setting the texture
    this.videoElement.addEventListener('loadeddata', () => {
      if (!this.is3DView) this.toggle3DView();
      if (!this.scene) return;

      const videoTexture = new THREE.VideoTexture(this.videoElement!);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBFormat;

      // Make the video plane half the size
      const videoGeometry = new THREE.PlaneGeometry(20, 12);
      const videoMaterial = new THREE.MeshBasicMaterial({
        map: videoTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0
      });

      this.videoPlane = new THREE.Mesh(videoGeometry, videoMaterial);
      // Position the video plane lower and closer
      this.videoPlane.position.set(0, 10, -15); // Lower height and closer to stage
      this.videoPlane.rotation.x = -Math.PI / 18; // 10 degrees tilt (π/18 radians)
      this.scene.add(this.videoPlane);

      // If we're already playing, sync the video with current playback time
      if (this.isPlaying && this.videoElement) {
        const videoElement = this.videoElement;
        if (this.playbackTime <= videoElement.duration) {
          videoElement.currentTime = this.playbackTime;
          videoElement.play();
        } else {
          videoElement.currentTime = videoElement.duration;
          videoElement.pause();
        }
      }
    });

    this.videoElement.load();
  }

  get sortedPerformers() {
    return [...this.performers].sort((a, b) => a.name.localeCompare(b.name));
  }

  get sortedTeamRoster() {
    return [...this.teamRoster].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Add getter for available users
  get availableUsers() {
    // Get all users from team roster who are not currently in the segment
    const currentUserIds = new Set(this.performers
      .filter(p => !p.isDummy)
      .map(p => p.id));
    return this.teamRoster.filter(user => !currentUserIds.has(user._id));
  }

  // Helper methods for height conversion
  getHeightInFeetAndInches(heightInInches: number | undefined): { feet: number, inches: number } {
    if (!heightInInches) return { feet: 5, inches: 6 }; // Default 5'6"
    return {
      feet: Math.floor(heightInInches / 12),
      inches: Math.round(heightInInches % 12)
    };
  }

  getHeightInInches(feet: number, inches: number): number {
    return feet * 12 + inches;
  }

  private on3DViewClick(event: MouseEvent) {
    if (!this.scene || !this.camera) return;

    // Calculate mouse position in normalized device coordinates
    const rect = this.threeRenderer?.domElement.getBoundingClientRect();
    if (!rect) return;

    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Create raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

    // Check for intersections with performer meshes
    const intersects = raycaster.intersectObjects(
      Object.values(this.performerMeshes).map(mesh => mesh.children[0]), // Use the cylinder mesh for intersection
      true
    );

    if (intersects.length > 0) {
      // Find the performer ID from the intersected mesh
      const performerId = Object.entries(this.performerMeshes).find(([_, mesh]) => 
        mesh.children.includes(intersects[0].object)
      )?.[0];

      if (performerId) {
        const performer = this.performers.find(p => p.id === performerId);
        if (performer) {
          this.selectPerformer(performer);
          this.setSidePanelMode('performer');
        }
      }
    }
  }

  private setupZoomGestures() {
    const stageArea = this.stageRef.nativeElement;
    if (!stageArea) return;

    // Mouse wheel zoom
    stageArea.addEventListener('wheel', (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - this.lastZoomTime < this.zoomDebounceTime) return;
      this.lastZoomTime = now;

      const delta = event.deltaY > 0 ? -this.zoomStep : this.zoomStep;
      this.zoomAtPoint(event.clientX, event.clientY, delta);
    }, { passive: false });

    // Touch pinch zoom
    stageArea.addEventListener('touchstart', (event: TouchEvent) => {
      if (event.touches.length === 2) {
        this.touchStartDistance = this.getTouchDistance(event.touches);
        this.touchStartX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        this.touchStartY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        this.isPinching = true;
      }
    }, { passive: false });

    stageArea.addEventListener('touchmove', (event: TouchEvent) => {
      if (!this.isPinching || event.touches.length !== 2) return;
      event.preventDefault();

      const currentDistance = this.getTouchDistance(event.touches);
      const currentX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const currentY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

      const zoomDelta = (currentDistance - this.touchStartDistance) * 0.01;
      this.zoomAtPoint(currentX, currentY, zoomDelta);

      this.touchStartDistance = currentDistance;
      this.touchStartX = currentX;
      this.touchStartY = currentY;
    }, { passive: false });

    stageArea.addEventListener('touchend', () => {
      this.isPinching = false;
    }, { passive: false });
  }

  private getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private zoomAtPoint(clientX: number, clientY: number, delta: number) {
    const stageArea = this.stageRef.nativeElement;
    if (!stageArea) return;

    // Calculate new zoom level
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoom + delta));
    if (newZoom === this.currentZoom) return;

    // Update zoom
    this.currentZoom = newZoom;

    // Reset translation to keep stage centered
    this.currentTranslateX = 0;
    this.currentTranslateY = 0;

    this.updateStageTransform();
  }

  // Add these methods before ngOnDestroy
  onFormationDragStart(event: MouseEvent, index: number) {
    if (!this.isCaptain) return;
    event.preventDefault();
    event.stopPropagation();
    
    this.draggingFormationIndex = index;
    this.dragFormationStartX = event.clientX;
    this.dragFormationStartIndex = index;
    this.dragFormationOverIndex = index;

    // Add event listeners for drag and end
    document.addEventListener('mousemove', this.onFormationDragMove);
    document.addEventListener('mouseup', this.onFormationDragEnd);
  }

  onFormationDragMove = (event: MouseEvent) => {
    if (this.draggingFormationIndex === null) return;

    const timelineBar = this.timelineBarRef.nativeElement;
    const rect = timelineBar.getBoundingClientRect();
    const x = event.clientX - rect.left;

    // Find which formation we're hovering over
    let currentX = 0;
    for (let i = 0; i < this.formations.length; i++) {
      const formationWidth = this.getFormationPixelWidth(i);
      const transitionWidth = i < this.formations.length - 1 ? this.getTransitionPixelWidth(i) : 0;
      
      if (x >= currentX && x < currentX + formationWidth) {
        this.dragFormationOverIndex = i;
        break;
      }
      currentX += formationWidth + transitionWidth;
    }
  }

  onFormationDragEnd = () => {
    if (this.draggingFormationIndex === null) return;

    // Reorder formations if we dragged to a new position
    if (this.dragFormationOverIndex !== null && 
        this.dragFormationOverIndex !== this.draggingFormationIndex) {
      const formation = this.formations[this.draggingFormationIndex];
      const duration = this.formationDurations[this.draggingFormationIndex];
      const animationDuration = this.animationDurations[this.draggingFormationIndex];

      // Remove from old position
      this.formations.splice(this.draggingFormationIndex, 1);
      this.formationDurations.splice(this.draggingFormationIndex, 1);
      if (this.animationDurations.length > 0) {
        this.animationDurations.splice(this.draggingFormationIndex, 1);
      }

      // Insert at new position
      this.formations.splice(this.dragFormationOverIndex, 0, formation);
      this.formationDurations.splice(this.dragFormationOverIndex, 0, duration);
      if (this.animationDurations.length > 0) {
        this.animationDurations.splice(this.dragFormationOverIndex, 0, animationDuration);
      }

      // Update current formation index if needed
      if (this.currentFormationIndex === this.draggingFormationIndex) {
        this.currentFormationIndex = this.dragFormationOverIndex;
      } else if (this.currentFormationIndex > this.draggingFormationIndex && 
                 this.currentFormationIndex <= this.dragFormationOverIndex) {
        this.currentFormationIndex--;
      } else if (this.currentFormationIndex < this.draggingFormationIndex && 
                 this.currentFormationIndex >= this.dragFormationOverIndex) {
        this.currentFormationIndex++;
      }

      // Update playing formation index if needed
      if (this.playingFormationIndex === this.draggingFormationIndex) {
        this.playingFormationIndex = this.dragFormationOverIndex;
      } else if (this.playingFormationIndex > this.draggingFormationIndex && 
                 this.playingFormationIndex <= this.dragFormationOverIndex) {
        this.playingFormationIndex--;
      } else if (this.playingFormationIndex < this.draggingFormationIndex && 
                 this.playingFormationIndex >= this.dragFormationOverIndex) {
        this.playingFormationIndex++;
      }

      // Save changes
      if (this.segment?._id) {
        this.saveSegment();
      } else {
        this.triggerAutoSave();
      }
    }

    // Reset drag state
    this.draggingFormationIndex = null;
    this.dragFormationStartX = 0;
    this.dragFormationStartIndex = 0;
    this.dragFormationOverIndex = null;

    // Remove event listeners
    document.removeEventListener('mousemove', this.onFormationDragMove);
    document.removeEventListener('mouseup', this.onFormationDragEnd);
  }

  // Add this method to get formation drag style
  getFormationDragStyle(index: number): any {
    if (this.draggingFormationIndex === index) {
      return {
        opacity: '0.5',
        cursor: 'grabbing'
      };
    }
    if (this.dragFormationOverIndex !== null && this.draggingFormationIndex !== null) {
      if (this.dragFormationOverIndex === index) {
        return {
          borderLeft: this.dragFormationOverIndex > this.draggingFormationIndex ? '2px solid #3b82f6' : 'none',
          borderRight: this.dragFormationOverIndex < this.draggingFormationIndex ? '2px solid #3b82f6' : 'none'
        };
      }
    }
    return {};
  }

  // Add method to handle timeline zoom changes
  onTimelineZoomChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const newZoom = parseFloat(input.value);
    console.log('Timeline zoom changing to:', newZoom);
    
    // Update the zoom value
    this.timelineZoom = newZoom;
    
    // Force recalculation of timeline widths
    this.formationDurations = [...this.formationDurations];
    this.animationDurations = [...this.animationDurations];
    
    // Force change detection
    this.cdr.detectChanges();
  }

  // Add method to get zoom percentage for display
  getTimelineZoomPercentage(): number {
    return Math.round(this.timelineZoom * 100);
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  navigateToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  onSliderPointerDown(event: PointerEvent) {
    const slider = event.target as HTMLElement;
    this.isDraggingSlider = true;
    this.sliderRect = slider.getBoundingClientRect();
    slider.setPointerCapture(event.pointerId);
    this.updateSliderValue(event);
  }

  onSliderPointerUp(event: PointerEvent) {
    this.isDraggingSlider = false;
    this.sliderRect = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  onSliderPointerMove(event: PointerEvent) {
    if (!this.isDraggingSlider || !this.sliderRect) return;
    this.updateSliderValue(event);
  }

  private updateSliderValue(event: PointerEvent) {
    if (!this.sliderRect) return;
    
    // Calculate relative position (0 to 1)
    const rect = this.sliderRect;
    const relativeY = (event.clientY - rect.top) / rect.height;
    
    // Invert the value since the slider is rotated 180 degrees
    const normalizedY = 1 - relativeY;
    
    // Convert to slider range (-300 to 100)
    const newValue = Math.round(-300 + normalizedY * 400);
    
    // Clamp the value
    this.stageVerticalOffset = Math.max(-300, Math.min(100, newValue));
    
    console.log('Updating slider:', {
      clientY: event.clientY,
      rectTop: rect.top,
      relativeY,
      normalizedY,
      newValue,
      finalValue: this.stageVerticalOffset
    });

    requestAnimationFrame(() => {
      const stageArea = this.stageRef?.nativeElement;
      if (!stageArea) return;
      const transform = `scale(${this.currentZoom || 1}) translate(0, ${this.stageVerticalOffset}px)`;
      stageArea.style.transform = transform;
      stageArea.style.transformOrigin = 'center center';
    });
  }

  // Update the existing getStageTransform method
  getStageTransform(): string {
    const scale = this.currentZoom || 1;
    const translateY = this.stageVerticalOffset || 0;
    return `scale(${scale}) translate(0, ${translateY}px)`;
  }

  // Add logic to delete all dummies when deleting a segment
  deleteSegment() {
    if (!this.segment?._id) return;
    // Delete all dummy users in the segment roster
    const dummyIds = (this.segmentRoster || []).filter(m => m.isDummy && m._id).map(m => m._id);
    dummyIds.forEach(id => {
      this.teamService.deleteDummyUser(id).subscribe({
        next: () => console.log('Dummy user deleted from backend'),
        error: (err) => console.error('Failed to delete dummy user from backend', err)
      });
    });
    // Now delete the segment (assume you have a segmentService.deleteSegment method)
    this.segmentService.deleteSegment(this.segment._id).subscribe({
      next: () => {
        console.log('Segment deleted');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.error('Failed to delete segment', err);
      }
    });
  }

  initializeMobileAudioContextOnLoad() {
    if (!this.isMobile) return;
    
    // Add a one-time click handler to the document to initialize audio context
    const initAudioOnInteraction = () => {
      console.log('Mobile audio context initialization triggered by user interaction');
      this.initializeMobileAudioContext();
      document.removeEventListener('click', initAudioOnInteraction);
      document.removeEventListener('touchstart', initAudioOnInteraction);
    };
    
    document.addEventListener('click', initAudioOnInteraction);
    document.addEventListener('touchstart', initAudioOnInteraction);
    
    // Also try to initialize on window focus (for when user returns to tab)
    const initAudioOnFocus = () => {
      console.log('Mobile audio context initialization triggered by window focus');
      this.initializeMobileAudioContext();
    };
    
    window.addEventListener('focus', initAudioOnFocus);
  }

  handleMobileAudioReady() {
    console.log('Mobile audio context ready');
    // Ensure audio context is resumed on mobile
    if (this.waveSurfer && (this.waveSurfer as any).backend && (this.waveSurfer as any).backend.audioContext) {
      const audioContext = (this.waveSurfer as any).backend.audioContext;
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          console.log('Mobile audio context resumed successfully on ready');
        }).catch((error: any) => {
          console.error('Failed to resume mobile audio context on ready:', error);
        });
      }
    }
  }

  // Get the effective color for a performer (custom color takes precedence over skill color)
  getPerformerColor(performer: Performer): string {
    console.log('🎨 DEBUG getPerformerColor called for performer:', performer.name, performer.id);
    console.log('🎨 DEBUG getPerformerColor: performer.customColor:', performer.customColor);
    
    // Custom color takes precedence over skill-based color
    if (performer.customColor) {
      console.log('🎨 DEBUG getPerformerColor: Using custom color:', performer.customColor);
      return performer.customColor;
    }
    
    console.log('🎨 DEBUG getPerformerColor: No custom color, calling getSkillColor');
    // Fall back to skill-based color or default
    const skillColor = this.getSkillColor(performer);
    console.log('🎨 DEBUG getPerformerColor: getSkillColor returned:', skillColor);
    return skillColor;
  }

  // Update custom color for a performer
  updatePerformerColor(performerId: string, color: string) {
    // Update in all formations to maintain consistency
    this.formations = this.formations.map(formation =>
      formation.map(performer => {
        if (performer.id === performerId) {
          return { ...performer, customColor: color };
        }
        return performer;
      })
    );
    
    this.triggerAutoSave();
  }

  // Remove custom color for a performer (revert to default)
  removePerformerColor(performerId: string) {
    // Remove custom color from all formations
    this.formations = this.formations.map(formation =>
      formation.map(performer => {
        if (performer.id === performerId) {
          const { customColor, ...performerWithoutColor } = performer;
          return performerWithoutColor;
        }
        return performer;
      })
    );
    
    this.triggerAutoSave();
  }

  // Handle color change event from the color picker
  onColorChange(event: Event, performerId: string) {
    const target = event.target as HTMLInputElement;
    const color = target.value;
    this.updatePerformerColor(performerId, color);
  }

  isSelectedColor(performer: Performer, color: string): boolean {
    return performer.customColor === color || (!performer.customColor && color === '#00b4d8');
  }

  /**
   * Find an available position for a new performer on the stage grid
   * Returns a position that doesn't overlap with existing performers
   */
  private findAvailablePosition(): { x: number, y: number } {
    // Get all grid positions
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

    // Define minimum distance between performers (in feet)
    const minDistance = 2; // 2 feet minimum between performers
    const centerX = this.width / 2;
    const centerY = this.depth / 2;

    // Create all grid positions and sort them by distance from center
    const allGridPositions: { x: number, y: number, distance: number }[] = [];
    for (const x of gridPositionsX) {
      for (const y of gridPositionsY) {
        const distance = Math.sqrt(
          Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
        );
        allGridPositions.push({ x, y, distance });
      }
    }
    
    // Sort by distance from center (closest first)
    allGridPositions.sort((a, b) => a.distance - b.distance);

    // Try each grid position, starting from the center
    for (const position of allGridPositions) {
      // Check if this position is far enough from all existing performers
      const isAvailable = this.performers.every(performer => {
        const distance = Math.sqrt(
          Math.pow(performer.x - position.x, 2) + Math.pow(performer.y - position.y, 2)
        );
        return distance >= minDistance;
      });

      if (isAvailable) {
        return { x: position.x, y: position.y };
      }
    }

    // If no grid position is available, try positions with some offset from center
    // Try positions in a more central spiral pattern around the center
    const offsets = [
      { x: 0, y: 0 },           // Center
      { x: 1.5, y: 0 },         // Right
      { x: -1.5, y: 0 },        // Left
      { x: 0, y: 1.5 },         // Down
      { x: 0, y: -1.5 },        // Up
      { x: 1.5, y: 1.5 },       // Bottom-right
      { x: -1.5, y: 1.5 },      // Bottom-left
      { x: 1.5, y: -1.5 },      // Top-right
      { x: -1.5, y: -1.5 },     // Top-left
      { x: 3, y: 0 },           // Further right
      { x: -3, y: 0 },          // Further left
      { x: 0, y: 3 },           // Further down
      { x: 0, y: -3 },          // Further up
      { x: 2, y: 2 },           // Diagonal
      { x: -2, y: 2 },          // Diagonal
      { x: 2, y: -2 },          // Diagonal
      { x: -2, y: -2 },         // Diagonal
    ];

    for (const offset of offsets) {
      const x = centerX + offset.x;
      const y = centerY + offset.y;
      
      // Check if position is within stage boundaries
      if (x >= 0 && x <= this.width && y >= 0 && y <= this.depth) {
        // Check if this position is far enough from all existing performers
        const isAvailable = this.performers.every(performer => {
          const distance = Math.sqrt(
            Math.pow(performer.x - x, 2) + Math.pow(performer.y - y, 2)
          );
          return distance >= minDistance;
        });

        if (isAvailable) {
          return { x, y };
        }
      }
    }

    // If all else fails, return a random position near the center (smaller range)
    return {
      x: centerX + (Math.random() - 0.5) * 3, // Random position within 1.5 feet of center
      y: centerY + (Math.random() - 0.5) * 3
    };
  }

  // Helper method to check if multi-selection should be enabled
  private isMultiSelectionEnabled(): boolean {
    return this.isShiftPressed || this.isCommandPressed;
  }

  // Reset key states when window loses focus
  private resetKeyStates() {
    this.isShiftPressed = false;
    this.isCommandPressed = false;
  }

  // Add cache clearing methods
  private clearSelectedUserCache() {
    this._selectedUserCache = null;
    this._selectedUserSkillLevelsCache = {};
  }

  private clearSegmentStylesCache() {
    this._segmentStylesCache = [];
  }

  private clearAllCaches() {
    this.clearSelectedUserCache();
    this.clearSegmentStylesCache();
  }
}
 
