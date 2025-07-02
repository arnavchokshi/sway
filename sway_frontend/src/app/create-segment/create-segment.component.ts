import { Component, OnInit, ElementRef, ViewChild, Renderer2, AfterViewChecked, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TeamService } from '../services/team.service';
import { AuthService } from '../services/auth.service';
import { SegmentService, FormationDraft } from '../services/segment.service';
import { PerformerConsistencyService, ConsistencyWarning, FormationTip } from '../services/performer-consistency.service';
import { MembershipService, MembershipStatus } from '../services/membership.service';
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

interface SegmentState {
  formations: Performer[][];
  formationDurations: number[];
  animationDurations: number[];
  currentFormationIndex: number;
  timestamp: number;
  action: string; // Description of the action that led to this state
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

import { ControlBarComponent } from './control-bar/control-bar.component';

@Component({
  selector: 'app-create-segment',
  templateUrl: './create-segment.component.html',
  styleUrls: ['./create-segment.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ControlBarComponent],
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
  @ViewChild('audioFileInput') audioFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('backdropFileInput') backdropFileInput!: ElementRef<HTMLInputElement>;

  isCaptain = false;
  currentUserId: string = '';
  membershipStatus: MembershipStatus | null = null;
  isProAccount = false;
  showProPopup = false;
  spotlightRadius = 80; // pixels
  spotlightOpacity = 0.35; // 35% opacity for the dark overlay
  roster: any[] = [];
  segment: any = null;
  segmentName: string = 'New Segment';
  depth = 24; // feet
  width = 32; // feet
  offstageWidth = 8; // feet - width of offstage areas on each side
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
  
  // Offstage properties
  totalStageWidthPx = 960; // Includes offstage areas (32 + 8 + 8) * 20
  offstageWidthPx = 160; // 8 feet * 20 pixels per foot

  // Multi-formation support
  formations: Performer[][] = [];
  currentFormationIndex = 0;

  // Formation drafts support (single draft per formation)
  formationDrafts: { [formationIndex: number]: FormationDraft } = {};
  isViewingDraft: boolean = false; // Are we currently viewing a draft formation?
  
  // Track which formation data is currently in the main position (for coloring)
  // true = draft data is in main position, false = original data is in main position  
  isDraftDataInMainPosition: { [formationIndex: number]: boolean } = {};

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
  editIsPublic: boolean = true; // Add this property for the modal

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
  
  // Track if we're currently resizing any timeline element
  private isResizingTimelineElement: boolean = false;

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
  isSaving: boolean = false;
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

  // Add new property to track all selected performers for previous position display
  selectedPerformersForPreviousPosition: Set<string> = new Set();

  // Add new property to track initial positions of all selected performers
  private selectedPerformersInitialPositions: { [id: string]: { x: number, y: number } } = {};

  // Add these properties at the top of the class with other properties
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private readonly DRAG_THRESHOLD = 5; // pixels
  private lastClickTime = 0; // Track last click time for debouncing
  private readonly CLICK_DEBOUNCE_MS = 300; // Minimum 300ms between clicks
  private justDragged = false; // Track if we just finished dragging

  // Rectangular selection properties
  private isSelecting = false;
  private selectionStartX = 0;
  private selectionStartY = 0;
  private selectionEndX = 0;
  private selectionEndY = 0;
  private readonly SELECTION_THRESHOLD = 3; // pixels - minimum distance to start selection
  private stageMouseMoveListener: (() => void) | null = null;
  private stageMouseUpListener: (() => void) | null = null;
  private multiSelectionEnabledByRectangle = false; // Track if multi-selection was enabled by rectangle
  private justFinishedSelection = false; // Track if we just finished a rectangular selection

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
  
  // Add touch gesture throttling properties
  private lastTouchEventTime = 0;
  private touchEventThrottle = 16; // ~60fps (16ms between events)
  private touchTransformPending = false;
  private isIntensiveTouchGesture = false;

  // 3D View Properties
  is3DView = false;
  isStageFlipped = false;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private performerMeshes: { [id: string]: THREE.Group } = {};
  private stageMesh: THREE.Mesh | null = null;
  private curtainMeshes: THREE.Mesh[] = []; // Track curtain meshes for cleanup
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
  uploadError: string | null = null;
  uploadSuccess: string | null = null;

  // Zoom properties
  private currentZoom = 1;
  private minZoom = 0.5;
  private maxZoom = 2;
  private zoomStep = 0.1;
  private lastZoomTime = 0;
  private zoomDebounceTime = 50; // ms

  // Add timeline zoom properties
  timelineZoom = 1;
  minTimelineZoom = 0.5;
  maxTimelineZoom = 4.5;  // Increased from 1.5 to 3 for more zoom-in
  timelineZoomStep = 0.02;

  // Dynamic timeline width calculation
  private timelineContainerWidth = 0;
  private audioDuration = 0;

  // Add these properties after other drag-related properties
  draggingFormationIndex: number | null = null;
  dragFormationStartX: number = 0;
  dragFormationStartIndex: number = 0;
  dragFormationOverIndex: number | null = null;

  // Add cursor drag properties
  isDraggingCursor = false;
  cursorDragStartX = 0;
  cursorDragStartTime = 0;

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

  // Add these properties for copy/paste functionality
  copiedPerformers: { id: string; name: string; x: number; y: number; skillLevels: any; height?: number; isDummy?: boolean; customColor?: string }[] = [];
  hasCopiedPerformers = false;

  // Add property for new performer name input
  newPerformerName: string = '';

  // Formation context menu properties
  showFormationContextMenu = false;
  selectedFormationIndex = -1;
  contextMenuPosition = { x: 0, y: 0 };

  // Selection rectangle properties for multiple performers
  selectionRectangle: { left: number; top: number; width: number; height: number } | null = null;

  // Rotation properties
  private isRotating = false;
  private rotationSliderStartX = 0;
  private rotationSliderStartValue = 0;
  public currentRotationDegrees = 0;
  private rotationCenter = { x: 0, y: 0 };
  private selectedPerformersInitialRotationPositions: { [id: string]: { x: number, y: number } } = {};

  // Add property to track if we're currently adding a dummy performer
  private isAddingDummyPerformer = false;

  // Undo/Redo functionality
  canUndo = false;
  canRedo = false;
  private undoStack: SegmentState[] = [];
  private redoStack: SegmentState[] = [];
  private maxUndoSteps = 50; // Limit undo history to prevent memory issues

  // New properties for top panel features
  showStageToolsDropdown = false;
  showTransitions = true;
  allSegments: any[] = [];
  currentSegmentIndex = -1;

  // Mirror mode functionality
  isMirrorModeEnabled = false;

  // Animation state tracking
  hasPlayedInitialAnimation = false;

  // Pan sensitivity (multiplier on wheel delta). Increase to pan faster, decrease for slower.
  panSensitivityX = 1;
  panSensitivityY = 1;

  // Throttle live updating of formation tips while dragging performers
  private lastTipUpdateTime = 0;
  private readonly TIP_UPDATE_THROTTLE_MS = 300;

  isHoveringSeekBar = false;

  editablePerformerName: string = '';

  onSeekBarMouseEnter() {
    this.isHoveringSeekBar = true;
  }

  onSeekBarMouseLeave() {
    this.isHoveringSeekBar = false;
    this.hoveredTimelineX = null;
    this.hoveredTimelineTime = null;
  }

  public isIphone: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private teamService: TeamService,
    private authService: AuthService,
    private segmentService: SegmentService,
    private performerConsistencyService: PerformerConsistencyService,
    private membershipService: MembershipService,
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
    // During playback or animation, ALWAYS use main formations (never drafts)
    if (this.isPlaying || this.inTransition) {
      const mainPerformers = this.formations[this.playingFormationIndex] || [];
      
      if (this.inTransition && Object.keys(this.animatedPositions).length > 0) {
        // Return animated positions during transition
        return mainPerformers.map(p => ({
          ...p,
          ...this.animatedPositions[p.id]
        }));
      }
      return mainPerformers;
    }
    
    // When not playing, get performers from current view (main or draft)
    if (this.isViewingDraft && this.formationDrafts[this.currentFormationIndex]) {
      // Return the draft formation data
      return this.formationDrafts[this.currentFormationIndex].formation;
    } else {
      // Return the main formation data
      return this.formations[this.currentFormationIndex] || [];
    }
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
    if (this.isViewingDraft && this.formationDrafts[this.currentFormationIndex]) {
      // Update draft formation
      this.formationDrafts[this.currentFormationIndex].formation = val;
      // Force change detection by creating new reference
      this.formationDrafts = { ...this.formationDrafts };
    } else {
      // Update main formation
      this.formations[this.currentFormationIndex] = val;
    }
  }

  ngOnInit() {
    this.isIphone = /iPhone/.test(navigator.userAgent);
    // Detect iPhone or small mobile
    this.isMobile = /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
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
    
    const currentUser = this.authService.getCurrentUser();
    this.isCaptain = currentUser?.captain || false;
    this.currentUserId = currentUser?._id || '';
    
    // Always load team roster first, regardless of whether it's a new or existing segment
    if (currentUser?.team?._id) {
      this.loadTeamRosterAndMapFormations(currentUser.team._id);
      this.loadAllSegments();
      
      // Load membership status to check if user has pro account
      this.loadMembershipStatus(currentUser.team._id);
    }
    
    // Subscribe to route parameter changes to handle segment navigation
    this.route.queryParamMap.subscribe(params => {
      const segmentId = params.get('id');
      const viewAsMemeber = params.get('viewAsMemeber');
      
      // Override captain status if viewing as member
      if (viewAsMemeber === 'true') {
        this.isCaptain = false;
      }
      
      if (segmentId) {
        this.loadSegmentData(segmentId);
      } else {
        // Only set defaults if creating a new segment
        this.resetToNewSegment();
      }
    });

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
    
    // Add click listener to close dropdowns when clicking outside
    document.addEventListener('click', this.handleDocumentClick.bind(this));

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

  // Load membership status to check if user has pro account
  private loadMembershipStatus(teamId: string) {
    this.membershipService.getMembershipStatus(teamId).subscribe({
      next: (status: MembershipStatus) => {
        this.membershipStatus = status;
        this.isProAccount = status.membershipType === 'pro' && status.isActive;
      },
      error: (err) => {
        console.error('Failed to load membership status:', err);
        this.isProAccount = false;
      }
    });
  }

  // New method to load team roster and map formations with fresh user data
  private loadTeamRosterAndMapFormations(teamId: string) {
    this.teamService.getTeamById(teamId).subscribe({
      next: async (res) => {
        this.teamRoster = res.team.members || [];
        
        // For new segments, just set up the basic roster and segment roster
        if (!this.segment) {
          this.segmentRoster = [...this.teamRoster];
          // Clear caches for new segments
          this.clearAllCaches();
          return;
        }
        
        // --- Handle dummy templates from segment ---
        const dummyTemplates = this.segment?.dummyTemplates || [];
        const dummyTemplateMap = new Map<string, any>();
        dummyTemplates.forEach((template: any) => {
          dummyTemplateMap.set(template.id, template);
        });

        // Update dummy counter based on existing dummy templates
        let maxDummyNum = 0;
        dummyTemplates.forEach((template: any) => {
          const name = template.name || '';
          const match = name.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= maxDummyNum) {
              maxDummyNum = num;
            }
          }
        });
        this.dummyCounter = maxDummyNum + 1;

        // --- Fetch missing users for segmentRoster (only real users, not dummies) ---
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
          // Pass 2: Map formations using dummy templates and real users
          if (this.segment.formations && this.segment.formations.length > 0) {
            this.formations = this.segment.formations.map((formation: any[]) => 
              formation.map((p: any) => {
                // Check if this is a dummy performer by looking for dummyTemplateId
                if (p.dummyTemplateId) {
                  const dummyTemplate = dummyTemplateMap.get(p.dummyTemplateId);
                  if (dummyTemplate) {
                    return {
                      id: dummyTemplate.id,
                      name: dummyTemplate.name,
                      x: p.x,
                      y: p.y,
                      skillLevels: dummyTemplate.skillLevels || {},
                      height: dummyTemplate.height || 5.5,
                      isDummy: true,
                      dummyName: dummyTemplate.name,
                      customColor: p.customColor || dummyTemplate.customColor
                    };
                  } else {
                    // Fallback if template not found
                    return {
                      id: p.dummyTemplateId,
                      name: `${p.dummyTemplateId.split('-')[1] || 'Unknown'}`,
                      x: p.x,
                      y: p.y,
                      skillLevels: {},
                      height: p.height || 5.5,
                      isDummy: true,
                      dummyName: `${p.dummyTemplateId.split('-')[1] || 'Unknown'}`,
                      customColor: p.customColor
                    };
                  }
                } else if (p.user) {
                  // Handle real performers
                  const performerId = p.user;
                  console.log('🔍 DEBUG Mapping performer:', { 
                    original: p, 
                    performerId, 
                    hasUser: !!p.user
                  });
                  
                  const user = this.teamRoster.find(m => String(m._id) === String(performerId)) || 
                              this.segmentRoster.find(m => String(m._id) === String(performerId));

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

                    return mappedPerformer;
                  } else {
                    // Fallback if user not found in roster
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
                } else {
                  // Fallback for any other case (shouldn't happen with proper data)
                  return {
                    id: p.id || `unknown-${Date.now()}`,
                    name: p.name || 'Unknown',
                    x: p.x,
                    y: p.y,
                    skillLevels: {},
                    height: p.height || 66,
                    isDummy: false,
                    customColor: p.customColor
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

          // Load formation drafts if they exist
          if (this.segment.formationDrafts) {
            this.formationDrafts = this.segment.formationDrafts;
            
          } else {
            this.formationDrafts = {};
          }
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
      
      // Check if refresh is disabled (fallback mechanism)
      if (this.refreshDisabled) {
        resolve(); // Resolve immediately if refresh is disabled
        return;
      }
      
      const now = Date.now();
      
      // Throttle refreshes to prevent overwhelming the system
      if (now - this.lastRefreshTime < this.REFRESH_THROTTLE_MS) {
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
        this.currentRefreshRequest.unsubscribe();
        this.currentRefreshRequest = null;
      }

      // Prevent multiple simultaneous calls
      if (this.isRefreshingData) {
        resolve(); // Resolve immediately if already refreshing
        return;
      }

      const currentUser = this.authService.getCurrentUser();
      
      if (currentUser?.team?._id) {
        this.isRefreshingData = true;
        this.lastRefreshTime = now;
        
        
        // Add a timeout to prevent hanging
        const requestTimeout = setTimeout(() => {
          this.isRefreshingData = false;
          this.currentRefreshRequest = null;
          // Disable refresh temporarily if it times out
          this.refreshDisabled = true;
          setTimeout(() => {
            this.refreshDisabled = false; // Re-enable after 30 seconds
          }, 30000);
          resolve(); // Resolve anyway to prevent hanging
        }, 10000); // 10 second timeout
        
        // Add a small delay to throttle rapid requests
        this.refreshTimeout = setTimeout(() => {

          
          // Quick refresh of team roster to ensure we have latest data
          this.currentRefreshRequest = this.teamService.getTeamById(currentUser.team._id).subscribe({
            next: (res) => {
          
              clearTimeout(requestTimeout); // Clear the timeout since we got a response
              try {
                this.teamRoster = res.team.members || [];


                this.formations = this.formations.map(formation =>
                  formation.map(performer => {
                    if (performer.isDummy) {
                      return performer; // Keep dummy performers as is
                    }
                    
                    const user = this.teamRoster.find(m => m._id === performer.id);
                    if (user && user.skillLevels) {
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

                
                // Clear caches after updating formations
                this.clearAllCaches();
                

                resolve(); // Resolve the promise successfully
              } catch (error) {
               
                reject(error); // Reject the promise on error
              } finally {
               
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
                }, 60000);
              } else if (err.status >= 500) {
                console.warn('⚠️ Server error - MongoDB may be under load');
                // Disable refresh temporarily if server error
                this.refreshDisabled = true;
                setTimeout(() => {
                  this.refreshDisabled = false; // Re-enable after 30 seconds
                }, 30000);
              }
              
              reject(err); // Reject the promise on error
            }
          });
        }, 100); // 100ms delay to throttle rapid clicks
      } else {

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
      // NEW: auto-fit the full stage (including offstage areas) into the mobile viewport
      this.adjustMobileZoomToFit();
      this.resizeListener = () => {
        this.calculateStageWithDOMSize();
        this.adjustMobileZoomToFit();
      };
      window.addEventListener('resize', this.resizeListener);
      
      // Fix: Use ChangeDetectorRef to handle the height change properly
      setTimeout(() => {
        this.calculateStageWithDOMSize();
        this.cdr.detectChanges();
      }, 0);
      
      // Set animation flag after initial animations complete
      setTimeout(() => {
        this.hasPlayedInitialAnimation = true;
      }, 2000); // Wait for all initial animations to complete
    } else {
      console.error('Stage reference not available in ngAfterViewInit');
    }
    setTimeout(() => this.updateMinTimelineZoom(), 100);
    window.addEventListener('resize', this.updateMinTimelineZoom.bind(this));
  }

  private setupSliderDebug() {
    const sliderElement = document.querySelector('.stage-position-slider') as HTMLElement;
    const stageArea = this.stageRef.nativeElement;
    
    if (sliderElement) {
      const events = ['mousedown', 'mouseup', 'mousemove', 'click', 'pointerdown', 'pointerup', 'pointermove'];
      events.forEach(eventType => {
        sliderElement.addEventListener(eventType, (e) => {
         
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
    // Use fixed dimensions instead of responsive sizing
    this.stageWidthPx = 800;  // Fixed width
    this.stageHeightPx = 600; // Fixed height
    
    this.calculateStage();
  }

  calculateStage() {
    if (!this.isMobile) {
      this.pixelsPerFoot = 20;
      this.stageWidthPx = this.width * this.pixelsPerFoot;
      this.stageHeightPx = this.depth * this.pixelsPerFoot;
      this.offstageWidthPx = this.offstageWidth * this.pixelsPerFoot;
      this.totalStageWidthPx = this.stageWidthPx + (2 * this.offstageWidthPx);
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
    const lineThickness = 4; // match your .main-horizontal height
    for (let i = 0; i <= 4; i++) {
      let y = (i / 4) * this.stageHeightPx;
      if (i === 4) y = this.stageHeightPx - lineThickness; // last line at bottom border
      this.mainHorizontals.push(y);
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
    // Add grid points for offstage left and right
    this.subVerticals.push(-this.offstageWidth);
    this.subVerticals.push(this.width + this.offstageWidth);
    // Sort for safety
    this.subVerticals.sort((a, b) => a - b);
    this.mainVerticals = this.mainVerticals.sort((a, b) => a - b);
    this.mainHorizontals = this.mainHorizontals.sort((a, b) => a - b);
    this.subHorizontals = this.subHorizontals.sort((a, b) => a - b);
    // Calculate the grid height in px
    this.stageGridHeightPx = this.mainHorizontals[this.mainHorizontals.length - 1] - this.mainHorizontals[0];
  }

  // Helper to go to a specific formation index and update all relevant state
  goToFormation(index: number) {
    this.currentFormationIndex = index;
    this.playingFormationIndex = index;
    // Do NOT update playbackTime or seek audio here
    // Only update performer tips and selection rectangle
    this.checkFormationPositioningTips();
    if (this.selectedPerformerIds.size > 0) {
      this.calculateSelectionRectangle();
    }
  }

  // jumpToFormation method moved below with draft support

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

  addFormation() {
    // Save state before making changes
    this.saveState('Add formation');

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

  addNewPerformerToRoster() {
    const trimmedName = this.newPerformerName?.trim();
    if (!trimmedName) {
      return;
    }

    // Check if performer with this name already exists
    const existingPerformer = this.performers.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingPerformer) {
      alert('A performer with this name already exists.');
      return;
    }

    // Get current user's team ID
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) {
      alert('Unable to get team information.');
      return;
    }

    // Create new user in the backend
    this.teamService.addTeamMember(currentUser.team._id, trimmedName).subscribe({
      next: (response: any) => {
        if (response && response.user) {
          const newUser = response.user;
          
          // Find an available position for the new performer
          const position = this.findAvailablePosition();
          
          // Add the new performer to all formations
          this.formations = this.formations.map(formation => [
            ...formation,
            {
              id: newUser._id,
              name: newUser.name,
              x: position.x,
              y: position.y,
              skillLevels: { ...(newUser.skillLevels || {}) },
              height: newUser.height || 5.5,
              isDummy: false
            }
          ]);

          // Update segment roster if not already included
          if (!this.segmentRoster.some(m => m._id === newUser._id)) {
            this.segmentRoster = [...this.segmentRoster, newUser];
          }

          // Refresh team roster to include the new member
          this.refreshTeamRoster();

          // Clear the input field
          this.newPerformerName = '';
          
          // Force immediate save for new segments to ensure they're created in MongoDB
          this.forceSaveForNewSegment();
          
          // Also trigger regular auto-save for existing segments
          this.triggerAutoSave();
        } else {
          alert('Failed to create new user.');
        }
      },
      error: (error: any) => {
        console.error('Error creating new user:', error);
        alert('Failed to create new user. Please try again.');
      }
    });
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

  /**
   * Calculates the next available dummy number by scanning existing dummy performers
   * in all formations as well as any dummy templates already attached to the segment.
   * This guarantees unique dummy names even if the local counter is reset.
   */
  private getNextDummyNumber(): number {
    let maxDummyNum = 0;

    // 1) Look at dummy templates that already exist on the segment (if any)
    if (this.segment?.dummyTemplates?.length) {
      this.segment.dummyTemplates.forEach((template: any) => {
        const num = parseInt(template.name, 10);
        if (!isNaN(num)) {
          maxDummyNum = Math.max(maxDummyNum, num);
        }
      });
    }

    // 2) Look at current formations for any dummy performers already placed
    this.formations.forEach(formation => {
      formation.forEach(p => {
        if (p.isDummy) {
          const num = parseInt(p.dummyName || p.name, 10);
          if (!isNaN(num)) {
            maxDummyNum = Math.max(maxDummyNum, num);
          }
        }
      });
    });

    // Keep the component level counter ahead so other legacy usages remain unique
    this.dummyCounter = Math.max(this.dummyCounter, maxDummyNum + 1);

    return maxDummyNum + 1;
  }

  addDummyPerformer() {
    // Prevent rapid clicking
    if (this.isAddingDummyPerformer) {
      return;
    }
    
    this.isAddingDummyPerformer = true;

    if (!this.segment?._id) {
      // For new segments, create a temporary dummy template
      const nextDummyNumber = this.getNextDummyNumber();
      const dummyName = `${nextDummyNumber}`;
      const dummyTemplateId = `dummy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Find an available position for the new dummy performer
      const position = this.findAvailablePosition();
      
      // Add dummy to all formations
      this.formations = this.formations.map(formation => [
        ...formation,
        {
          id: dummyTemplateId,
          name: dummyName,
          x: position.x,
          y: position.y,
          isDummy: true,
          dummyName: dummyName,
          skillLevels: {},
          height: 5.5
        }
      ]);
      
      // Force immediate save for new segments to ensure they're created in MongoDB
      this.forceSaveForNewSegment();
      
      // Also trigger regular auto-save for existing segments
      this.triggerAutoSave();
      
      // Reset flag after a short delay to allow for UI updates
      setTimeout(() => {
        this.isAddingDummyPerformer = false;
      }, 100);
      return;
    }

    const dummyName = `${this.getNextDummyNumber()}`;
    
    // Increment counter BEFORE creating the dummy to ensure unique names
    this.dummyCounter++;

    this.teamService.addDummyTemplate(this.segment._id, dummyName).subscribe({
      next: (res: any) => {
        const dummyTemplate = res?.dummyTemplate;
        
        if (!dummyTemplate || !dummyTemplate.id) {
          alert('Failed to create dummy template.');
          this.isAddingDummyPerformer = false;
          return;
        }
        
        // Find an available position for the new dummy performer
        const position = this.findAvailablePosition();
        
        // Add dummy to all formations
        this.formations = this.formations.map(formation => [
          ...formation,
          {
            id: dummyTemplate.id,
            name: dummyName,
            x: position.x,
            y: position.y,
            isDummy: true,
            dummyName: dummyName,
            skillLevels: {},
            height: 5.5
          }
        ]);
        
        // Trigger auto-save for existing segments
        this.triggerAutoSave();
        
        // Reset flag after a short delay to allow for UI updates
        setTimeout(() => {
          this.isAddingDummyPerformer = false;
        }, 100);
      },
      error: (err: any) => {
        console.error('❌ DEBUG addDummyPerformer: Error creating dummy template:', err);
        alert('Failed to add dummy performer.');
        this.isAddingDummyPerformer = false;
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

    // Check if this performer is already selected
    const isPerformerSelected = this.selectedPerformerIds.has(performer.id);
    const isMultiSelection = this.isMultiSelectionEnabled();

    // If performer is not selected and we're not in multi-selection mode, clear selection and select only this performer
    if (!isPerformerSelected && !isMultiSelection) {
      this.selectedPerformerIds.clear();
      this.selectedPerformersForPreviousPosition.clear();
      this.multiSelectionEnabledByRectangle = false; // Clear rectangle-based multi-selection
    }
    
    // If performer is not selected and we ARE in multi-selection mode (rectangle-based), 
    // but we're NOT in multi-selection mode (no shift/command), clear the multi-selection and select only this performer
    if (!isPerformerSelected && this.multiSelectionEnabledByRectangle && !isMultiSelection) {
      this.selectedPerformerIds.clear();
      this.selectedPerformersForPreviousPosition.clear();
      this.multiSelectionEnabledByRectangle = false;
    }
    
    // Add this performer to selection if not already selected
    if (!isPerformerSelected) {
      this.selectedPerformerIds.add(performer.id);
    }
    
    this.selectedPerformerId = performer.id;

    // Show previous position for the dragged performer
    this.selectedPerformerForPreviousPosition = performer.id;

    // Save state before starting drag (for undo/redo)
    const selectedCount = this.selectedPerformerIds.size;
    this.saveState(`Move performer${selectedCount > 1 ? 's' : ''} (${selectedCount} selected)`);

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
    let dx = clientX - this.dragStartX;
    let dy = clientY - this.dragStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we haven't moved past the threshold yet, don't start dragging
    if (distance < this.DRAG_THRESHOLD) return;

    // Scale movement by zoom
    const zoom = this.currentZoom || 1;
    dx = dx / zoom;
    dy = dy / zoom;

    let x = (this.dragStartX + dx - this.stageRef.nativeElement.getBoundingClientRect().left - this.dragOffset.x) / this.pixelsPerFoot;
    let y = (this.dragStartY + dy - this.stageRef.nativeElement.getBoundingClientRect().top - this.dragOffset.y) / this.pixelsPerFoot;

    // Calculate all possible grid positions (main + subgrid)
    const gridPositionsX: number[] = [];
    const gridPositionsY: number[] = [];

    // Main verticals (8 sections, 9 lines) - main stage only
    for (let i = 0; i <= 8; i++) {
      gridPositionsX.push((i / 8) * this.width);
    }
    // Subgrid verticals - main stage only
    for (let i = 0; i < 8; i++) {
      const start = (i / 8) * this.width;
      const end = ((i + 1) / 8) * this.width;
      for (let d = 1; d <= this.divisions; d++) {
        gridPositionsX.push(start + ((end - start) * d) / (this.divisions + 1));
      }
    }
    
    // Add grid points for offstage left area (from -offstageWidth to 0)
    for (let i = 0; i <= 8; i++) {
      gridPositionsX.push(-this.offstageWidth + (i / 8) * this.offstageWidth);
    }
    // Subgrid for offstage left
    for (let i = 0; i < 8; i++) {
      const start = -this.offstageWidth + (i / 8) * this.offstageWidth;
      const end = -this.offstageWidth + ((i + 1) / 8) * this.offstageWidth;
      for (let d = 1; d <= this.divisions; d++) {
        gridPositionsX.push(start + ((end - start) * d) / (this.divisions + 1));
      }
    }
    
    // Add grid points for offstage right area (from width to width + offstageWidth)
    for (let i = 0; i <= 8; i++) {
      gridPositionsX.push(this.width + (i / 8) * this.offstageWidth);
    }
    // Subgrid for offstage right
    for (let i = 0; i < 8; i++) {
      const start = this.width + (i / 8) * this.offstageWidth;
      const end = this.width + ((i + 1) / 8) * this.offstageWidth;
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

    // Clamp to stage boundaries (including offstage areas)
    x = Math.max(-this.offstageWidth, Math.min(this.width + this.offstageWidth, x));
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
            
            // Clamp to stage boundaries (including offstage areas)
            newX = Math.max(-this.offstageWidth, Math.min(this.width + this.offstageWidth, newX));
            newY = Math.max(0, Math.min(this.depth, newY));
            
            // Snap to grid
            newX = snapToGrid(newX, gridPositionsX);
            newY = snapToGrid(newY, gridPositionsY);
            
            return { ...p, x: newX, y: newY };
          }
        }
        return p;
      });

      // Mirror movement: if mirror mode is enabled, also move mirror performers
      if (this.isMirrorModeEnabled) {
        const mirrorUpdates: { [id: string]: { x: number, y: number } } = {};
        
        // For each selected performer, find their mirror and calculate mirror movement
        this.selectedPerformerIds.forEach(selectedId => {
          const selectedPerformer = this.performers.find(p => p.id === selectedId);
          if (!selectedPerformer) return;
          
          // Find mirror using INITIAL positions instead of current positions
          const selectedInitialPos = this.selectedPerformersInitialPositions[selectedId];
          if (!selectedInitialPos) return;
          
          // Calculate mirror position based on initial position
          const centerX = this.width / 2;
          const distanceFromCenter = selectedInitialPos.x - centerX;
          const expectedMirrorX = centerX - distanceFromCenter;
          
          // Find mirror performer based on initial positions
          const tolerance = 0.001; // Very small tolerance for floating point precision only
          const mirrorPerformer = this.performers.find(p => {
            if (p.id === selectedId) return false; // Skip self
            if (this.selectedPerformerIds.has(p.id)) return false; // Skip if mirror is also selected
            
            // Check if this performer was at the mirror position initially
            const pInitialPos = this.selectedPerformersInitialPositions[p.id];
            if (!pInitialPos) {
              // If we don't have initial position stored, use current position
              const xMatch = Math.abs(p.x - expectedMirrorX) <= tolerance;
              const yMatch = Math.abs(p.y - selectedInitialPos.y) <= tolerance;
              console.log(`  📊 DRAG Checking ${p.name} (current): x=${p.x} vs ${expectedMirrorX}, y=${p.y} vs ${selectedInitialPos.y}, xMatch=${xMatch}, yMatch=${yMatch}`);
              return xMatch && yMatch;
            } else {
              // Use initial positions for comparison
              const xMatch = Math.abs(pInitialPos.x - expectedMirrorX) <= tolerance;
              const yMatch = Math.abs(pInitialPos.y - selectedInitialPos.y) <= tolerance;
              console.log(`  📊 DRAG Checking ${p.name} (initial): x=${pInitialPos.x} vs ${expectedMirrorX}, y=${pInitialPos.y} vs ${selectedInitialPos.y}, xMatch=${xMatch}, yMatch=${yMatch}`);
              return xMatch && yMatch;
            }
          });
          
          if (!mirrorPerformer) return;
          
          // Calculate mirrored movement
          const mirrorDeltaX = -deltaX; // Mirror X movement (opposite direction)
          const mirrorDeltaY = deltaY;  // Same Y movement
          
          // Get mirror's initial position (store it if not already stored)
          let mirrorInitialPos = this.selectedPerformersInitialPositions[mirrorPerformer.id];
          if (!mirrorInitialPos) {
            // Store the mirror's CURRENT position as its initial position for this drag
            mirrorInitialPos = { x: mirrorPerformer.x, y: mirrorPerformer.y };
            this.selectedPerformersInitialPositions[mirrorPerformer.id] = mirrorInitialPos;
          }
          
          const mirrorInitial = this.selectedPerformersInitialPositions[mirrorPerformer.id] || { x: mirrorPerformer.x, y: mirrorPerformer.y };
          
          let newMirrorX = mirrorInitial.x + mirrorDeltaX;
          let newMirrorY = mirrorInitial.y + mirrorDeltaY;
          
          // Clamp to stage boundaries (including offstage areas)
          newMirrorX = Math.max(-this.offstageWidth, Math.min(this.width + this.offstageWidth, newMirrorX));
          newMirrorY = Math.max(0, Math.min(this.depth, newMirrorY));
          
          // Snap to grid
          newMirrorX = snapToGrid(newMirrorX, gridPositionsX);
          newMirrorY = snapToGrid(newMirrorY, gridPositionsY);
          
          mirrorUpdates[mirrorPerformer.id] = { x: newMirrorX, y: newMirrorY };
        });
        
        // Apply mirror updates
        this.performers = this.performers.map(p => {
          if (mirrorUpdates[p.id]) {
            return { ...p, ...mirrorUpdates[p.id] };
          }
          return p;
        });
      }
    }

    // Update selection rectangle in real-time during drag
    this.calculateSelectionRectangle();

    // Throttled live update of formation positioning tips
    const now = Date.now();
    if (now - this.lastTipUpdateTime > this.TIP_UPDATE_THROTTLE_MS) {
      this.lastTipUpdateTime = now;
      this.checkFormationPositioningTips();
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
    
    // Update selection rectangle after dragging performers
    this.calculateSelectionRectangle();
    
    this.triggerAutoSave();

    // Check for consistency warnings after moving performers
    setTimeout(() => {
      this.checkConsistencyWarnings();
      this.checkFormationPositioningTips();
    }, 500); // Small delay to ensure the movement is properly saved
  };

  // --- Rectangular Selection Logic ---
  onStageMouseDown(event: MouseEvent) {
    // Only handle if clicking on the stage area itself, not on performers
    if (event.target !== this.stageRef.nativeElement && 
        !(event.target as HTMLElement).closest('.stage-grid-outer')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Get coordinates relative to the stage-grid-outer (excludes header height)
    const stageGridElement = this.stageRef.nativeElement.querySelector('.stage-grid-outer') as HTMLElement;
    if (!stageGridElement) return;

    const rect = stageGridElement.getBoundingClientRect();
    const scale = this.currentZoom || 1;
    const translateY = this.stageVerticalOffset || 0;
    
    // Calculate raw mouse coordinates relative to the stage-grid-outer
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    
    // Apply inverse transformation to get coordinates in the stage-grid coordinate system
    this.selectionStartX = rawX / scale;
    this.selectionStartY = rawY / scale;
    this.selectionEndX = this.selectionStartX;
    this.selectionEndY = this.selectionStartY;
    this.isSelecting = false; // Will be set to true if we move enough

    // Add event listeners for selection and store references
    this.stageMouseMoveListener = this.renderer.listen('document', 'mousemove', this.onStageMouseMove);
    this.stageMouseUpListener = this.renderer.listen('document', 'mouseup', this.onStageMouseUp);
  }

  onStageMouseMove = (event: MouseEvent) => {
    if (!this.stageRef) return;

    // Get coordinates relative to the stage-grid-outer (excludes header height)
    const stageGridElement = this.stageRef.nativeElement.querySelector('.stage-grid-outer') as HTMLElement;
    if (!stageGridElement) return;

    const rect = stageGridElement.getBoundingClientRect();
    const scale = this.currentZoom || 1;
    const translateY = this.stageVerticalOffset || 0;
    
    // Calculate raw mouse coordinates relative to the stage-grid-outer
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    
    // Apply inverse transformation to get coordinates in the stage-grid coordinate system
    const currentX = rawX / scale;
    const currentY = rawY / scale;

    // Calculate distance moved
    const dx = currentX - this.selectionStartX;
    const dy = currentY - this.selectionStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Start selection if we've moved past the threshold
    if (!this.isSelecting && distance > this.SELECTION_THRESHOLD) {
      this.isSelecting = true;
      
      // Clear current selection if not holding shift/command
      if (!this.isMultiSelectionEnabled()) {
        this.selectedPerformerIds.clear();
        this.multiSelectionEnabledByRectangle = false; // Clear rectangle-based multi-selection
      }
    }

    if (this.isSelecting) {
      this.selectionEndX = currentX;
      this.selectionEndY = currentY;
      // Do NOT call updateSelection here; only update the rectangle's visual size
    }
  };

  onStageMouseUp = (event: MouseEvent) => {
    if (this.isSelecting) {
      // Only update selection on release
      this.updateSelection();
      this.isSelecting = false; // This will hide the rectangle
      
      // If no performers were selected, clear rectangle-based multi-selection
      if (this.selectedPerformerIds.size === 0) {
        this.multiSelectionEnabledByRectangle = false;
      }
      
      // Set flag to prevent stage click from clearing selections
      this.justFinishedSelection = true;
      setTimeout(() => {
        this.justFinishedSelection = false;
      }, 100); // Clear flag after 100ms
      
      // Prevent the stage click from firing when finishing a rectangular selection
      event.stopPropagation();
      event.preventDefault();
    }

    // Remove event listeners
    if (this.stageMouseMoveListener) {
      this.stageMouseMoveListener();
      this.stageMouseMoveListener = null;
    }
    if (this.stageMouseUpListener) {
      this.stageMouseUpListener();
      this.stageMouseUpListener = null;
    }
  };

  private updateSelection() {
    if (!this.stageRef || !this.isSelecting) return;

    // Calculate selection rectangle (these are now in unscaled coordinates)
    const left = Math.min(this.selectionStartX, this.selectionEndX);
    const right = Math.max(this.selectionStartX, this.selectionEndX);
    const top = Math.min(this.selectionStartY, this.selectionEndY);
    const bottom = Math.max(this.selectionStartY, this.selectionEndY);

    // Check each performer to see if they're in the selection rectangle
    let performersInSelection = 0;
    this.performers.forEach(performer => {
      // Use the same coordinate system as getPerformerStyle
      const performerSize = 25; // px - same as in getPerformerStyle
      const totalPosition = this.getPerformerTotalPosition(performer);
      
      // Calculate performer position in unscaled pixels (same coordinate system as selection)
      const performerX = (totalPosition.x / (this.width + 2 * this.offstageWidth)) * this.totalStageWidthPx;
      const performerY = (performer.y / this.depth) * this.stageHeightPx;

      // Check if performer is within the selection rectangle (both in unscaled coordinates)
      if (performerX >= left && performerX <= right && 
          performerY >= top && performerY <= bottom) {
        this.selectedPerformerIds.add(performer.id);
        performersInSelection++;
      }
    });

    // If we selected multiple performers, enable rectangle-based multi-selection
    if (performersInSelection > 1) {
      this.multiSelectionEnabledByRectangle = true;
    }

    // Update the selected performer for details panel
    if (this.selectedPerformerIds.size > 0) {
      const firstSelectedId = Array.from(this.selectedPerformerIds)[0];
      this.selectedPerformerId = firstSelectedId;
    }
    
    // Update the performers for previous position display - show previous positions for all selected performers
    this.selectedPerformersForPreviousPosition.clear();
    this.selectedPerformerIds.forEach(id => {
      this.selectedPerformersForPreviousPosition.add(id);
    });
    
    // Calculate selection rectangle for multiple performers
    this.calculateSelectionRectangle();
  }

  getSelectionStyle(): any {
    if (!this.isSelecting) return { display: 'none' };

    const left = Math.min(this.selectionStartX, this.selectionEndX);
    const top = Math.min(this.selectionStartY, this.selectionEndY);
    const width = Math.abs(this.selectionEndX - this.selectionStartX);
    const height = Math.abs(this.selectionEndY - this.selectionStartY);

    return {
      position: 'absolute',
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px',
      display: 'block'
    };
  }

  /**
   * Calculate the bounding rectangle for selected performers
   * The rectangle should form from the furthest away performers
   */
  calculateSelectionRectangle(): void {
    if (this.selectedPerformerIds.size < 2) {
      this.selectionRectangle = null;
      return;
    }

    const selectedPerformers = this.performers.filter(p => this.selectedPerformerIds.has(p.id));
    if (selectedPerformers.length < 2) {
      this.selectionRectangle = null;
      return;
    }

    // Convert performer positions to pixel coordinates using the same logic as getPerformerStyle
    const performerPositions = selectedPerformers.map(performer => {
      const performerSize = 25; // px - same as in getPerformerStyle
      const totalPosition = this.getPerformerTotalPosition(performer);
      
      // Use the same coordinate calculation as getPerformerStyle
      const x = (totalPosition.x / (this.width + 2 * this.offstageWidth)) * this.totalStageWidthPx;
      const y = (performer.y / this.depth) * this.stageHeightPx;
      return { x, y, size: performerSize };
    });

    // Find the bounding box
    const minX = Math.min(...performerPositions.map(p => p.x - p.size / 2));
    const maxX = Math.max(...performerPositions.map(p => p.x + p.size / 2));
    const minY = Math.min(...performerPositions.map(p => p.y - p.size / 2));
    const maxY = Math.max(...performerPositions.map(p => p.y + p.size / 2));

    // Add some padding around the performers
    const padding = 10;
    
    this.selectionRectangle = {
      left: minX - padding,
      top: minY - padding,
      width: maxX - minX + (padding * 2),
      height: maxY - minY + (padding * 2)
    };
  }

  /**
   * Get the style for the selection rectangle
   */
  getSelectionRectangleStyle(): any {
    if (!this.selectionRectangle || this.selectedPerformerIds.size < 2) {
      return { display: 'none' };
    }

    return {
      position: 'absolute',
      left: this.selectionRectangle.left + 'px',
      top: this.selectionRectangle.top + 'px',
      width: this.selectionRectangle.width + 'px',
      height: this.selectionRectangle.height + 'px',
      border: '2px dashed #ffd700',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: 90
    };
  }

  /**
   * Get the style for the rotation handle
   */
  getRotationHandleStyle(): any {
    if (!this.selectionRectangle || this.selectedPerformerIds.size < 2) {
      return { display: 'none' };
    }

    return {
      position: 'absolute',
      left: (this.selectionRectangle.left + this.selectionRectangle.width / 2 - 50) + 'px',
      top: (this.selectionRectangle.top - 45) + 'px',
      width: '100px',
      height: '30px',
      zIndex: 91
    };
  }

  /**
   * Get the position of the rotation slider thumb (0-100%)
   */
  getRotationSliderPosition(): number {
    // Convert rotation degrees (-180 to +180) to percentage (0 to 100)
    return ((this.currentRotationDegrees + 180) / 360) * 100;
  }

  /**
   * Start rotation of selected performers using slider
   */
  onRotationStart(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    if (this.selectedPerformerIds.size < 2 || !this.selectionRectangle) return;
    
    // Save state before starting rotation (for undo/redo)
    const selectedCount = this.selectedPerformerIds.size;
    this.saveState(`Rotate performer${selectedCount > 1 ? 's' : ''} (${selectedCount} selected)`);
    
    this.isRotating = true;
    this.rotationSliderStartX = event.clientX;
    this.rotationSliderStartValue = this.currentRotationDegrees;
    
    // Calculate center of selection rectangle in stage coordinates
    const centerX = this.selectionRectangle.left + this.selectionRectangle.width / 2;
    const centerY = this.selectionRectangle.top + this.selectionRectangle.height / 2;
    
    // Convert to stage coordinates (feet)
    this.rotationCenter = {
      x: (centerX / this.stageWidthPx) * this.width,
      y: (centerY / this.stageHeightPx) * this.depth
    };
    
    // Store initial positions of selected performers
    this.selectedPerformersInitialRotationPositions = {};
    this.performers.forEach(performer => {
      if (this.selectedPerformerIds.has(performer.id)) {
        this.selectedPerformersInitialRotationPositions[performer.id] = {
          x: performer.x,
          y: performer.y
        };
      }
    });
    
    // Add event listeners
    document.addEventListener('mousemove', this.onRotationMove);
    document.addEventListener('mouseup', this.onRotationEnd);
  }

  onRotationMove = (event: MouseEvent) => {
    if (!this.isRotating || !this.selectionRectangle) return;
    
    // Calculate rotation based on horizontal mouse movement
    const deltaX = event.clientX - this.rotationSliderStartX;
    const rotationSensitivity = 0.5; // degrees per pixel - makes it less sensitive
    const newRotationDegrees = this.rotationSliderStartValue + (deltaX * rotationSensitivity);
    
    // Limit rotation to reasonable bounds (-180 to +180 degrees)
    this.currentRotationDegrees = Math.max(-180, Math.min(180, newRotationDegrees));
    
    // Convert degrees to radians
    const rotationRadians = (this.currentRotationDegrees * Math.PI) / 180;
    
    // Rotate all selected performers around the center
    this.performers = this.performers.map(performer => {
      if (this.selectedPerformerIds.has(performer.id)) {
        const initialPos = this.selectedPerformersInitialRotationPositions[performer.id];
        if (initialPos) {
          // Calculate relative position from center
          const relativeX = initialPos.x - this.rotationCenter.x;
          const relativeY = initialPos.y - this.rotationCenter.y;
          
          // Apply rotation
          const rotatedX = relativeX * Math.cos(rotationRadians) - relativeY * Math.sin(rotationRadians);
          const rotatedY = relativeX * Math.sin(rotationRadians) + relativeY * Math.cos(rotationRadians);
          
          // Calculate new position
          let newX = this.rotationCenter.x + rotatedX;
          let newY = this.rotationCenter.y + rotatedY;
          
          // Clamp to stage boundaries
          newX = Math.max(0, Math.min(this.width, newX));
          newY = Math.max(0, Math.min(this.depth, newY));
          
          return { ...performer, x: newX, y: newY };
        }
      }
      return performer;
    });
    
    // Update selection rectangle
    this.calculateSelectionRectangle();
    
    // Trigger auto-save
    this.triggerAutoSave();
  }

  onRotationEnd = () => {
    if (!this.isRotating) return;
    
    this.isRotating = false;
    
    // Remove event listeners
    document.removeEventListener('mousemove', this.onRotationMove);
    document.removeEventListener('mouseup', this.onRotationEnd);
    
    // Clear initial positions
    this.selectedPerformersInitialRotationPositions = {};
  }

  async onPerformerClick(performer: Performer) {
    this.isPerformerSelectionLoading = true;
    
    try {
      // Check if multi-selection is enabled (Shift or Command key)
      const isMultiSelection = this.isMultiSelectionEnabled();
      const isPerformerSelected = this.selectedPerformerIds.has(performer.id);
      
      console.log('Click detected:', {
        performer: performer.name,
        isMultiSelection,
        isPerformerSelected,
        isShiftPressed: this.isShiftPressed,
        isCommandPressed: this.isCommandPressed,
        multiSelectionEnabledByRectangle: this.multiSelectionEnabledByRectangle,
        currentSelection: Array.from(this.selectedPerformerIds)
      });
      
      // If performer is not selected and we have rectangle-based multi-selection,
      // but we're NOT in multi-selection mode (no shift/command), clear the multi-selection and select only this performer
      if (!isPerformerSelected && this.multiSelectionEnabledByRectangle && !isMultiSelection) {
        this.selectedPerformerIds.clear();
        this.selectedPerformersForPreviousPosition.clear();
        this.multiSelectionEnabledByRectangle = false;
        this.selectedPerformerIds.add(performer.id);
        console.log('Cleared rectangle multi-selection, selected only:', performer.name);
      } else if (isMultiSelection) {
        // Multi-selection mode: add to selection (don't remove if already selected)
        if (!this.selectedPerformerIds.has(performer.id)) {
          // Add to selection only if not already selected
          this.selectedPerformerIds.add(performer.id);
          console.log('Added to selection:', performer.name);
        } else {
          console.log('Already in selection:', performer.name);
        }
      } else {
        // Single selection mode: clear and select only this performer
        this.selectedPerformerIds.clear();
        this.selectedPerformersForPreviousPosition.clear();
        this.multiSelectionEnabledByRectangle = false; // Clear rectangle-based multi-selection
        this.selectedPerformerIds.add(performer.id);
        console.log('Single selection:', performer.name);
      }
      
      console.log('Final selection:', Array.from(this.selectedPerformerIds));
      
      // Update the performers for previous position display - show previous positions for all selected performers
      this.selectedPerformersForPreviousPosition.clear();
      this.selectedPerformerIds.forEach(id => {
        this.selectedPerformersForPreviousPosition.add(id);
      });
      
      // Set the selected performer ID for the side panel
      this.setSelectedPerformer(performer);
      
      // Switch to performer details panel
      this.sidePanelMode = 'performer';
      
      // Calculate selection rectangle for multiple performers
      this.calculateSelectionRectangle();
      
      // Trigger auto-save
      this.triggerAutoSave();
      
      // Force change detection to update the UI
      this.cdr.detectChanges();

      
    } catch (error) {
      console.error('Error in onPerformerClick:', error);
      // Try to recover gracefully
      this.selectedPerformerIds.clear();
      this.selectedPerformerId = null;
      this.multiSelectionEnabledByRectangle = false;
    } finally {
      this.isPerformerSelectionLoading = false;
    }
  }

  getPreviousPosition(performerId: string): { x: number, y: number } | null {
    // Show previous position if:
    // 1. Show Transitions is enabled (shows for ALL performers), OR
    // 2. This performer is selected for previous position display (either individually or as part of multiple selected performers)
    const shouldShowPrevious = this.showTransitions || 
                              this.selectedPerformerForPreviousPosition === performerId || 
                              this.selectedPerformersForPreviousPosition.has(performerId);
    
    if (!shouldShowPrevious) {
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

    // Use the same coordinate system as performers for consistent positioning
    const totalPosition = this.getPerformerTotalPosition(currentUserPerformer);
    
    // Convert to pixel coordinates using the same logic as getPerformerStyle
    const left = (totalPosition.x / (this.width + 2 * this.offstageWidth)) * this.totalStageWidthPx;
    const top = (currentUserPerformer.y / this.depth) * this.stageHeightPx;

    // Scale the spotlight radius based on zoom level to maintain consistent visual size
    const zoomAdjustedRadius = this.spotlightRadius * (this.currentZoom || 1);

    return {
      'pointer-events': 'none',
      'position': 'absolute',
      'top': '0',
      'left': '0',
      'width': this.stageWidthPx + 'px',
      'height': this.stageHeightPx + 'px',
      'z-index': 10,
      'background': `radial-gradient(circle ${zoomAdjustedRadius}px at ${left}px ${top}px, transparent 0%, transparent 70%, rgba(0,0,0,${this.spotlightOpacity}) 100%)`
    };
  }

  getPerformerStyle(performer: Performer) {
    // Use fixed performer size
    const performerSize = 25; // px
    // Use animated positions if animating
    let x = performer.x;
    let y = performer.y;
    if (this.isAnimating && this.animatedPositions[performer.id]) {
      x = this.animatedPositions[performer.id].x;
      y = this.animatedPositions[performer.id].y;
    }

    // Convert to total stage coordinates (including offstage areas)
    const totalPosition = this.getPerformerTotalPosition({ ...performer, x, y });
    
    // Use proportional positioning with total stage width
    const left = (totalPosition.x / (this.width + 2 * this.offstageWidth)) * this.totalStageWidthPx - performerSize / 2;
    const top = (y / this.depth) * this.stageHeightPx - performerSize / 2;

    const isCurrentUser = performer.id === this.currentUserId;
    const isSelected = this.isPerformerSelected(performer);
    const isHovered = this.isPerformerHovered(performer);
    const isOffstage = this.isPerformerOffstage({ ...performer, x, y });

    const baseStyle = {
      left: `${left}px`,
      top: `${top}px`,
      width: `${performerSize}px`,
      height: `${performerSize}px`,
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

    // Convert to total stage coordinates (including offstage areas)
    const totalPosition = this.getPerformerTotalPosition({ id: performerId, name: '', x: prevPos.x, y: prevPos.y, skillLevels: {} });
    
    // Use proportional positioning with total stage width
    const left = (totalPosition.x / (this.width + 2 * this.offstageWidth)) * this.totalStageWidthPx - performerSize / 2;
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
    this.editIsPublic = this.segment?.isPublic ?? true; // Initialize from segment or default
    
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

    // Update the segment object with the new styles and privacy
    if (this.segment) {
      this.segment.stylesInSegment = this.editSelectedStyles.map(s => s.name);
      this.segment.isPublic = this.editIsPublic;
    }

    // Save changes to backend
    if (this.segment?._id) {
      this.segmentService.updateSegment(this.segment._id, {
        name: this.segmentName,
        depth: this.depth,
        width: this.width,
        divisions: this.divisions,
        stylesInSegment: this.editSelectedStyles.map(s => s.name),
        isPublic: this.editIsPublic // Include privacy
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
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.team?._id) {
      return;
    }

    // Set saving state to true
    this.isSaving = true;

    // If no segment exists, create a new one
    if (!this.segment || !this.segment._id) {
      this.segmentService.createSegment(
        currentUser.team._id,
        this.segmentName,
        this.depth,
        this.width,
        this.divisions,
        this.segment?.stylesInSegment || []
      ).subscribe({
        next: (response) => {
          this.segment = response.segment;
          
          // Extract dummy templates from formations
          const dummyTemplates: any[] = [];
          const dummyTemplateIds = new Set<string>();
          
          this.formations.forEach(formation => {
            formation.forEach(performer => {
              if (performer.isDummy && !dummyTemplateIds.has(performer.id)) {
                dummyTemplateIds.add(performer.id);
                dummyTemplates.push({
                  id: performer.id,
                  name: performer.name,
                  skillLevels: performer.skillLevels || {},
                  height: performer.height || 5.5,
                  customColor: performer.customColor
                });
              }
            });
          });
          
          // Transform formations to use dummyTemplateId for dummies
          const transformedFormations = this.formations.map(formation => 
            formation.map(performer => ({
              x: performer.x,
              y: performer.y,
              user: performer.isDummy ? undefined : performer.id,
              dummyTemplateId: performer.isDummy ? performer.id : undefined,
              customColor: performer.customColor
            }))
          );
          
          const updateData = {
            formations: transformedFormations,
            formationDurations: this.formationDurations,
            animationDurations: this.animationDurations,
            formationDrafts: this.formationDrafts,
            roster: this.segmentRoster.map(user => user._id),
            dummyTemplates: dummyTemplates
          };
          
          this.segmentService.updateSegment(this.segment._id, updateData).subscribe({
            next: () => {
              this.lastSaveTime = new Date();
              this.isSaving = false;
              
              // Update the URL to include the new segment ID
              this.router.navigate([], {
                relativeTo: this.route,
                queryParams: { id: this.segment._id },
                queryParamsHandling: 'merge'
              });
            },
            error: (err) => {
              console.error('Error updating new segment:', err);
              this.isSaving = false;
            }
          });
        },
        error: (err) => {
          console.error('Error creating segment:', err);
          this.isSaving = false;
        }
      });
      return;
    }

    // Extract dummy templates from formations
    const dummyTemplates: any[] = [];
    const dummyTemplateIds = new Set<string>();
    
    this.formations.forEach(formation => {
      formation.forEach(performer => {
        if (performer.isDummy && !dummyTemplateIds.has(performer.id)) {
          dummyTemplateIds.add(performer.id);
          dummyTemplates.push({
            id: performer.id,
            name: performer.name,
            skillLevels: performer.skillLevels || {},
            height: performer.height || 5.5,
            customColor: performer.customColor
          });
        }
      });
    });

    // Transform formations to use dummyTemplateId for dummies
    const transformedFormations = this.formations.map(formation => 
      formation.map(performer => ({
        x: performer.x,
        y: performer.y,
        user: performer.isDummy ? undefined : performer.id,
        dummyTemplateId: performer.isDummy ? performer.id : undefined,
        customColor: performer.customColor
      }))
    );
    
    const updateData = {
      name: this.segmentName,
      width: this.width,
      depth: this.depth,
      divisions: this.divisions,
      formations: transformedFormations,
      formationDurations: this.formationDurations,
      animationDurations: this.animationDurations,
      formationDrafts: this.formationDrafts,
      stylesInSegment: this.segment.stylesInSegment || [],
      roster: this.segmentRoster.map(user => user._id),
      dummyTemplates: dummyTemplates
    };

    this.segmentService.updateSegment(this.segment._id, updateData).subscribe({
      next: () => {
        this.lastSaveTime = new Date();
        this.isSaving = false;
        
        // TEMPORARILY DISABLED: Check for consistency warnings after saving
        // This might be causing the hang
        // this.checkConsistencyWarnings();
        // this.checkFormationPositioningTips();
      },
      error: (err) => {
        console.error('❌ DEBUG saveSegment: Error saving segment:', err);
        this.isSaving = false;
      }
    });
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
    
    // Show the warning when we're on the formation where the issue occurs
    return segmentWarnings.filter(warning => {
      if (warning.currentSegment === this.segment.name && warning.currentFormationIndex !== undefined) {
        return this.currentFormationIndex === warning.currentFormationIndex;
      }
      if (warning.previousSegment === this.segment.name && warning.previousFormationIndex !== undefined) {
        return this.currentFormationIndex === warning.previousFormationIndex;
      }
      return false;
    });
  }

  getPerformerPath(performerId: string): string {
    const performer = this.performers.find(p => p.id === performerId);
    const prev = this.getPreviousPosition(performerId);
    if (!performer || !prev) return '';
    // Convert feet to pixels and offset x by offstageWidthPx
    const x1 = prev.x * this.pixelsPerFoot + this.offstageWidthPx;
    const y1 = prev.y * this.pixelsPerFoot;
    const x2 = performer.x * this.pixelsPerFoot + this.offstageWidthPx;
    const y2 = performer.y * this.pixelsPerFoot;
    return `M${x1},${y1} L${x2},${y2}`;
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

    // Validate file type
    const supportedTypes = [
      'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/ogg', 'audio/oga', 'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/flac'
    ];
    
    const supportedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!supportedTypes.includes(file.type) && !supportedExtensions.includes(fileExtension)) {
      console.error('Unsupported audio format:', file.type, fileExtension);
      this.uploadError = 'Please select a supported audio file format: MP3, WAV, OGG, M4A, AAC, or FLAC';
      setTimeout(() => this.uploadError = null, 5000); // Clear error after 5 seconds
      return;
    }

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
                  // Show success message
                  this.uploadSuccess = 'Audio file uploaded successfully!';
                  setTimeout(() => this.uploadSuccess = null, 3000); // Clear success after 3 seconds

                  // Get signed URL for playback
                  this.getSignedMusicUrl();
                  this.isUploadingMusic = false;
                },
                error: (err) => {
                  console.error('Error updating segment with music URL:', err);
                  this.uploadError = 'Failed to save audio file. Please try again.';
                  setTimeout(() => this.uploadError = null, 5000);
                  this.isUploadingMusic = false;
                }
              });
            } else {
              console.error('Failed to upload audio file to S3');
              this.uploadError = 'Failed to upload audio file. Please try again.';
              setTimeout(() => this.uploadError = null, 5000);
              this.isUploadingMusic = false;
            }
          } catch (err) {
            console.error('Error uploading audio file:', err);
            this.uploadError = 'Failed to upload audio file. Please try again.';
            setTimeout(() => this.uploadError = null, 5000);
            this.isUploadingMusic = false;
          }
        },
        error: (err) => {
          console.error('Error getting presigned URL:', err);
          this.uploadError = 'Failed to prepare audio upload. Please try again.';
          setTimeout(() => this.uploadError = null, 5000);
          this.isUploadingMusic = false;
        }
      });
    } catch (error) {
      console.error('Unexpected error during audio upload:', error);
      this.uploadError = 'An unexpected error occurred. Please try again.';
      setTimeout(() => this.uploadError = null, 5000);
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
        cursorColor: 'transparent', // Hide WaveSurfer's built-in cursor
        cursorWidth: 0, // Hide WaveSurfer's built-in cursor
        barWidth: 2,
        barRadius: 3,
        height: 40,
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
    setTimeout(() => this.updateMinTimelineZoom(), 200);
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

      // Update formation index and transition state to match current playback time when paused
      let t = 0;
      let found = false;
      for (let i = 0; i < this.formations.length; i++) {
        const hold = this.formationDurations[i] || 4;
        if (this.playbackTime < t + hold) {
          this.playingFormationIndex = i;
          this.currentFormationIndex = i; // Update the displayed formation
          this.inTransition = false;
          this.animatedPositions = {};
          found = true;
          break;
        }
        t += hold;
        if (i < this.animationDurations.length) {
          const trans = this.animationDurations[i] || 1;
          if (this.playbackTime < t + trans) {
            this.playingFormationIndex = i + 1;
            this.currentFormationIndex = i + 1; // Update the displayed formation
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
        this.currentFormationIndex = this.formations.length - 1; // Update the displayed formation
        this.inTransition = false;
        this.animatedPositions = {};
      }
      this.cdr.detectChanges();

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
        
        // Reduce intensive operations during touch gestures to prevent lag
        if (!this.isIntensiveTouchGesture) {
          // Force change detection for playhead update (only when not touching)
          this.cdr.detectChanges();
          
          // Auto-scroll to keep playhead visible during playback (disabled during touch)
          this.autoScrollToPlayhead();
        } else {
          // During intensive touch gestures, only update time sparingly
          if (Math.floor(currentTime * 4) !== Math.floor((currentTime - 0.016) * 4)) {
            // Update only 4 times per second during touch gestures
            this.cdr.detectChanges();
          }
        }
        
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
      
      // Auto-scroll to keep playhead visible during playback
      this.autoScrollToPlayhead();
      
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
    // Don't reset playbackTime - preserve the current position
    // this.playbackTime = 0;
    // Don't reset playingFormationIndex - preserve the current formation
    // this.playingFormationIndex = 0;
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
    document.removeEventListener('click', this.handleDocumentClick.bind(this));
    
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
    
    // Remove cursor drag event listeners
    document.removeEventListener('mousemove', this.onCursorDragMove);
    document.removeEventListener('mouseup', this.onCursorDragEnd);
    
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
    
    // Clean up stage selection event listeners
    if (this.stageMouseMoveListener) {
      this.stageMouseMoveListener();
      this.stageMouseMoveListener = null;
    }
    if (this.stageMouseUpListener) {
      this.stageMouseUpListener();
      this.stageMouseUpListener = null;
    }
    window.removeEventListener('resize', this.updateMinTimelineZoom.bind(this));
  }

  getTimelineTotalDuration(): number {
    // Use audio duration as the source of truth if available
    if (this.waveSurfer && this.waveSurfer.getDuration && this.waveSurfer.getDuration() > 0) {
      return this.waveSurfer.getDuration();
    }
    // Fallback to sum of formation and transition durations
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
    const duration = this.formationDurations[i] || 4;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    return (duration / totalTimelineDuration) * 100;
  }

  getTransitionPercent(i: number): number {
    if (!this.waveSurfer || !this.waveSurfer.getDuration()) return 0;
    const duration = this.animationDurations[i] || 1;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    return (duration / totalTimelineDuration) * 100;
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
    event.preventDefault();
    
    // Save state before starting resize (for undo/redo)
    this.saveState(`Resize formation ${i + 1} duration`);
    
    this.isResizingTimelineElement = true;
    this.resizingFormationIndex = i;
    this.resizingStartX = event.clientX;
    this.resizingStartDuration = this.formationDurations[i] || 4;
    
    // Add event listeners to window to handle drag outside the timeline
    window.addEventListener('mousemove', this.onFormationResizeMove);
    window.addEventListener('mouseup', this.onFormationResizeEnd);
  }

  onFormationResizeMove = (event: MouseEvent) => {
    if (this.resizingFormationIndex === null) return;
    
    event.stopPropagation();
    event.preventDefault();
    
    const dx = event.clientX - this.resizingStartX;
    
    // Account for zoom level in the calculation using pixels per second
    const pixelsToDuration = 1 / (this.pixelsPerSecond * this.timelineZoom);
    
    let newDuration = this.resizingStartDuration + (dx * pixelsToDuration);
    newDuration = Math.max(1, Math.min(100, newDuration));
    
    if (isNaN(newDuration)) {
      return;
    }
    
    this.formationDurations[this.resizingFormationIndex] = newDuration;
    this.formationDurations = [...this.formationDurations]; // force change detection
  };

  onFormationResizeEnd = (event?: MouseEvent) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    this.resizingFormationIndex = null;
    window.removeEventListener('mousemove', this.onFormationResizeMove);
    window.removeEventListener('mouseup', this.onFormationResizeEnd);
    
    // Clear the resize flag after a small delay to ensure all events are processed
    setTimeout(() => {
      this.isResizingTimelineElement = false;
    }, 10);
    
    // Trigger auto-save after formation duration change
    this.triggerAutoSave();
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
    event.preventDefault();
    
    // Save state before starting resize (for undo/redo)
    this.saveState(`Resize transition ${i + 1} duration`);
    
    this.isResizingTimelineElement = true;
    this.resizingTransitionIndex = i;
    this.resizingTransitionStartX = event.clientX;
    this.resizingTransitionStartDuration = this.animationDurations[i] || 1;
    
    // Add event listeners to window to handle drag outside the timeline
    window.addEventListener('mousemove', this.onTransitionResizeMove);
    window.addEventListener('mouseup', this.onTransitionResizeEnd);
  }

  onTransitionResizeMove = (event: MouseEvent) => {
    if (this.resizingTransitionIndex === null) return;
    
    event.stopPropagation();
    event.preventDefault();
    
    const dx = event.clientX - this.resizingTransitionStartX;
    
    // Account for zoom level in the calculation using pixels per second
    const pixelsToDuration = 1 / (this.pixelsPerSecond * this.timelineZoom);
    
    let newDuration = this.resizingTransitionStartDuration + (dx * pixelsToDuration);
    newDuration = Math.max(0.2, newDuration);
    
    if (isNaN(newDuration)) {
      return;
    }
    
    this.animationDurations[this.resizingTransitionIndex] = newDuration;
    this.animationDurations = [...this.animationDurations]; // force change detection
  };

  onTransitionResizeEnd = (event?: MouseEvent) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    this.resizingTransitionIndex = null;
    window.removeEventListener('mousemove', this.onTransitionResizeMove);
    window.removeEventListener('mouseup', this.onTransitionResizeEnd);
    
    // Clear the resize flag after a small delay to ensure all events are processed
    setTimeout(() => {
      this.isResizingTimelineElement = false;
    }, 10);
    
    // Trigger auto-save after transition duration change
    this.triggerAutoSave();
  };

  getTimelinePixelWidth(): number {
    // Get the container width dynamically
    const container = this.timelineBarRef?.nativeElement;
    if (!container) {
      return this.waveformWidthPx * this.timelineZoom; // Fallback to old behavior
    }
    
    const containerWidth = container.offsetWidth;
    this.timelineContainerWidth = containerWidth;
    
    // Get the total timeline duration (audio duration or formation durations)
    const totalDuration = this.getTimelineTotalDuration();
    this.audioDuration = totalDuration;
    
    if (totalDuration <= 0) {
      return containerWidth * this.timelineZoom; // Fallback
    }
    
    // Calculate the base width based on the total duration
    // Use pixels per second to determine the base width
    const baseWidth = totalDuration * this.pixelsPerSecond;
    
    // Apply zoom: timelineZoom = 1 means normal scale, > 1 means zoomed in, < 1 means zoomed out
    return baseWidth * this.timelineZoom;
  }

  getFormationPixelWidth(i: number): number {
    const duration = this.formationDurations[i] || 4;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    
    // Calculate the width based on the formation's proportion of the total timeline duration
    // Use pixels per second to determine the base width
    const baseWidth = duration * this.pixelsPerSecond;
    
    return baseWidth * this.timelineZoom;
  }

  getTransitionPixelWidth(i: number): number {
    const duration = this.animationDurations[i] || 1;
    const totalTimelineDuration = this.getTimelineTotalDuration();
    
    // Calculate the width based on the transition's proportion of the total timeline duration
    // Use pixels per second to determine the base width
    const baseWidth = duration * this.pixelsPerSecond;
    
    return baseWidth * this.timelineZoom;
  }

  getPlayheadPixel(): number {
    let currentTime = this.playbackTime;
    if (this.waveSurfer && typeof this.waveSurfer.getCurrentTime === 'function') {
      currentTime = this.waveSurfer.getCurrentTime();
    }
    const totalWidth = this.getTimelinePixelWidth();
    const totalDuration = this.getTimelineTotalDuration();
    const basePosition = (currentTime / totalDuration) * totalWidth;
    return Math.max(0, Math.min(basePosition, totalWidth));
  }

  getHoveredPlayheadPixel(): number {
    if (this.isPlaying) {
      // During playback, use the current playback time from audio
      return this.getPlayheadPixel();
    }
    if (this.hoveredTimelineX !== null) {
      const totalWidth = this.getTimelinePixelWidth();
      const totalDuration = this.getTimelineTotalDuration();
      if (this.hoveredTimelineTime !== null) {
        const timePercent = this.hoveredTimelineTime / totalDuration;
        return timePercent * totalWidth;
      }
      return Math.max(0, Math.min(this.hoveredTimelineX, totalWidth));
    }
    return this.getPlayheadPixel();
  }

  // Add method to get seek bar circle position (only visible when in view)
  getSeekBarCirclePosition(): number | null {
    const playheadPixel = this.getPlayheadPixel();
    const container = this.timelineBarRef?.nativeElement;
    if (!container) return null;
    
    const containerWidth = container.offsetWidth;
    const scrollLeft = container.scrollLeft || 0;
    
    // Calculate the playhead position relative to the visible area
    const visiblePosition = playheadPixel + scrollLeft;
    
    // Only show the circle if it's in the visible area (with some padding)
    const padding = 20; // pixels of padding
    if (visiblePosition >= -padding && visiblePosition <= containerWidth + padding) {
      return visiblePosition;
    }
    
    // Return null to hide the circle when out of view
    return null;
  }

  async selectPerformer(performer: Performer) {
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
        // Use the new unified method to set selected performer
        this.setSelectedPerformer(performer);
        this.sidePanelMode = 'performer';
      }
    } else {
      // Single selection mode
      this.selectedPerformerIds.clear();
      this.selectedPerformersForPreviousPosition.clear();
      this.selectedPerformerIds.add(performer.id);
      // Use the new unified method to set selected performer
      this.setSelectedPerformer(performer);
      this.sidePanelMode = 'performer';
    }
    
    // Update the performers for previous position display - show previous positions for all selected performers
    this.selectedPerformersForPreviousPosition.clear();
    this.selectedPerformerIds.forEach(id => {
      this.selectedPerformersForPreviousPosition.add(id);
    });
    
    // Store initial positions for all selected performers
    this.selectedPerformersInitialPositions = {};
    this.selectedPerformerIds.forEach(id => {
      const selectedPerformer = this.performers.find(p => p.id === id);
      if (selectedPerformer) {
        this.selectedPerformersInitialPositions[id] = { x: selectedPerformer.x, y: selectedPerformer.y };
      }
    });
    
    // Calculate selection rectangle for multiple performers
    this.calculateSelectionRectangle();
    
    // Trigger auto-save
    this.triggerAutoSave();
  }

  confirmRemovePerformer: boolean = false;

  removePerformer() {
    if (!this.confirmRemovePerformer) {
      this.confirmRemovePerformer = true;
      return;
    }
    if (!this.selectedPerformer) return;
    const performerId = this.selectedPerformer.id;
    const isDummy = this.selectedPerformer.isDummy;
    const performerName = this.selectedPerformer.name || this.selectedPerformer.dummyName || 'Unknown';
    // Save state before making changes
    this.saveState(`Remove performer: ${performerName}`);
    // Remove from all formations
    this.formations = this.formations.map(formation => 
      formation.filter(p => p.id !== performerId)
    );
    // Remove from segment roster if present
    this.segmentRoster = this.segmentRoster.filter(m => m._id !== performerId);
    // If dummy and segment exists, delete dummy template from backend
    if (isDummy && this.segment?._id) {
      this.teamService.deleteDummyTemplate(this.segment._id, performerId).subscribe({
        next: () => console.log('Dummy template deleted from backend'),
        error: (err) => console.error('Failed to delete dummy template from backend', err)
      });
    }
    // Clear selection
    this.selectedPerformerIds.delete(performerId);
    this.selectedPerformersForPreviousPosition.delete(performerId);
    this.selectedPerformerId = null;
    // Switch back to roster panel
    this.sidePanelMode = 'roster';
    this.confirmRemovePerformer = false;
    // Calculate selection rectangle (will clear it since performer was removed)
    this.calculateSelectionRectangle();
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

  // Prevent playhead from moving when hovering or clicking on formations
  onTimelineMouseMove(event: MouseEvent) {
    const bar = this.timelineBarRef?.nativeElement;
    if (!bar) return;
    // If hovering over a formation or transition (or any of their children), do nothing
    const target = event.target as HTMLElement;
    if (target.closest('.formation-timeline-box') || target.closest('.timeline-transition-bar')) return;
    const rect = bar.getBoundingClientRect();
    const x = event.clientX - rect.left + bar.scrollLeft;
    this.hoveredTimelineX = x;
    const totalWidth = this.getTimelinePixelWidth();
    const totalDuration = this.getTimelineTotalDuration();
    const timePercent = Math.max(0, Math.min(1, x / totalWidth));
    this.hoveredTimelineTime = timePercent * totalDuration;
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

  // Prevent playhead from moving when clicking on formations
  onTimelineClick(event: MouseEvent) {
    const bar = this.timelineBarRef?.nativeElement;
    if (!bar) return;
    
    // Don't process timeline clicks if we're in the middle of resizing
    if (this.isResizingTimelineElement) return;
    
    // If clicking on a formation box, transition bar, or any of their children, do not move the playhead
    if ((event.target as HTMLElement).closest('.formation-timeline-box') || 
        (event.target as HTMLElement).closest('.timeline-transition-bar')) return;
    
    const rect = bar.getBoundingClientRect();
    const scrollLeft = bar.scrollLeft || 0;
    const x = event.clientX - rect.left + scrollLeft; // Add scroll offset to get correct position
    const timelineTime = (x / this.getTimelinePixelWidth()) * this.getTimelineTotalDuration();
    
    if (timelineTime !== null) {
      // Handle audio seeking if available
      if (this.waveSurfer && this.waveSurfer.getDuration()) {
        if (this.isMobile) {
          this.initializeMobileAudioContext();
        }
        const audioDuration = this.waveSurfer.getDuration();
        const audioTime = Math.max(0, Math.min(timelineTime, audioDuration));
        this.waveSurfer.seekTo(audioTime / audioDuration);
        this.isPlaying = this.waveSurfer.isPlaying();
        this.playbackTime = audioTime;
        this.hoveredTimelineTime = audioTime;
      } else {
        // No audio: just update playback time and formation position
        this.playbackTime = Math.max(0, Math.min(timelineTime, this.getTimelineTotalDuration()));
        this.hoveredTimelineTime = this.playbackTime;
      }
      
      // Update video if it exists
      const videoElement = this.videoElement;
      if (videoElement) {
        if (this.playbackTime <= videoElement.duration) {
          videoElement.currentTime = this.playbackTime;
        } else {
          videoElement.currentTime = videoElement.duration;
          videoElement.pause();
        }
      }
      
      // Update formation position
      let t = 0;
      for (let i = 0; i < this.formations.length; i++) {
        const formationDuration = this.formationDurations[i] || 4;
        if (this.playbackTime < t + formationDuration) {
          this.playingFormationIndex = i;
          this.inTransition = false;
          this.animatedPositions = {};
          break;
        }
        t += formationDuration;
        if (i < this.animationDurations.length) {
          t += this.animationDurations[i] || 1;
        }
      }
    }
  }

  onTimelineSeekBarClick(event: MouseEvent) {
    const seekBar = event.currentTarget as HTMLElement;
    if (!seekBar) return;

    const rect = seekBar.getBoundingClientRect();
    const scrollLeft = this.timelineBarRef?.nativeElement?.scrollLeft || 0;
    const x = event.clientX - rect.left + scrollLeft; // Add scroll offset to get correct position
    const timelineTime = (x / this.getTimelinePixelWidth()) * this.getTimelineTotalDuration();

    if (timelineTime !== null) {
      // Handle audio seeking if available
      if (this.waveSurfer && this.waveSurfer.getDuration()) {
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
      } else {
        // No audio: just update playback time and formation position
        this.playbackTime = Math.max(0, Math.min(timelineTime, this.getTimelineTotalDuration()));
        this.hoveredTimelineTime = this.playbackTime;
      }

      // Update video position if it exists
      const videoElement = this.videoElement;
      if (videoElement) {
        if (this.playbackTime <= videoElement.duration) {
          videoElement.currentTime = this.playbackTime;
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
        if (this.playbackTime < t + hold) {
          this.updateFormationAndRecalculateSelection(i);
          this.inTransition = false;
          this.animatedPositions = {};
          break;
        }
        t += hold;
        if (i < this.animationDurations.length) {
          const trans = this.animationDurations[i] || 1;
          if (this.playbackTime < t + trans) {
            // During transition, animate between i and i+1
            this.updateFormationAndRecalculateSelection(i + 1);
            this.inTransition = true;
            const progress = (this.playbackTime - t) / trans;
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
    // No audio: animate through formations and update playbackTime smoothly
    if (!this.isPlaying) {
      this.isPlaying = true;
      const totalDuration = this.getTimelineTotalDuration();
      const startTime = performance.now();
      const initialPlaybackTime = this.playbackTime;
      const animate = (now: number) => {
        if (!this.isPlaying) return;
        const elapsed = (now - startTime) / 1000; // seconds
        this.playbackTime = Math.min(initialPlaybackTime + elapsed, totalDuration);
        // Update formation index and transitions
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
        this.cdr.detectChanges();
        if (this.playbackTime < totalDuration && this.isPlaying) {
          this.playbackTimer = requestAnimationFrame(animate);
        } else {
          this.isPlaying = false;
        }
      };
      this.playbackTimer = requestAnimationFrame(animate);
    } else {
      this.isPlaying = false;
      if (this.playbackTimer) {
        cancelAnimationFrame(this.playbackTimer);
        this.playbackTimer = null;
      }
      // Update formation index and transition state to match current playback time
      let t = 0;
      let found = false;
      for (let i = 0; i < this.formations.length; i++) {
        const hold = this.formationDurations[i] || 4;
        if (this.playbackTime < t + hold) {
          this.playingFormationIndex = i;
          this.currentFormationIndex = i; // Update the displayed formation
          this.inTransition = false;
          this.animatedPositions = {};
          found = true;
          break;
        }
        t += hold;
        if (i < this.animationDurations.length) {
          const trans = this.animationDurations[i] || 1;
          if (this.playbackTime < t + trans) {
            this.playingFormationIndex = i + 1;
            this.currentFormationIndex = i + 1; // Update the displayed formation
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
        this.currentFormationIndex = this.formations.length - 1; // Update the displayed formation
        this.inTransition = false;
        this.animatedPositions = {};
      }
      this.cdr.detectChanges();
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
    // Reset save time to show unsaved state
    this.lastSaveTime = null;
    this.saveSubject.next();
  }

  // Add method to force immediate save for new segments
  private forceSaveForNewSegment() {
    if (!this.segment || !this.segment._id) {
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

    const nextDummyNumber = this.getNextDummyNumber();
    const dummyName = `${nextDummyNumber}`;
    const dummyId = `dummy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
    
    // Update previous position tracking
    this.selectedPerformersForPreviousPosition.delete(this.selectedPerformer.id);
    this.selectedPerformersForPreviousPosition.add(dummyPerformer.id);

    // Close the dropdown
    this.showPerformerPairingDropdown = false;

    this.dummyCounter++;
    this.triggerAutoSave();
  }

  convertToUser(user: any) {
    if (!this.selectedPerformer || !this.selectedPerformer.isDummy) return;

    const dummyUserId = this.selectedPerformer.id;
    const userPerformer: Performer = {
      id: user._id,
      name: user.name,
      x: this.selectedPerformer.x,
      y: this.selectedPerformer.y,
      skillLevels: { ...(user.skillLevels || {}) },
      height: user.height || 5.5,
      isDummy: false
    };

    // Replace dummy performer with real user in all formations
    this.formations = this.formations.map(formation =>
      formation.map(p => p.id === dummyUserId ? userPerformer : p)
    );

    // Update selection
    this.selectedPerformerIds.delete(dummyUserId);
    this.selectedPerformerIds.add(userPerformer.id);
    this.selectedPerformerId = userPerformer.id;
    
    // Update previous position tracking
    this.selectedPerformersForPreviousPosition.delete(dummyUserId);
    this.selectedPerformersForPreviousPosition.add(userPerformer.id);

    // Close the dropdown
    this.showPerformerPairingDropdown = false;

    // Note: Dummy templates are now handled automatically by the backend
    // No need to manually delete dummy users

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
        next: (res) => {
          this.refreshTeamRoster(); // Refresh roster after update
          console.log('Height updated:', res);
        },
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
    // Handle Escape key to close context menu or clear previous positions
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.showFormationContextMenu) {
        this.closeFormationContextMenu();
      } else {
        this.clearAllPreviousPositions();
      }
      return;
    }
    
    // Handle shift key for multi-selection
    if (event.key === 'Shift') {
      this.isShiftPressed = true;
    }
    
    // Handle command key for multi-selection on Mac
    if (event.key === 'Meta' || event.key === 'Command') {
      this.isCommandPressed = true;
    }
    
    // Handle arrow keys for formation navigation
    if (event.key === 'ArrowLeft' && !this.inTransition) {
      event.preventDefault();
      this.prevFormation();
    } else if (event.key === 'ArrowRight' && !this.inTransition) {
      event.preventDefault();
      this.onNextFormationClick();
    }
    
    // Handle copy/paste shortcuts
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      event.preventDefault();
      this.copySelectedPerformers();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      event.preventDefault();
      this.pastePerformers();
    }
    
    // Handle delete key for removing performers
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedPerformerIds.size > 0) {
        event.preventDefault();
        if (!this.confirmRemovePerformer) {
          this.confirmRemovePerformer = true;
          return;
        }
        // Remove selected performers from current formation
        const currentFormation = this.formations[this.currentFormationIndex];
        this.selectedPerformerIds.forEach(performerId => {
          const index = currentFormation.findIndex(p => p.id === performerId);
          if (index !== -1) {
            currentFormation.splice(index, 1);
          }
        });
        this.selectedPerformerIds.clear();
        this.confirmRemovePerformer = false;
        this.triggerAutoSave();
      }
    }
    
    // Handle spacebar for play/pause
    if (event.key === ' ' || event.code === 'Space') {
      // Only trigger if not focused on an input, textarea, or button
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'BUTTON' || (active as HTMLElement).isContentEditable)) {
        return;
      }
      event.preventDefault();
      this.onControlBarPlayPause();
      return;
    }
  }

  handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      this.isShiftPressed = false;
    } else if (event.key === 'Meta' || event.key === 'Command' || event.key === 'Control') {
      this.isCommandPressed = false;
    }
    
    // If we're no longer in multi-selection mode and rectangle-based multi-selection is enabled,
    // clear the rectangle-based multi-selection
    if (!this.isMultiSelectionEnabled() && this.multiSelectionEnabledByRectangle) {
      this.multiSelectionEnabledByRectangle = false;
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
    // Don't clear selections if we just finished a rectangular selection
    if (this.justFinishedSelection) {
      return;
    }
    
    // Check if the click is within the stage area but not on a performer
    const target = event.target as HTMLElement;
    const stageElement = this.stageRef.nativeElement;
    
    // Check if the click is within the stage area
    if (stageElement.contains(target)) {
      // Check if the click is NOT on a performer (performer elements have the 'performer' class)
      const isPerformerClick = target.closest('.performer') !== null;
      
      if (!isPerformerClick) {
        this.selectedPerformerIds.clear();
        this.selectedPerformersForPreviousPosition.clear();
        this.selectedPerformerId = null;
        this.multiSelectionEnabledByRectangle = false; // Always clear rectangle-based multi-selection
        // Clear the previous position display when clicking on stage
        this.selectedPerformerForPreviousPosition = null;
        
        // Calculate selection rectangle (will clear it since no performers are selected)
        this.calculateSelectionRectangle();
        
        this.triggerAutoSave();
        // Switch to roster mode when deselecting
        this.sidePanelMode = 'roster';
      }
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
    
    // Save state before making changes
    this.saveState(`Delete formation ${index + 1}`);
    
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
    
    // Trigger auto-save after deleting formation
    this.triggerAutoSave();
  }

  duplicateFormation(index: number) {
    if (!this.isCaptain || this.formations.length === 0) return;
    
    // Save state before making changes
    this.saveState(`Duplicate formation ${index + 1}`);
    
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
    
    // Trigger auto-save after duplicating formation
    this.triggerAutoSave();
  }

  createFormationDraft(formationIndex: number) {
    if (!this.isCaptain || formationIndex < 0 || formationIndex >= this.formations.length) return;
    
    // Don't create draft if one already exists
    if (this.formationDrafts[formationIndex]) {
      console.log(`Draft already exists for formation ${formationIndex + 1}`);
      return;
    }
    
    // Save state before making changes
    this.saveState(`Create draft for formation ${formationIndex + 1}`);
    
    // Create a deep copy of the current main formation
    const currentFormation = this.formations[formationIndex];
    const draftFormation = currentFormation.map(performer => ({
      ...performer,
      skillLevels: { ...performer.skillLevels }
    }));
    
    // Generate unique ID for the draft
    const draftId = `draft_${formationIndex}_${Date.now()}`;
    
    // Create the draft object
    const newDraft: FormationDraft = {
      id: draftId,
      formation: draftFormation,
      createdAt: new Date(),
      isMain: false, // New draft is not main by default
      name: `Draft ${formationIndex + 1}`
    };
    
    // Set the single draft
    this.formationDrafts[formationIndex] = newDraft;
    
    // Initially, the original data is in main position and draft data is in draft position
    this.isDraftDataInMainPosition[formationIndex] = false;
    
    // Automatically switch to viewing the draft after creation
    this.jumpToFormation(formationIndex, true);
    
    // Save the segment
    if (this.segment?._id) {
      this.saveSegment();
    } else {
      this.triggerAutoSave();
    }
    
    console.log(`Created draft for formation ${formationIndex + 1}:`, newDraft);
  }

  // Check if a formation has a draft
  hasDraft(formationIndex: number): boolean {
    return !!this.formationDrafts[formationIndex];
  }

  // Check if any formation has drafts (for expanding timeline height)
  hasAnyDrafts(): boolean {
    return Object.keys(this.formationDrafts).length > 0;
  }

  // Determine if the main formation should be colored as purple (contains draft data)
  isMainFormationDraftColored(formationIndex: number): boolean {
    return this.isDraftDataInMainPosition[formationIndex] === true;
  }

  // Determine if the draft formation should be colored as purple (contains draft data)  
  isDraftFormationDraftColored(formationIndex: number): boolean {
    return this.isDraftDataInMainPosition[formationIndex] === false;
  }



  // Updated jumpToFormation to handle draft viewing
  jumpToFormation(index: number, isDraft: boolean = false) {
    if (index < 0 || index >= this.formations.length) return;
    
    this.currentFormationIndex = index;
    this.playingFormationIndex = index;
    this.isViewingDraft = isDraft;
    
    // Force change detection to update the stage immediately
    this.formations = [...this.formations];
    this.cdr.detectChanges();
    
    console.log(`🎯 JUMP TO FORMATION:`, {
      index: index + 1,
      isDraft,
      isViewingDraft: this.isViewingDraft,
      hasDraftForIndex: this.hasDraft(index),
      currentPerformersCount: this.performers.length,
      performersSource: isDraft ? 'DRAFT' : 'MAIN'
    });
  }

  // Removed duplicate performers getter

  // Method to make a draft the main formation (swap them)
  makeMainDraft(formationIndex: number, event: Event) {
    event.stopPropagation();

    if (!this.formationDrafts[formationIndex]) {
      return;
    }

    // Save state before making changes
    this.saveState(`Swap draft and main for formation ${formationIndex + 1}`);

      // Swap the positions by making the draft become the new main formation (moves to top/main position)
    const draftData = this.formationDrafts[formationIndex];
    const mainData = this.formations[formationIndex];
    
    // The current draft becomes the new main formation (moves to top/main position)
    this.formations[formationIndex] = draftData.formation.map(performer => ({
      ...performer,
      skillLevels: { ...performer.skillLevels }
    }));
    
    // The current main becomes the new draft (moves to bottom/draft position)  
    this.formationDrafts[formationIndex] = {
      ...draftData,
      formation: mainData.map(performer => ({
        ...performer,
        skillLevels: { ...performer.skillLevels }
      })),
      id: `draft_${formationIndex}_${Date.now()}` // Generate new ID for the new draft
    };
    


    // Toggle which data type is in the main position  
    this.isDraftDataInMainPosition[formationIndex] = !this.isDraftDataInMainPosition[formationIndex];
    
    // Switch to viewing the main formation (which now contains the swapped data)
    this.isViewingDraft = false;
    
    // Force change detection by creating new references
    this.formations = [...this.formations];
    this.formationDrafts = { ...this.formationDrafts };
    this.cdr.detectChanges();

    // Save the segment
    if (this.segment?._id) {
      this.saveSegment();
    } else {
      this.triggerAutoSave();
    }

    console.log(`Swapped draft and main for formation ${formationIndex + 1} - purple content moved to main (top), yellow content moved to draft (bottom)`);
  }

  // Method to delete a draft
  deleteDraft(formationIndex: number, event: Event) {
    event.stopPropagation();

    if (!this.formationDrafts[formationIndex]) {
      return;
    }

    const draft = this.formationDrafts[formationIndex];

    if (!confirm(`Are you sure you want to delete draft for formation ${formationIndex + 1}?`)) {
      return;
    }

    // Save state before deleting
    this.saveState(`Delete draft for formation ${formationIndex + 1}`);

    // If we were viewing this draft, switch back to main formation
    if (this.isViewingDraft && this.currentFormationIndex === formationIndex) {
      this.isViewingDraft = false;
    }

    // Remove the draft
    delete this.formationDrafts[formationIndex];
    
    // Clean up tracking (no longer needed since there's no draft)
    delete this.isDraftDataInMainPosition[formationIndex];

    // Force change detection
    this.formations = [...this.formations];

    // Save the segment
    if (this.segment?._id) {
      this.saveSegment();
    } else {
      this.triggerAutoSave();
    }

    console.log(`Deleted draft for formation ${formationIndex + 1}`);
  }

  private updateStageTransform() {
    const stageArea = this.stageRef?.nativeElement;
    if (!stageArea) return;

    stageArea.style.transform = this.getStageTransform();
    // On mobile use top-left so the whole scaled stage starts at the left edge
    stageArea.style.transformOrigin = this.isMobile ? 'top left' : 'center center';
  }

  private enforcePanBounds() {
    const stageArea = this.stageRef?.nativeElement;
    if (!stageArea) return;

    const rect = stageArea.getBoundingClientRect(); // already scaled by CSS transform
    const scale = this.currentZoom || 1;

    // Base (un-scaled) size of the area
    const baseWidth = rect.width / scale;
    const baseHeight = rect.height / scale;

    const excessWidth = rect.width - baseWidth;   // extra pixels gained by zoom
    const excessHeight = rect.height - baseHeight;

    const maxX = excessWidth / 2;
    const maxY = excessHeight / 2;

    // Allow users to drag further in any direction (one extra container size)
    const horizontalAllowance = rect.width;
    const verticalAllowance = rect.height;

    const allowedX = maxX + horizontalAllowance;
    const allowedY = maxY + verticalAllowance;

    this.currentTranslateX = Math.max(-allowedX, Math.min(allowedX, this.currentTranslateX));
    this.currentTranslateY = Math.max(-allowedY, Math.min(allowedY, this.currentTranslateY));
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
    this.curtainMeshes = []; // Track curtain meshes for cleanup
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

    // Add curtains offstage on every horizontal line
    this.addCurtainsTo3DScene();

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
          context.fillText(this.formatPerformerName(performer.name), 256, 80); // Adjusted position for new canvas size
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
      videoTexture.format = THREE.RGBAFormat;

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
      videoTexture.format = THREE.RGBAFormat;

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

    // Use the entire stage-container as the interaction surface
    const container = stageArea.parentElement || stageArea;

    // Mouse-wheel / track-pad gestures
    container.addEventListener('wheel', (event: WheelEvent) => {
      // Trackpad pinch gestures on most browsers fire wheel events with ctrlKey === true.
      // We only want to treat those as zoom. Regular two-finger scrolls should be allowed
      // to perform their default behaviour (i.e. page scroll / pan around the interface).

      if (event.ctrlKey) {
        // Pinch-to-zoom (track-pad) → handle zoom.
        event.preventDefault();

        const now = Date.now();
        if (now - this.lastZoomTime < this.zoomDebounceTime) return;
        this.lastZoomTime = now;

        const delta = event.deltaY > 0 ? -this.zoomStep : this.zoomStep;
        this.zoomAtPoint(event.clientX, event.clientY, delta);
      } else {
        // Two-finger scroll → pan (look around) instead of scrolling the whole page.
        event.preventDefault();

        // Mark as intensive gesture for pan operations
        this.isIntensiveTouchGesture = true;
        
        // Apply sensitivity factors and normalize by current zoom so feel is consistent.
        const scale = this.currentZoom || 1;
        this.currentTranslateX -= (event.deltaX * this.panSensitivityX) / scale;
        this.currentTranslateY -= (event.deltaY * this.panSensitivityY) / scale;

        this.enforcePanBounds();
        
        // Use requestAnimationFrame to batch transform updates for pan gestures too
        if (!this.touchTransformPending) {
          this.touchTransformPending = true;
          requestAnimationFrame(() => {
            this.updateStageTransform();
            this.touchTransformPending = false;
          });
        }
        
        // Reset intensive gesture flag after a delay
        setTimeout(() => {
          this.isIntensiveTouchGesture = false;
        }, 100);
      }
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

      // Throttle touch events to prevent performance issues
      const now = Date.now();
      if (now - this.lastTouchEventTime < this.touchEventThrottle) {
        return;
      }
      this.lastTouchEventTime = now;

      // Mark as intensive gesture when moving rapidly
      this.isIntensiveTouchGesture = true;
      
      const currentDistance = this.getTouchDistance(event.touches);
      const currentX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const currentY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

      const zoomDelta = (currentDistance - this.touchStartDistance) * 0.01;
      
      // Use requestAnimationFrame to batch transform updates
      if (!this.touchTransformPending) {
        this.touchTransformPending = true;
        requestAnimationFrame(() => {
          this.zoomAtPoint(currentX, currentY, zoomDelta);
          this.touchTransformPending = false;
        });
      }

      this.touchStartDistance = currentDistance;
      this.touchStartX = currentX;
      this.touchStartY = currentY;
    }, { passive: false });

    stageArea.addEventListener('touchend', () => {
      this.isPinching = false;
      // Reset intensive gesture flag after a delay
      setTimeout(() => {
        this.isIntensiveTouchGesture = false;
      }, 100);
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

    // Adjust translation so the zoom focuses on the point under the cursor / touch-midpoint.
    const container = this.stageRef.nativeElement.parentElement || this.stageRef.nativeElement;
    const rect = container.getBoundingClientRect();

    const x = clientX - rect.left; // position inside container (px)
    const y = clientY - rect.top;

    // Existing translate components (before zoom)
    const prevScale = this.currentZoom;
    const prevTx = this.currentTranslateX;
    const prevTy = this.currentTranslateY + this.stageVerticalOffset; // include vertical slider offset

    // World coordinates of the focus point before zoom
    const worldX = (x / prevScale) - prevTx;
    const worldY = (y / prevScale) - prevTy;

    // New translation so that world point stays under the same screen position
    const newTx = (x / newZoom) - worldX;
    const newTotalTy = (y / newZoom) - worldY; // includes slider offset

    this.currentTranslateX = newTx;
    this.currentTranslateY = newTotalTy - this.stageVerticalOffset;

    // Clamp inside bounds and apply
    this.enforcePanBounds();
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

  // Add method to get formation drag style
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
    
    // Force change detection to update all timeline elements
    this.cdr.detectChanges();
    
    // Ensure WaveSurfer waveform is updated if it exists
    if (this.waveSurfer && this.waveSurfer.getDuration()) {
      // Trigger a small delay to ensure DOM updates are complete
      setTimeout(() => {
        this.cdr.detectChanges();
      }, 10);
    }
  }

  onControlBarZoomChange(newZoom: number) {
    this.timelineZoom = newZoom;
    this.onTimelineZoomChange({ target: { value: newZoom.toString() } } as any);
  }

  // Add method to handle zoom gestures (pinch-to-zoom, mouse wheel)
  onTimelineZoomGesture(delta: number, centerX: number) {
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    const newZoom = Math.max(this.minTimelineZoom, Math.min(this.maxTimelineZoom, this.timelineZoom * zoomFactor));
    
    if (newZoom !== this.timelineZoom) {
      this.timelineZoom = newZoom;
      
      // Force recalculation of timeline widths
      this.formationDurations = [...this.formationDurations];
      this.animationDurations = [...this.animationDurations];
      
      // Force change detection
      this.cdr.detectChanges();
    }
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

  // New methods for top panel functionality
  toggleStageToolsDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.showStageToolsDropdown = !this.showStageToolsDropdown;
  }

  toggleShowTransitions() {
    this.showTransitions = !this.showTransitions;
    // Here you would implement the logic to show/hide performer transitions
    // This could involve showing previous positions or transition paths on all formations
  }

  navigateToEditRoster() {
    // Navigate to edit roster page
    this.router.navigate(['/edit-roster']);
  }

  // Load all segments to enable prev/next navigation
  private loadAllSegments() {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.team?._id) {
      this.segmentService.getSegmentsForTeam(currentUser.team._id).subscribe({
        next: (res) => {
          // Sort segments by segmentOrder
          this.allSegments = res.segments.sort((a, b) => {
            if (a.segmentOrder !== undefined && b.segmentOrder !== undefined) {
              return a.segmentOrder - b.segmentOrder;
            } else if (a.segmentOrder !== undefined) {
              return -1;
            } else if (b.segmentOrder !== undefined) {
              return 1;
            } else {
              return a._id.localeCompare(b._id);
            }
          });
          
          // Find current segment index
          if (this.segment?._id) {
            this.currentSegmentIndex = this.allSegments.findIndex(s => s._id === this.segment._id);
          }
        },
        error: (err) => {
          console.error('Failed to load segments:', err);
        }
      });
    }
  }

  canNavigateToPrevSegment(): boolean {
    return this.currentSegmentIndex > 0;
  }

  canNavigateToNextSegment(): boolean {
    return this.currentSegmentIndex >= 0 && this.currentSegmentIndex < this.allSegments.length - 1;
  }

  navigateToPrevSegment() {
    if (this.canNavigateToPrevSegment()) {
      const prevSegment = this.allSegments[this.currentSegmentIndex - 1];
      this.router.navigate(['/create-segment'], { queryParams: { id: prevSegment._id } });
    }
  }

  navigateToNextSegment() {
    if (this.canNavigateToNextSegment()) {
      const nextSegment = this.allSegments[this.currentSegmentIndex + 1];
      this.router.navigate(['/create-segment'], { queryParams: { id: nextSegment._id } });
    }
  }

  handleDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.stage-tools-dropdown')) {
      this.showStageToolsDropdown = false;
    }
    if (!target.closest('.remove-performer-btn')) {
      this.confirmRemovePerformer = false;
    }
  }

  triggerAudioUpload() {
    if (this.audioFileInput) {
      this.audioFileInput.nativeElement.click();
    }
  }

  triggerBackdropUpload() {
    if (this.backdropFileInput) {
      this.backdropFileInput.nativeElement.click();
    }
  }

  handleBackdropClick() {
    if (this.isProAccount) {
      this.triggerBackdropUpload();
    } else {
      this.showProPopup = true;
    }
  }

  closeProPopup() {
    this.showProPopup = false;
  }

  upgradeToPro() {
    // Navigate to membership plan page or handle upgrade
    this.router.navigate(['/membership-plan']);
    this.closeProPopup();
  }

  toggleViewOptions() {
    // This could be used for additional view options in the future
    console.log('View options clicked');
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
      this.updateStageTransform();
    });
  }

  // Update the existing getStageTransform method
  getStageTransform(): string {
    const scale = this.currentZoom || 1;
    // Combine slider vertical offset with pan amount
    const translateX = this.currentTranslateX || 0;
    const translateY = (this.stageVerticalOffset || 0) + (this.currentTranslateY || 0);
    return `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  // Add logic to delete all dummies when deleting a segment
  deleteSegment() {
    if (!this.segment?._id) return;
    
    // Delete the segment directly - dummy templates will be cleaned up automatically by the backend
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

    // Custom color takes precedence over skill-based color
    if (performer.customColor) {

      return performer.customColor;
    }
    

    // Fall back to skill-based color or default
    const skillColor = this.getSkillColor(performer);

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

    // Main verticals (8 sections, 9 lines) - main stage only
    for (let i = 0; i <= 8; i++) {
      gridPositionsX.push((i / 8) * this.width);
    }
    // Subgrid verticals - main stage only
    for (let i = 0; i < 8; i++) {
      const start = (i / 8) * this.width;
      const end = ((i + 1) / 8) * this.width;
      for (let d = 1; d <= this.divisions; d++) {
        gridPositionsX.push(start + ((end - start) * d) / (this.divisions + 1));
      }
    }
    
    // Add grid points for offstage left area (from -offstageWidth to 0)
    for (let i = 0; i <= 8; i++) {
      gridPositionsX.push(-this.offstageWidth + (i / 8) * this.offstageWidth);
    }
    // Subgrid for offstage left
    for (let i = 0; i < 8; i++) {
      const start = -this.offstageWidth + (i / 8) * this.offstageWidth;
      const end = -this.offstageWidth + ((i + 1) / 8) * this.offstageWidth;
      for (let d = 1; d <= this.divisions; d++) {
        gridPositionsX.push(start + ((end - start) * d) / (this.divisions + 1));
      }
    }
    
    // Add grid points for offstage right area (from width to width + offstageWidth)
    for (let i = 0; i <= 8; i++) {
      gridPositionsX.push(this.width + (i / 8) * this.offstageWidth);
    }
    // Subgrid for offstage right
    for (let i = 0; i < 8; i++) {
      const start = this.width + (i / 8) * this.offstageWidth;
      const end = this.width + ((i + 1) / 8) * this.offstageWidth;
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

    // NEW LOGIC: Prioritize offstage (side-stage) spots for new performers
    const isOffstage = (p: { x: number; y: number }) => p.x < 0 || p.x > this.width;
    const offstagePositions = allGridPositions.filter(isOffstage);
    const onstagePositions = allGridPositions.filter(p => !isOffstage(p));

    const tryFindPosition = (positions: { x: number; y: number }[]) => {
      for (const pos of positions) {
        const isAvailable = this.performers.every(per => {
          const distance = Math.sqrt(
            Math.pow(per.x - pos.x, 2) + Math.pow(per.y - pos.y, 2)
          );
          return distance >= minDistance;
        });
        if (isAvailable) {
          return pos;
        }
      }
      return null;
    };

    let candidate = tryFindPosition(offstagePositions);
    if (candidate) {
      return { x: candidate.x, y: candidate.y };
    }

    candidate = tryFindPosition(onstagePositions);
    if (candidate) {
      return { x: candidate.x, y: candidate.y };
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
      
      // Check if position is within stage boundaries (including offstage areas)
      if (x >= -this.offstageWidth && x <= this.width + this.offstageWidth && y >= 0 && y <= this.depth) {
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
    return this.isShiftPressed || this.isCommandPressed || this.multiSelectionEnabledByRectangle;
  }

  // Reset key states when window loses focus
  private resetKeyStates() {
    this.isShiftPressed = false;
    this.isCommandPressed = false;
    this.multiSelectionEnabledByRectangle = false; // Clear rectangle-based multi-selection
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

  // New method to properly set selected performer and update all related state
  private setSelectedPerformer(performer: Performer) {
    // Set the selected performer ID
    this.selectedPerformerId = performer.id;
    
    // Clear skill cache when selection changes
    this.clearSelectedUserCache();
    
    // Update height fields
    try {
      console.log('🎯 DEBUG setSelectedPerformer: Updating height data...');
      // Get the most up-to-date user data from team roster
      const currentUser = this.teamRoster && this.teamRoster.length > 0 ? 
        this.teamRoster.find(m => m._id === performer.id) : null;
      const heightToUse = currentUser?.height || performer.height;

      const heightData = this.getHeightInFeetAndInches(heightToUse);
      this.selectedPerformerFeet = heightData.feet;
      this.selectedPerformerInches = heightData.inches;
      console.log('🎯 DEBUG setSelectedPerformer: Height updated:', heightData);
    } catch (heightError) {
      console.error('❌ DEBUG Error updating height data:', heightError);
      // Use default values if height calculation fails
      this.selectedPerformerFeet = 5;
      this.selectedPerformerInches = 6;
    }
    
    console.log('✅ DEBUG setSelectedPerformer completed for:', performer.name);
    // Set editable name
    this.editablePerformerName = performer.name;
  }

  /**
   * Copy selected performers' positions and properties
   */
  copySelectedPerformers() {
    if (this.selectedPerformerIds.size === 0) return;
    
    this.copiedPerformers = [];
    const currentFormation = this.formations[this.currentFormationIndex];
    
    this.selectedPerformerIds.forEach(performerId => {
      const performer = currentFormation.find(p => p.id === performerId);
      if (performer) {
        this.copiedPerformers.push({
          id: performer.id,
          name: performer.name,
          x: performer.x,
          y: performer.y,
          skillLevels: { ...performer.skillLevels },
          height: performer.height,
          isDummy: performer.isDummy,
          customColor: performer.customColor
        });
      }
    });
    
    this.hasCopiedPerformers = this.copiedPerformers.length > 0;
    console.log(`Copied ${this.copiedPerformers.length} performers`);
  }

  /**
   * Paste copied performers' positions to the current formation
   */
  pastePerformers() {
    if (!this.hasCopiedPerformers || this.copiedPerformers.length === 0) return;
    
    const currentFormation = this.formations[this.currentFormationIndex];
    
    this.copiedPerformers.forEach(copiedPerformer => {
      // Find the performer in the current formation
      const existingPerformer = currentFormation.find(p => p.id === copiedPerformer.id);
      
      if (existingPerformer) {
        // Update position and properties
        existingPerformer.x = copiedPerformer.x;
        existingPerformer.y = copiedPerformer.y;
        existingPerformer.skillLevels = { ...copiedPerformer.skillLevels };
        existingPerformer.height = copiedPerformer.height;
        existingPerformer.customColor = copiedPerformer.customColor;
      } else {
        // If performer doesn't exist in this formation, add them
        currentFormation.push({
          id: copiedPerformer.id,
          name: copiedPerformer.name,
          x: copiedPerformer.x,
          y: copiedPerformer.y,
          skillLevels: { ...copiedPerformer.skillLevels },
          height: copiedPerformer.height,
          isDummy: copiedPerformer.isDummy,
          customColor: copiedPerformer.customColor
        });
      }
    });
    
    // Clear selection and trigger auto-save
    this.selectedPerformerIds.clear();
    this.selectedPerformersForPreviousPosition.clear();
    this.triggerAutoSave();
    
    console.log(`Pasted ${this.copiedPerformers.length} performers to formation ${this.currentFormationIndex + 1}`);
  }

  /**
   * Check if paste is available (has copied performers)
   */
  canPaste(): boolean {
    return this.hasCopiedPerformers && this.copiedPerformers.length > 0;
  }

  // Undo/Redo implementation
  private saveState(action: string) {
    // Create a deep copy of the current state
    const currentState: SegmentState = {
      formations: this.formations.map(formation => formation.map(performer => ({ ...performer, skillLevels: { ...performer.skillLevels } }))),
      formationDurations: [...this.formationDurations],
      animationDurations: [...this.animationDurations],
      currentFormationIndex: this.currentFormationIndex,
      timestamp: Date.now(),
      action: action
    };

    // Add to undo stack
    this.undoStack.push(currentState);

    // Limit undo stack size
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift(); // Remove oldest state
    }

    // Clear redo stack when new action is performed
    this.redoStack = [];

    // Update button states
    this.updateUndoRedoStates();
  }

  private restoreState(state: SegmentState) {
    // Restore the state
    this.formations = state.formations.map(formation => formation.map(performer => ({ ...performer, skillLevels: { ...performer.skillLevels } })));
    this.formationDurations = [...state.formationDurations];
    this.animationDurations = [...state.animationDurations];
    this.currentFormationIndex = state.currentFormationIndex;

    // Force change detection
    this.formations = [...this.formations];
    this.formationDurations = [...this.formationDurations];
    this.animationDurations = [...this.animationDurations];

    // Update timeline and playback
    this.goToFormation(this.currentFormationIndex);

    // Save the restored state (without creating undo history)
    if (this.segment?._id) {
      this.saveSegment();
    } else {
      this.triggerAutoSave();
    }
  }

  private updateUndoRedoStates() {
    this.canUndo = this.undoStack.length > 0;
    this.canRedo = this.redoStack.length > 0;
  }

  // Control bar event handlers
  onControlBarUndo() {
    if (!this.canUndo || this.undoStack.length === 0) return;

    // Save current state to redo stack before undoing
    const currentState: SegmentState = {
      formations: this.formations.map(formation => formation.map(performer => ({ ...performer, skillLevels: { ...performer.skillLevels } }))),
      formationDurations: [...this.formationDurations],
      animationDurations: [...this.animationDurations],
      currentFormationIndex: this.currentFormationIndex,
      timestamp: Date.now(),
      action: 'Current state before undo'
    };
    this.redoStack.push(currentState);

    // Get and restore previous state
    const previousState = this.undoStack.pop()!;
    this.restoreState(previousState);

    // Update button states
    this.updateUndoRedoStates();

    console.log(`Undid action: ${previousState.action}`);
  }

  onControlBarRedo() {
    if (!this.canRedo || this.redoStack.length === 0) return;

    // Save current state to undo stack before redoing
    const currentState: SegmentState = {
      formations: this.formations.map(formation => formation.map(performer => ({ ...performer, skillLevels: { ...performer.skillLevels } }))),
      formationDurations: [...this.formationDurations],
      animationDurations: [...this.animationDurations],
      currentFormationIndex: this.currentFormationIndex,
      timestamp: Date.now(),
      action: 'Current state before redo'
    };
    this.undoStack.push(currentState);

    // Get and restore next state
    const nextState = this.redoStack.pop()!;
    this.restoreState(nextState);

    // Update button states
    this.updateUndoRedoStates();

    console.log(`Redid action: ${nextState.action}`);
  }

  onControlBarQuickSwap() {
    this.swapSelectedPerformers();
  }

  onControlBarPlayPause() {
    this.toggleUnifiedPlay();
  }

  onControlBarPrevFormation() {
    this.prevFormation();
  }

  onControlBarNextFormation() {
    this.onNextFormationClick();
  }
  

  onControlBarAddFormation() {
    this.addFormation();
  }

  onControlBarDuplicateFormation() {
    if (this.currentFormationIndex !== null) {
      this.duplicateFormation(this.currentFormationIndex);
    }
  }

  // Formation context menu methods
  onFormationRightClick(event: MouseEvent, formationIndex: number) {
    if (!this.isCaptain) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // Calculate menu position to keep it on screen
    const menuWidth = 180; // Compact menu width
    const menuHeight = 160; // Compact menu height
    const padding = 10; // Padding from screen edges
    
    let x = event.clientX;
    let y = event.clientY;
    
    // Keep menu within screen bounds
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (x < padding) {
      x = padding;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }
    if (y < padding) {
      y = padding;
    }
    
    this.contextMenuPosition = { x, y };
    this.selectedFormationIndex = formationIndex;
    this.showFormationContextMenu = true;
  }

  closeFormationContextMenu() {
    this.showFormationContextMenu = false;
    this.selectedFormationIndex = -1;
  }

  onContextMenuSplit() {
    this.splitFormation(this.selectedFormationIndex);
    this.closeFormationContextMenu();
  }

  onContextMenuDuplicate() {
    this.duplicateFormation(this.selectedFormationIndex);
    this.closeFormationContextMenu();
  }

  onContextMenuCopy() {
    // Jump to the formation first to ensure we're copying from the right formation
    this.jumpToFormation(this.selectedFormationIndex, false);
    
    // Copy all performers in the formation (select all first)
    const currentFormation = this.formations[this.selectedFormationIndex];
    this.selectedPerformerIds.clear();
    currentFormation.forEach(performer => {
      this.selectedPerformerIds.add(performer.id);
    });
    
    this.copySelectedPerformers();
    this.closeFormationContextMenu();
  }

  onContextMenuPaste() {
    // Jump to the formation first
    this.jumpToFormation(this.selectedFormationIndex, false);
    this.pastePerformers();
    this.closeFormationContextMenu();
  }

  splitFormation(formationIndex: number) {
    if (!this.isCaptain || formationIndex < 0 || formationIndex >= this.formations.length) return;
    
    // Save state before making changes
    this.saveState(`Split formation ${formationIndex + 1}`);
    
    // Get the current formation to split
    const currentFormation = this.formations[formationIndex];
    
    // Create a deep copy of the current formation for the new formation
    const newFormation = currentFormation.map(performer => ({
      ...performer,
      x: performer.x,
      y: performer.y,
      skillLevels: { ...performer.skillLevels },
      height: performer.height,
      isDummy: performer.isDummy,
      dummyName: performer.dummyName,
      customColor: performer.customColor
    }));
    
    // Insert the new formation right after the current one
    this.formations.splice(formationIndex + 1, 0, newFormation);
    
    // Set duration for the new formation (copy from original)
    const originalDuration = this.formationDurations[formationIndex] || 5;
    this.formationDurations.splice(formationIndex + 1, 0, originalDuration);
    
    // Add a 2-second transition between the split formations
    this.animationDurations.splice(formationIndex, 0, 2);
    
    // Ensure we have the right number of animation durations
    while (this.animationDurations.length < this.formations.length - 1) {
      this.animationDurations.push(2);
    }
    
    // Force change detection
    this.formations = [...this.formations];
    this.formationDurations = [...this.formationDurations];
    this.animationDurations = [...this.animationDurations];
    
    // Save the segment
    if (this.segment?._id) {
      this.saveSegment();
    } else {
      this.triggerAutoSave();
    }
    
    console.log(`Split formation ${formationIndex + 1} - created formation ${formationIndex + 2} with 2s transition`);
  }

  onControlBarDeleteFormation() {
    this.deleteFormation(this.currentFormationIndex);
  }

  onControlBarCreateDraft() {
    this.createFormationDraft(this.currentFormationIndex);
  }

  onControlBarMirrorModeToggle() {
    this.isMirrorModeEnabled = !this.isMirrorModeEnabled;
  }

  /**
   * Find the mirror performer for a given performer ID
   * Mirror is determined by finding the performer at the EXACT mirrored X position (across center line)
   * with the EXACT same Y position
   */
  private findMirrorPerformer(performerId: string): Performer | null {
    if (!this.isMirrorModeEnabled) {
      console.log('🚫 Mirror mode not enabled');
      return null;
    }
    
    const performer = this.performers.find(p => p.id === performerId);
    if (!performer) {
      console.log('🚫 Performer not found:', performerId);
      return null;
    }
    
    const centerX = this.width / 2;
    // Calculate mirror X position: distance from center on opposite side
    const distanceFromCenter = performer.x - centerX;
    const mirrorX = centerX - distanceFromCenter; // This is equivalent to: 2 * centerX - performer.x
    
    console.log(`🔍 MIRROR DEBUG for ${performer.name}:`, {
      performerX: performer.x,
      performerY: performer.y,
      stageWidth: this.width,
      centerX: centerX,
      distanceFromCenter: distanceFromCenter,
      expectedMirrorX: mirrorX,
      allPerformers: this.performers.map(p => ({ name: p.name, x: p.x, y: p.y, id: p.id }))
    });
    
    // Very small tolerance to account for floating point precision issues
    const tolerance = 1; // 1 foot tolerance
    
    // Find the performer at the exact mirror position
    const mirrorPerformer = this.performers.find(p => {
      if (p.id === performerId) return false; // Skip self
      
      // Must be at mirror X position and same Y position (with tiny tolerance for precision)
      const xMatch = Math.abs(p.x - mirrorX) <= tolerance;
      const yMatch = Math.abs(p.y - performer.y) <= tolerance;
      
      console.log(`  📊 Checking ${p.name}: x=${p.x}, y=${p.y}, xDiff=${Math.abs(p.x - mirrorX)}, yDiff=${Math.abs(p.y - performer.y)}, xMatch=${xMatch}, yMatch=${yMatch}`);
      
      return xMatch && yMatch;
    });
    
    console.log(`🎯 Mirror result for ${performer.name}:`, mirrorPerformer ? mirrorPerformer.name : 'NONE FOUND');
    
    return mirrorPerformer || null;
  }

  getTotalSegmentDuration(): number {
    return Math.max(0, this.getTimelineTotalDuration() - 2);
  }

  // Helper method to clear all previous position tracking
  clearAllPreviousPositions() {
    this.selectedPerformerForPreviousPosition = null;
    this.selectedPerformersForPreviousPosition.clear();
  }

  // Check if any previous positions are being shown
  hasVisiblePreviousPositions(): boolean {
    return this.selectedPerformerForPreviousPosition !== null || 
           this.selectedPerformersForPreviousPosition.size > 0;
  }

  // Helper method to handle formation changes and update selection rectangle
  private updateFormationAndRecalculateSelection(newFormationIndex: number) {
    this.currentFormationIndex = newFormationIndex;
    this.playingFormationIndex = newFormationIndex;
    
    // Recalculate selection rectangle for selected performers in the new formation
    if (this.selectedPerformerIds.size > 0) {
      this.calculateSelectionRectangle();
    }
  }

  // Helper method to load segment data when navigating between segments
  private loadSegmentData(segmentId: string) {
    // Clear any existing state before loading new segment
    this.clearSegmentState();
    
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
        
        // Reset formation index to 0 when loading new segment
        this.currentFormationIndex = 0;
        this.playingFormationIndex = 0;
        
        // Update current segment index after loading
        if (this.allSegments.length > 0) {
          this.currentSegmentIndex = this.allSegments.findIndex(s => s._id === this.segment._id);
        }
        
        // Reload team roster and formations with the new segment
        const currentUser = this.authService.getCurrentUser();
        if (currentUser?.team?._id) {
          this.loadTeamRosterAndMapFormations(currentUser.team._id);
        }
        
        // Force change detection
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load segment:', err);
      }
    });
  }

  // Helper method to reset to new segment state
  private resetToNewSegment() {
    this.clearSegmentState();
    this.segment = null;
    this.formations = [[]];
    this.formationDurations = [5];
    this.animationDurations = [];
    this.currentFormationIndex = 0;
    this.playingFormationIndex = 0;
    this.segmentName = 'New Segment';
  }

  // Helper method to clear segment-specific state when navigating
  private clearSegmentState() {
    // Clear formations and drafts
    this.formations = [];
    this.formationDrafts = {};
    this.isDraftDataInMainPosition = {};
    this.isViewingDraft = false;
    
    // Clear selections
    this.selectedPerformerIds.clear();
    this.selectedPerformersForPreviousPosition.clear();
    this.selectedPerformerId = null;
    this.selectedPerformerForPreviousPosition = null;
    
    // Clear audio/video state
    if (this.waveSurfer) {
      this.waveSurfer.destroy();
      this.waveSurfer = null;
    }
    this.signedMusicUrl = null;
    this.isPlaying = false;
    this.waveformInitializedForUrl = null;
    
    // Clear video state
    this.clearYoutubeOverlay();
    this.clearVideoBackdrop();
    
    // Clear 3D state
    if (this.is3DView) {
      this.cleanup3DScene();
    }
    
    // Clear undo/redo state
    this.undoStack = [];
    this.redoStack = [];
    this.updateUndoRedoStates();
    
    // Reset UI state
    this.showEditModal = false;
    this.showStageToolsDropdown = false;
    this.sidePanelMode = 'roster';
    this.activeRosterTab = 'team';
    
    // Clear caches
    this.clearAllCaches();
  }

  // Helper method to determine if a performer is in offstage area
  isPerformerOffstage(performer: Performer): boolean {
    return performer.x < 0 || performer.x > this.width;
  }

  // Helper method to get offstage side (left, right, or null if on stage)
  getOffstageSide(performer: Performer): 'left' | 'right' | null {
    if (performer.x < 0) return 'left';
    if (performer.x > this.width) return 'right';
    return null;
  }

  // Helper method to get performer position in total stage coordinates
  getPerformerTotalPosition(performer: Performer): { x: number, y: number } {
    const totalX = performer.x + this.offstageWidth; // Adjust for offstage offset
    return { x: totalX, y: performer.y };
  }

  // Helper method to convert total stage coordinates back to performer coordinates
  getPerformerCoordinatesFromTotal(totalX: number, totalY: number): { x: number, y: number } {
    const x = totalX - this.offstageWidth; // Remove offstage offset
    return { x, y: totalY };
  }

  addCurtainsTo3DScene() {
    if (!this.scene) return;
    
    // Clear any existing curtain meshes
    this.curtainMeshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
      this.scene?.remove(mesh);
    });
    this.curtainMeshes = [];
    
    // Create wavy curtain material
    const curtainMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x2d3748, // Dark gray color
      transparent: true, 
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    // Create floor material
    const floorMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x1a202c, // Darker gray for floor
      side: THREE.DoubleSide
    });
    
    // Add curtains and floor offstage on every horizontal line
    for (let i = 0; i <= 4; i++) {
      const z = (i / 4 - 0.5) * this.depth;
      
      // Left offstage curtain - create wavy geometry with variation
      const leftCurtainGeometry = this.createWavyCurtainGeometry(this.offstageWidth, 20, 12, 16, i % 6);
      const leftCurtain = new THREE.Mesh(leftCurtainGeometry, curtainMaterial);
      leftCurtain.position.set(-this.width/2 - this.offstageWidth/2, 10, z); // 10 feet high, positioned in left offstage
      this.scene.add(leftCurtain);
      this.curtainMeshes.push(leftCurtain);
      
      // Left offstage floor
      const leftFloorGeometry = new THREE.PlaneGeometry(this.offstageWidth, 6); // 4 feet deep floor
      const leftFloor = new THREE.Mesh(leftFloorGeometry, floorMaterial);
      leftFloor.position.set(-this.width/2 - this.offstageWidth/2, 0.01, z); // Slightly above ground level
      leftFloor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
      this.scene.add(leftFloor);
      this.curtainMeshes.push(leftFloor);
      
      // Right offstage curtain - create wavy geometry with variation
      const rightCurtainGeometry = this.createWavyCurtainGeometry(this.offstageWidth, 20, 12, 16, (i + 2) % 6);
      const rightCurtain = new THREE.Mesh(rightCurtainGeometry, curtainMaterial);
      rightCurtain.position.set(this.width/2 + this.offstageWidth/2, 10, z); // 10 feet high, positioned in right offstage
      this.scene.add(rightCurtain);
      this.curtainMeshes.push(rightCurtain);
      
      // Right offstage floor
      const rightFloorGeometry = new THREE.PlaneGeometry(this.offstageWidth, 6); // 4 feet deep floor
      const rightFloor = new THREE.Mesh(rightFloorGeometry, floorMaterial);
      rightFloor.position.set(this.width/2 + this.offstageWidth/2, 0.01, z); // Slightly above ground level
      rightFloor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
      this.scene.add(rightFloor);
      this.curtainMeshes.push(rightFloor);
    }
  }

  private createWavyCurtainGeometry(width: number, height: number, widthSegments: number, heightSegments: number, variation: number): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
    
    // Get the position attribute
    const position = geometry.attributes['position'];
    const vertex = new THREE.Vector3();
    
    // Apply wavy displacement to vertices with different variations
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      
      let combinedWave = 0;
      
      switch (variation) {
        case 0: // Main horizontal waves with small vertical waves
          combinedWave = Math.sin(vertex.x * 0.8) * 0.8 + 
                        Math.sin(vertex.x * 1.5) * 0.3 + 
                        Math.sin(vertex.x * 2.2) * 0.2 +
                        Math.sin(vertex.y * 0.4) * 0.15 + // Small vertical waves
                        Math.sin(vertex.y * 0.8) * 0.1;
          break;
        case 1: // Different horizontal wave pattern with small vertical waves
          combinedWave = Math.sin(vertex.x * 0.6) * 0.9 + 
                        Math.sin(vertex.x * 1.2) * 0.4 + 
                        Math.sin(vertex.x * 1.8) * 0.2 +
                        Math.sin(vertex.y * 0.3) * 0.12 + // Small vertical waves
                        Math.sin(vertex.y * 0.6) * 0.08;
          break;
        case 2: // Another horizontal wave pattern with small vertical waves
          combinedWave = Math.sin(vertex.x * 0.7) * 0.7 + 
                        Math.sin(vertex.x * 1.4) * 0.5 + 
                        Math.sin(vertex.x * 2.1) * 0.3 +
                        Math.sin(vertex.y * 0.5) * 0.18 + // Small vertical waves
                        Math.sin(vertex.y * 1.0) * 0.12;
          break;
        case 3: // Complex horizontal waves with small vertical waves
          combinedWave = Math.sin(vertex.x * 0.5) * 0.6 + 
                        Math.sin(vertex.x * 1.0) * 0.5 + 
                        Math.sin(vertex.x * 1.6) * 0.4 + 
                        Math.sin(vertex.x * 2.3) * 0.2 +
                        Math.sin(vertex.y * 0.35) * 0.14 + // Small vertical waves
                        Math.sin(vertex.y * 0.7) * 0.09;
          break;
        case 4: // New variation: More complex mixed waves
          combinedWave = Math.sin(vertex.x * 0.9) * 0.75 + 
                        Math.sin(vertex.x * 1.6) * 0.35 + 
                        Math.sin(vertex.x * 2.4) * 0.25 +
                        Math.sin(vertex.y * 0.45) * 0.16 + // Small vertical waves
                        Math.sin(vertex.y * 0.9) * 0.11;
          break;
        case 5: // New variation: Diagonal influence
          combinedWave = Math.sin(vertex.x * 0.65) * 0.85 + 
                        Math.sin(vertex.x * 1.3) * 0.45 + 
                        Math.sin(vertex.x * 1.9) * 0.28 +
                        Math.sin(vertex.y * 0.4) * 0.13 + // Small vertical waves
                        Math.sin(vertex.y * 0.8) * 0.07;
          break;
      }
      
      // Apply the wave displacement only in z-direction
      vertex.z += combinedWave;
      
      // Update the position
      position.setZ(i, vertex.z);
    }
    
    // Recalculate normals for proper lighting
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private adjustMobileZoomToFit(): void {
    // Only apply on mobile devices where the stage width exceeds the viewport
    if (!this.isMobile || !this.stageRef) {
      return;
    }

    const container = this.stageRef.nativeElement.parentElement as HTMLElement | null;
    if (!container) {
      return;
    }

    const containerWidth = container.getBoundingClientRect().width;
    if (containerWidth === 0) {
      return;
    }

    const requiredScale = Math.min(1, containerWidth / this.totalStageWidthPx);

    this.currentZoom = requiredScale;

    // On mobile we align the stage flush left to guarantee full width is visible
    this.currentTranslateX = 0;
    // Reset vertical translation so top is visible
    this.currentTranslateY = 0;

    this.updateStageTransform();
  }

  // Dynamically set minTimelineZoom so the timeline never gets smaller than the container
  updateMinTimelineZoom() {
    // Get the visible width of the timeline container
    const container = this.timelineBarRef?.nativeElement;
    if (!container) return;
    const containerWidth = container.offsetWidth;
    
    // Calculate the timeline width at zoom=1 using the new logic
    const totalDuration = this.getTimelineTotalDuration();
    const timelineWidthAtZoom1 = totalDuration * this.pixelsPerSecond;
    
    // minZoom = containerWidth / timelineWidthAtZoom1
    const minZoom = containerWidth / timelineWidthAtZoom1;
    this.minTimelineZoom = Math.min(1, Math.max(0.01, minZoom));
    
    // Clamp current zoom if needed
    if (this.timelineZoom < this.minTimelineZoom) {
      this.timelineZoom = this.minTimelineZoom;
    }
  }

  // Cursor drag methods
  onCursorDragStart(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    this.isDraggingCursor = true;
    this.cursorDragStartX = event.clientX;
    this.cursorDragStartTime = this.playbackTime;
    
    // Add global event listeners
    document.addEventListener('mousemove', this.onCursorDragMove);
    document.addEventListener('mouseup', this.onCursorDragEnd);
    
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
  }

  onCursorDragMove = (event: MouseEvent) => {
    if (!this.isDraggingCursor) return;
    
    const seekBar = document.querySelector('.timeline-seek-bar') as HTMLElement;
    if (!seekBar) return;
    
    const rect = seekBar.getBoundingClientRect();
    const scrollLeft = this.timelineBarRef?.nativeElement?.scrollLeft || 0;
    const x = event.clientX - rect.left + scrollLeft; // Add scroll offset to match getPlayheadPixel logic
    const totalWidth = this.getTimelinePixelWidth();
    const totalDuration = this.getTimelineTotalDuration();
    
    // Calculate new time based on mouse position
    const timePercent = Math.max(0, Math.min(1, x / totalWidth));
    const newTime = timePercent * totalDuration;
    
    // Update playback time
    this.playbackTime = newTime;
    
    // Seek in WaveSurfer if available
    if (this.waveSurfer && this.waveSurfer.getDuration()) {
      const audioDuration = this.waveSurfer.getDuration();
      const audioTime = Math.max(0, Math.min(newTime, audioDuration));
      this.waveSurfer.seekTo(audioTime / audioDuration);
    }
    
    // Update video if it exists
    const videoElement = this.videoElement;
    if (videoElement) {
      if (newTime <= videoElement.duration) {
        videoElement.currentTime = newTime;
      } else {
        videoElement.currentTime = videoElement.duration;
        videoElement.pause();
      }
    }
    
    // Update formation position
    let t = 0;
    for (let i = 0; i < this.formations.length; i++) {
      const hold = this.formationDurations[i] || 4;
      if (newTime < t + hold) {
        this.playingFormationIndex = i;
        this.inTransition = false;
        this.animatedPositions = {};
        break;
      }
      t += hold;
      if (i < this.animationDurations.length) {
        const trans = this.animationDurations[i] || 1;
        if (newTime < t + trans) {
          this.playingFormationIndex = i + 1;
          this.inTransition = true;
          const progress = (newTime - t) / trans;
          this.animatedPositions = this.interpolateFormations(i, i + 1, progress);
          break;
        }
        t += trans;
      }
    }
    
    // Force change detection
    this.cdr.detectChanges();
  }

  onCursorDragEnd = () => {
    if (!this.isDraggingCursor) return;
    
    this.isDraggingCursor = false;
    
    // Remove global event listeners
    document.removeEventListener('mousemove', this.onCursorDragMove);
    document.removeEventListener('mouseup', this.onCursorDragEnd);
    
    // Restore text selection
    document.body.style.userSelect = '';
  }

  // Add method to auto-scroll timeline to keep playhead visible during playback
  private autoScrollToPlayhead() {
    // Disable auto-scroll to prevent forced screen movement during touch gestures
    if (this.isIntensiveTouchGesture) return;
    
    // Disable auto-scroll to prevent forced screen movement (currently disabled)
    return;
    
    if (!this.isPlaying || !this.timelineBarRef?.nativeElement) return;
    
    const container = this.timelineBarRef.nativeElement;
    const playheadPixel = this.getPlayheadPixel();
    const containerWidth = container.offsetWidth;
    const scrollLeft = container.scrollLeft;
    
    // Check if playhead is out of view (with some padding)
    const padding = 50; // pixels of padding
    const playheadLeft = playheadPixel;
    const playheadRight = playheadPixel + 4; // playhead width
    
    if (playheadLeft < scrollLeft + padding) {
      // Playhead is too far left, scroll left
      container.scrollLeft = Math.max(0, playheadLeft - padding);
    } else if (playheadRight > scrollLeft + containerWidth - padding) {
      // Playhead is too far right, scroll right
      container.scrollLeft = playheadRight - containerWidth + padding;
    }
  }

  // Dismiss upload error popup
  dismissUploadError() {
    this.uploadError = null;
  }

  // Dismiss upload success popup
  dismissUploadSuccess() {
    this.uploadSuccess = null;
  }

  // Helper to format performer name as 'FirstName L.'
  formatPerformerName(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1][0]}.`;
  }

  commitPerformerNameEdit() {
    if (!this.selectedPerformerId) return;
    const user = this.teamRoster.find(m => m._id === this.selectedPerformerId);
    if (user && this.editablePerformerName.trim() && user.name !== this.editablePerformerName.trim()) {
      user.name = this.editablePerformerName.trim();
      this.teamService.updateUser(user._id, { name: user.name }).subscribe({
        next: (res) => this.refreshTeamRoster(),
        error: (err) => console.error('Name update failed:', err)
      });
    }
    this.triggerAutoSave();
  }

  // Handles clicking on a formation in the timeline
  handleFormationClick(index: number, isDraft: boolean = false) {
    // If no audio is connected, move playhead to the start of the formation
    if (!this.signedMusicUrl || !this.waveSurfer || !this.waveSurfer.getDuration || this.waveSurfer.getDuration() === 0) {
      this.playbackTime = this.getFormationStartTimelineTime(index);
      this.currentFormationIndex = index;
      this.playingFormationIndex = index;
      this.isViewingDraft = isDraft;
      this.cdr.detectChanges();
      return;
    }
    this.jumpToFormation(index, isDraft);
  }
}
 