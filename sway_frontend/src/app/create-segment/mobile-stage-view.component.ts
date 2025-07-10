import { Component, Input, Output, EventEmitter, AfterViewInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-mobile-stage-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mobile-stage-view.component.html',
  styleUrls: ['./mobile-stage-view.component.scss']
})
export class MobileStageViewComponent implements AfterViewInit, OnDestroy {
  @Input() performers: any[] = [];
  @Input() formations: any[] = [];
  @Input() currentFormationIndex: number = 0;
  @Input() stageData: any;

  @Output() play = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() backToDashboard = new EventEmitter<void>();

  @ViewChild('stageGridOuter', { static: false }) stageGridOuter!: ElementRef<HTMLDivElement>;

  // Stage and grid properties (copied from create-segment)
  width = 32; // feet
  depth = 24; // feet
  offstageWidth = 8; // feet
  divisions = 3;
  pixelsPerFoot = 20; // Match main stage
  stageWidthPx = this.width * this.pixelsPerFoot;
  stageHeightPx = this.depth * this.pixelsPerFoot;
  offstageWidthPx = this.offstageWidth * this.pixelsPerFoot;
  totalStageWidthPx = this.stageWidthPx + 2 * this.offstageWidthPx;

  mainVerticals: number[] = [];
  mainHorizontals: number[] = [];
  subVerticals: number[] = [];
  subHorizontals: number[] = [];

  currentZoom = 1;
  currentTranslateX = 0;
  currentTranslateY = 0;
  private lastTouchDistance = 0;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private isPinching = false;
  private isDragging = false;
  minZoom = 0.1;
  maxZoom = 2;

  ngOnInit() {
    this.calculateStage();
    // Set default zoom to 1 (100%)
    this.currentZoom = 1;
  }

  centerStageInView() {
    const container = document.querySelector('.mobile-stage-area') as HTMLElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const stageWidth = this.totalStageWidthPx * this.currentZoom;
    const stageHeight = this.stageHeightPx * this.currentZoom;
    this.currentTranslateX = (containerRect.width - stageWidth) / 2;
    this.currentTranslateY = (containerRect.height - stageHeight) / 2;
    console.log('DEBUG centerStageInView', {
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      stageWidth,
      stageHeight,
      currentZoom: this.currentZoom,
      currentTranslateX: this.currentTranslateX,
      currentTranslateY: this.currentTranslateY
    });
  }

  // Add gesture listeners for zoom and pan
  ngAfterViewInit() {
    // Calculate minZoom so user can always zoom out to see the full stage
    setTimeout(() => {
      const container = document.querySelector('.mobile-stage-area') as HTMLElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const minZoomX = containerRect.width / this.totalStageWidthPx;
      const minZoomY = containerRect.height / this.stageHeightPx;
      this.minZoom = Math.min(minZoomX, minZoomY, 1);
      // Center the stage only on initial load
      this.centerStageInView();
      this.enforcePanBounds();
    }, 0);
    // Attach gesture listeners to .mobile-stage-area instead of .stage-grid-outer
    const scrollContainer = document.querySelector('.mobile-stage-area') as HTMLElement;
    if (!scrollContainer) return;
    scrollContainer.addEventListener('wheel', (e: WheelEvent) => {
      if (e.ctrlKey) {
        // Pinch-to-zoom gesture on trackpad
        e.preventDefault();
        this.onWheel(e);
      } // else: allow normal scroll
    }, { passive: false });
    scrollContainer.addEventListener('touchstart', this.onTouchStart, { passive: false });
    scrollContainer.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch gesture
        e.preventDefault();
        this.onTouchMove(e);
      } // else: allow normal scroll
    }, { passive: false });
    scrollContainer.addEventListener('touchend', this.onTouchEnd, { passive: false });
    window.addEventListener('resize', this.autoFitStageToViewport);
    // Log after view init for sanity
    console.log('AFTER VIEW INIT DEBUG:', {
      offstageLeft: { left: 0, width: this.offstageWidthPx },
      mainStage: { left: this.offstageWidthPx, width: this.stageWidthPx },
      offstageRight: { left: this.offstageWidthPx + this.stageWidthPx, width: this.offstageWidthPx },
      mainVerticals: this.mainVerticals.map(x => x + this.offstageWidthPx),
      subVerticals: this.subVerticals.map(x => x + this.offstageWidthPx),
      mainHorizontals: this.mainHorizontals,
      subHorizontals: this.subHorizontals,
      totalStageWidthPx: this.totalStageWidthPx,
      stageHeightPx: this.stageHeightPx
    });
  }

  ngOnDestroy() {
    const gridOuter = document.querySelector('.stage-grid-outer') as HTMLElement;
    if (gridOuter) {
      gridOuter.removeEventListener('touchstart', this.onTouchStart);
      gridOuter.removeEventListener('touchmove', this.onTouchMove);
      gridOuter.removeEventListener('touchend', this.onTouchEnd);
      gridOuter.removeEventListener('wheel', this.onWheel);
    }
    window.removeEventListener('resize', this.autoFitStageToViewport);
  }

  autoFitStageToViewport = () => {
    setTimeout(() => {
      const container = document.querySelector('.mobile-stage-area') as HTMLElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const stageWidth = this.totalStageWidthPx;
      const stageHeight = this.stageHeightPx;
      const availableWidth = containerRect.width;
      const availableHeight = containerRect.height;
      // Calculate the scale to fit the stage in the container
      const fitScale = Math.min(availableWidth / stageWidth, availableHeight / stageHeight, 1);
      this.currentZoom = fitScale;
      // Center the stage
      this.currentTranslateX = (availableWidth - stageWidth * fitScale) / 2;
      this.currentTranslateY = (availableHeight - stageHeight * fitScale) / 2;
      this.enforcePanBounds();
      // Log all relevant values
      const performerDebug = (this.performers || []).map(p => {
        const style = this.getPerformerStyle(p);
        return {
          name: p.name,
          x: p.x,
          y: p.y,
          style
        };
      });
      console.log('MOBILE STAGE FULL DEBUG:', {
        containerWidth: availableWidth,
        containerHeight: availableHeight,
        stageWidth,
        stageHeight,
        fitScale,
        currentTranslateX: this.currentTranslateX,
        currentTranslateY: this.currentTranslateY,
        offstageWidthPx: this.offstageWidthPx,
        stageWidthPx: this.stageWidthPx,
        stageHeightPx: this.stageHeightPx,
        totalStageWidthPx: this.totalStageWidthPx,
        performers: performerDebug,
        offstageLeft: {
          left: 0,
          width: this.offstageWidthPx
        },
        mainStage: {
          left: this.offstageWidthPx,
          width: this.stageWidthPx
        },
        offstageRight: {
          left: this.stageWidthPx + this.offstageWidthPx,
          width: this.offstageWidthPx
        }
      });
    }, 0);
  };

  clampPanZoom() {
    // Clamp zoom
    this.currentZoom = Math.max(0.3, Math.min(2.5, this.currentZoom));
    // Clamp pan so stage can't be dragged out of view
    const container = document.querySelector('.mobile-stage-area') as HTMLElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const stageWidth = this.totalStageWidthPx * this.currentZoom;
    const stageHeight = this.stageHeightPx * this.currentZoom;
    const minX = Math.min(0, containerRect.width - stageWidth);
    const maxX = Math.max(0, containerRect.width - stageWidth);
    const minY = Math.min(0, containerRect.height - stageHeight);
    const maxY = Math.max(0, containerRect.height - stageHeight);
    this.currentTranslateX = Math.min(maxX, Math.max(minX, this.currentTranslateX));
    this.currentTranslateY = Math.min(maxY, Math.max(minY, this.currentTranslateY));
  }

  enforcePanBounds() {
    const container = document.querySelector('.mobile-stage-area') as HTMLElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const stageWidth = this.totalStageWidthPx * this.currentZoom;
    const stageHeight = this.stageHeightPx * this.currentZoom;
    // Allow a small overpan (20% of container size)
    const overpanX = containerRect.width * 0.2;
    const overpanY = containerRect.height * 0.2;
    const minX = containerRect.width - stageWidth - overpanX;
    const maxX = overpanX;
    const minY = containerRect.height - stageHeight - overpanY;
    const maxY = overpanY;
    this.currentTranslateX = Math.max(minX, Math.min(maxX, this.currentTranslateX));
    this.currentTranslateY = Math.max(minY, Math.min(maxY, this.currentTranslateY));
    console.log('DEBUG enforcePanBounds', {
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      stageWidth,
      stageHeight,
      minX,
      maxX,
      minY,
      maxY,
      currentTranslateX: this.currentTranslateX,
      currentTranslateY: this.currentTranslateY
    });
  }

  // Only allow pan/zoom with two-finger gestures (touch or trackpad)
  onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      this.isPinching = true;
      this.lastTouchDistance = this.getTouchDistance(e.touches);
      this.lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      this.lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  };

  onTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      // Pinch zoom
      const container = document.querySelector('.mobile-stage-area') as HTMLElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const midX = ((touch1.clientX + touch2.clientX) / 2) - rect.left + container.scrollLeft;
      const midY = ((touch1.clientY + touch2.clientY) / 2) - rect.top + container.scrollTop;
      const dist = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      if (!this.lastTouchDistance) this.lastTouchDistance = dist;
      const zoomAmount = dist / this.lastTouchDistance;
      let newZoom = this.currentZoom * zoomAmount;
      newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
      
      // Store old zoom before updating
      const oldZoom = this.currentZoom;
      
      // Stage position under midpoint before zoom (using OLD zoom)
      const stageX = (midX - this.currentTranslateX) / oldZoom;
      const stageY = (midY - this.currentTranslateY) / oldZoom;
      
      // Update zoom
      this.currentZoom = newZoom;
      
      // Stage size at new zoom
      const stageWidth = this.totalStageWidthPx * this.currentZoom;
      const stageHeight = this.stageHeightPx * this.currentZoom;
      
      // Calculate new translation to keep the point under midpoint fixed
      if (stageWidth <= rect.width) {
        this.currentTranslateX = (rect.width - stageWidth) / 2;
      } else {
        this.currentTranslateX = midX - stageX * this.currentZoom;
      }
      if (stageHeight <= rect.height) {
        this.currentTranslateY = (rect.height - stageHeight) / 2;
      } else {
        this.currentTranslateY = midY - stageY * this.currentZoom;
      }
      this.lastTouchDistance = dist;
      this.enforcePanBounds();
      console.log('DEBUG onTouchMove (pinch)', {
        midX,
        midY,
        stageX,
        stageY,
        currentZoom: this.currentZoom,
        currentTranslateX: this.currentTranslateX,
        currentTranslateY: this.currentTranslateY
      });
    } else if (event.touches.length === 1) {
      // Single-finger drag (pan)
      this.isDragging = true;
      const container = document.querySelector('.mobile-stage-area') as HTMLElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const touch = event.touches[0];
      const mouseX = touch.clientX - rect.left + container.scrollLeft;
      const mouseY = touch.clientY - rect.top + container.scrollTop;
      this.currentTranslateX += mouseX - this.lastTouchX;
      this.currentTranslateY += mouseY - this.lastTouchY;
      this.lastTouchX = mouseX;
      this.lastTouchY = mouseY;
      this.enforcePanBounds();
      console.log('DEBUG onTouchMove (pan)', {
        mouseX,
        mouseY,
        currentTranslateX: this.currentTranslateX,
        currentTranslateY: this.currentTranslateY
      });
    }
  };

  onTouchEnd = (event: TouchEvent) => {
    this.lastTouchDistance = 0;
    if (event.touches.length < 2) this.isPinching = false;
    this.isDragging = false;
  };

  // Trackpad pan/zoom (wheel event)
  onWheel = (event: WheelEvent) => {
    // Only zoom if ctrlKey is pressed (trackpad pinch)
    if (!event.ctrlKey) return;
    const container = document.querySelector('.mobile-stage-area') as HTMLElement;
    if (!container) return;
    // Mouse position relative to the container
    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left + container.scrollLeft;
    const mouseY = event.clientY - rect.top + container.scrollTop;
    // Calculate zoom
    const zoomAmount = -event.deltaY * 0.002;
    let newZoom = this.currentZoom * (1 + zoomAmount);
    newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    
    // Store old zoom before updating
    const oldZoom = this.currentZoom;
    
    // Calculate the stage position under the cursor before zoom (using OLD zoom)
    const stageX = (mouseX - this.currentTranslateX) / oldZoom;
    const stageY = (mouseY - this.currentTranslateY) / oldZoom;
    
    // Update zoom
    this.currentZoom = newZoom;
    
    // Stage size at new zoom
    const stageWidth = this.totalStageWidthPx * this.currentZoom;
    const stageHeight = this.stageHeightPx * this.currentZoom;
    
    // Calculate new translation to keep the point under cursor fixed
    if (stageWidth <= rect.width) {
      this.currentTranslateX = (rect.width - stageWidth) / 2;
    } else {
      this.currentTranslateX = mouseX - stageX * this.currentZoom;
    }
    if (stageHeight <= rect.height) {
      this.currentTranslateY = (rect.height - stageHeight) / 2;
    } else {
      this.currentTranslateY = mouseY - stageY * this.currentZoom;
    }
    
    this.enforcePanBounds();
    console.log('DEBUG onWheel', {
      mouseX,
      mouseY,
      stageX,
      stageY,
      oldZoom,
      newZoom: this.currentZoom,
      currentTranslateX: this.currentTranslateX,
      currentTranslateY: this.currentTranslateY
    });
  };

  getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getStageTransform() {
    const transform = `translate(${this.currentTranslateX}px, ${this.currentTranslateY}px) scale(${this.currentZoom})`;
    // Log transform and zoom/translate values
    console.log('MOBILE STAGE TRANSFORM DEBUG:', {
      currentZoom: this.currentZoom,
      currentTranslateX: this.currentTranslateX,
      currentTranslateY: this.currentTranslateY,
      transform
    });
    return transform;
  }

  calculateStage() {
    // Use the same logic as CreateSegmentComponent
    this.pixelsPerFoot = 20;
    this.stageWidthPx = this.width * this.pixelsPerFoot;
    this.stageHeightPx = this.depth * this.pixelsPerFoot;
    this.offstageWidthPx = this.offstageWidth * this.pixelsPerFoot;
    this.totalStageWidthPx = this.stageWidthPx + 2 * this.offstageWidthPx;

    this.mainVerticals = [];
    this.mainHorizontals = [];
    this.subVerticals = [];
    this.subHorizontals = [];

    // Main grid lines (vertical)
    for (let i = 0; i <= 8; i++) {
      this.mainVerticals.push((i / 8) * this.stageWidthPx);
    }
    // Main grid lines (horizontal)
    const lineThickness = 4;
    for (let i = 0; i <= 4; i++) {
      let y = (i / 4) * this.stageHeightPx;
      if (i === 4) y = this.stageHeightPx - lineThickness;
      this.mainHorizontals.push(y);
    }
    // Subgrid lines
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
    // Debug logging
    console.log('MOBILE STAGE DEBUG:', {
      width: this.width,
      depth: this.depth,
      offstageWidth: this.offstageWidth,
      pixelsPerFoot: this.pixelsPerFoot,
      stageWidthPx: this.stageWidthPx,
      stageHeightPx: this.stageHeightPx,
      offstageWidthPx: this.offstageWidthPx,
      totalStageWidthPx: this.totalStageWidthPx,
      mainVerticals: this.mainVerticals,
      mainHorizontals: this.mainHorizontals,
      subVerticals: this.subVerticals,
      subHorizontals: this.subHorizontals
    });
    // Debug log for grid and stage layout
    console.log('STAGE LAYOUT DEBUG:', {
      offstageLeft: { left: 0, width: this.offstageWidthPx },
      mainStage: { left: this.offstageWidthPx, width: this.stageWidthPx },
      offstageRight: { left: this.offstageWidthPx + this.stageWidthPx, width: this.offstageWidthPx },
      mainVerticals: this.mainVerticals.map(x => x + this.offstageWidthPx),
      subVerticals: this.subVerticals.map(x => x + this.offstageWidthPx),
      mainHorizontals: this.mainHorizontals,
      subHorizontals: this.subHorizontals,
      totalStageWidthPx: this.totalStageWidthPx,
      stageHeightPx: this.stageHeightPx
    });
  }

  get mainFormations() {
    return this.formations.filter(f => !f.isDraft);
  }

  // Placement logic for performers (copied from create-segment)
  getPerformerTotalPosition(performer: any) {
    // x is from -offstageWidth to width + offstageWidth
    return {
      x: performer.x + this.offstageWidth,
      y: performer.y
    };
  }

  getPerformerStyle(performer: any) {
    const performerSize = 25; // px, match main stage
    let x = performer.x;
    let y = performer.y;
    const totalPosition = this.getPerformerTotalPosition({ ...performer, x, y });
    const left = (totalPosition.x / (this.width + 2 * this.offstageWidth)) * this.totalStageWidthPx - performerSize / 2;
    const top = (y / this.depth) * this.stageHeightPx - performerSize / 2;
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${performerSize}px`,
      height: `${performerSize}px`,
      position: 'absolute',
      zIndex: 3
    };
  }
} 