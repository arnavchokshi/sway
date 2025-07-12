import { Component, Input, OnChanges, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

// Material icons for tab navigation
const TAB_ICONS = {
  overview: 'lightbulb', // Tips/insights icon
  spacing: 'groups',     // Spacing/heatmap icon
  transitions: 'show_chart', // Transitions icon
};

@Component({
  selector: 'app-ai-tips-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-tips-panel.component.html',
  styleUrls: ['./ai-tips-panel.component.scss']
})
export class AiTipsPanelComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() performers: any[] = [];
  @Input() formations: any[] = [];
  @Input() formationDurations: number[] = [];
  @Input() currentFormationIndex: number = 0;
  @Input() isProAccount: boolean = false;
  @Input() tips: any[] = [];
  @Input() segment: any;

  // Tab navigation (only 3 tabs now)
  tabs = [
    { id: 'overview', label: 'Overview', icon: 'insights' },
    { id: 'formation', label: 'Formation', icon: 'groups' },
    { id: 'transitions', label: 'Transitions', icon: 'swap_horiz' },
  ];
  activeTab: string = 'overview';

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  isActiveTab(tab: string): boolean {
    return this.activeTab === tab;
  }

  // Stage dimensions (fallback if not provided)
  stageWidth = 40; // feet
  stageHeight = 20; // feet
  gridSize = 1; // 1 foot per cell

  // Analysis results
  overallReport: any = {};
  spacingDiversity: any = {};
  hardestTransition: any = {};
  conflicts: any[] = [];
  recommendations: string[] = [];

  // Mini stage grid logic (match main stage: 32x24ft, 8ft offstage each side, 8x4 main grid, 3 subgrid divisions)
  mainStageWidth = 32;
  mainStageDepth = 24;
  offstageWidth = 8;
  divisions = 3;

  // Expose Math for template use
  public Math = Math;

  // Main verticals: 9 lines (8 sections)
  getMainVerticals(): number[] {
    const total = 8;
    return Array.from({ length: total + 1 }, (_, i) => ((this.offstageWidth + (i * this.mainStageWidth / total)) / (this.mainStageWidth + 2 * this.offstageWidth)) * 100);
  }
  // Main horizontals: 5 lines (4 sections)
  getMainHorizontals(): number[] {
    const total = 4;
    return Array.from({ length: total + 1 }, (_, i) => (i * 100) / total);
  }
  // Sub verticals: 8 sections, 3 divisions each
  getSubVerticals(): number[] {
    const total = 8;
    const divs = this.divisions;
    let arr: number[] = [];
    for (let i = 0; i < total; i++) {
      for (let d = 1; d <= divs; d++) {
        arr.push(((this.offstageWidth + (i * this.mainStageWidth / total) + (d * this.mainStageWidth / total) / (divs + 1)) / (this.mainStageWidth + 2 * this.offstageWidth)) * 100);
      }
    }
    return arr;
  }
  // Sub horizontals: 4 sections, 3 divisions each
  getSubHorizontals(): number[] {
    const total = 4;
    const divs = this.divisions;
    let arr: number[] = [];
    for (let i = 0; i < total; i++) {
      for (let d = 1; d <= divs; d++) {
        arr.push(((i * this.mainStageDepth / total) + (d * this.mainStageDepth / total) / (divs + 1)) / this.mainStageDepth * 100);
      }
    }
    return arr;
  }
  // For heatmap overlay cell positions (main stage only, 8x4 grid, 0-100% of container)
  getCellLeft(col: number): number {
    return (col * 100) / 8;
  }
  getCellTop(row: number): number {
    return (row * 100) / 4;
  }
  getCellWidth(): number {
    return 100 / 8;
  }
  getCellHeight(): number {
    return 100 / 4;
  }

  // Template helper methods to replace arrow functions
  hasHeightBlockConflict(): boolean {
    return this.conflicts?.some(c => c.type === 'height_block') || false;
  }

  hasFastMoveConflict(): boolean {
    return this.conflicts?.some(c => c.type === 'fast_move') || false;
  }

  getHeightBlockMessage(): string {
    const conflict = this.conflicts?.find(c => c.type === 'height_block');
    return conflict?.message || '';
  }

  getFastMoveMessage(): string {
    const conflict = this.conflicts?.find(c => c.type === 'fast_move');
    return conflict?.message || '';
  }

  hasHardestTransition(): boolean {
    return !!this.hardestTransition;
  }

  hasRecommendations(): boolean {
    return this.recommendations?.length > 0;
  }

  getFirstRecommendation(): string {
    return this.recommendations?.[0] || '';
  }

  hasTips(): boolean {
    return this.tips && this.tips.length > 0;
  }

  ngOnChanges() {
    if (this.segment) {
      this.stageWidth = this.segment.width || this.stageWidth;
      this.stageHeight = this.segment.height || this.stageHeight;
    }
    this.runAnalysis();
  }

  runAnalysis() {
    this.overallReport = this.computeOverallReport();
    this.spacingDiversity = this.computeSpacingDiversity();
    this.hardestTransition = this.computeHardestTransition();
    this.conflicts = this.computeConflicts();
    this.recommendations = this.computeRecommendations();
  }

  // 1. Overall Report Analysis
  computeOverallReport() {
    // Example: formation score, space usage, diversity, conflicts
    const totalCells = 8 * 4; // 8x4 grid
    const usedCells = new Set<string>();
    for (const formation of this.formations) {
      for (const p of formation) {
        if (p.x != null && p.y != null) {
          const col = Math.floor((p.x / this.stageWidth) * 8);
          const row = Math.floor((p.y / this.stageHeight) * 4);
          usedCells.add(`${col},${row}`);
        }
      }
    }
    const spaceUsage = (usedCells.size / totalCells) * 100;
    const formationScore = Math.round(70 + 30 * (spaceUsage / 100));
    const diversity = this.computeSpacingDiversity().diversity;
    const conflictCount = this.computeConflicts().length;
    return {
      formationScore,
      spaceUsage: Math.round(spaceUsage),
      diversity: Math.round(diversity * 100),
      conflictCount
    };
  }

  // 2. Spacing Diversity (Left vs Right, Symmetry, Clumped/Spaced)
  computeSpacingDiversity() {
    let left = 0, right = 0, center = 0;
    let clumped = 0, spaced = 0;
    let total = 0;
    for (const formation of this.formations) {
      if (!formation.length) continue;
      // Center of stage
      const centerX = this.stageWidth / 2;
      for (const p of formation) {
        if (p.x == null) continue;
        total++;
        if (p.x < centerX - this.stageWidth * 0.1) left++;
        else if (p.x > centerX + this.stageWidth * 0.1) right++;
        else center++;
      }
      // Clumped vs spaced: use average pairwise distance
      let sumDist = 0, count = 0;
      for (let i = 0; i < formation.length; i++) {
        for (let j = i + 1; j < formation.length; j++) {
          const dx = formation[i].x - formation[j].x;
          const dy = formation[i].y - formation[j].y;
          sumDist += Math.sqrt(dx * dx + dy * dy);
          count++;
        }
      }
      const avgDist = count ? sumDist / count : 0;
      if (avgDist < this.stageWidth * 0.18) clumped++;
      else spaced++;
    }
    const leftPct = total ? left / total : 0;
    const rightPct = total ? right / total : 0;
    const symmetry = 1 - Math.abs(leftPct - rightPct);
    const denom = clumped + spaced;
    const clumpedPct = denom ? clumped / denom : 0;
    const spacedPct = denom ? spaced / denom : 0;
    const diversity = (symmetry + spacedPct) / 2;
    return {
      leftPct,
      rightPct,
      symmetry,
      clumpedPct,
      spacedPct,
      diversity
    };
  }

  // 3. Hardest Formation Change (distance, time, height)
  computeHardestTransition() {
    let hardest = null;
    let maxDifficulty = -1;
    for (let i = 0; i < this.formations.length - 1; i++) {
      const f1 = this.formations[i];
      const f2 = this.formations[i + 1];
      const duration = this.formationDurations[i] || 4;
      for (const p1 of f1) {
        const p2 = f2.find((p: any) => p.id === p1.id);
        if (p2) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const speed = dist / duration;
          const height = p1.height || 65;
          // Difficulty: distance, speed, and penalize for short height
          const difficulty = dist * speed * (height < 60 ? 1.2 : 1);
          if (difficulty > maxDifficulty) {
            maxDifficulty = difficulty;
            hardest = {
              from: i,
              to: i + 1,
              performer: p1.name,
              dist: dist.toFixed(2),
              speed: speed.toFixed(2),
              height,
              duration,
              difficulty: difficulty.toFixed(2)
            };
          }
        }
      }
    }
    return hardest;
  }

  // 4. Conflict Detection (visibility, movement, etc.)
  computeConflicts() {
    const conflicts: any[] = [];
    // Height blocking: someone behind a much taller person
    for (const formation of this.formations) {
      for (const p1 of formation) {
        for (const p2 of formation) {
          if (p1.id !== p2.id && Math.abs(p1.x - p2.x) < 1 && p1.y > p2.y) {
            if ((p2.height || 65) - (p1.height || 65) > 8) {
              conflicts.push({
                type: 'height_block',
                message: `${p1.name} may be blocked by taller ${p2.name} in back row.`
              });
            }
          }
        }
      }
    }
    // Fast movement: long distance in short time
    for (let i = 0; i < this.formations.length - 1; i++) {
      const f1 = this.formations[i];
      const f2 = this.formations[i + 1];
      const duration = this.formationDurations[i] || 4;
      for (const p1 of f1) {
        const p2 = f2.find((p: any) => p.id === p1.id);
        if (p2) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const speed = dist / duration;
          if (speed > 2.5) {
            conflicts.push({
              type: 'fast_move',
              message: `${p1.name} has to move ${dist.toFixed(1)}ft in ${duration}s (speed: ${speed.toFixed(2)}ft/s).`
            });
          }
        }
      }
    }
    return conflicts;
  }

  // Helper: check if two line segments (A->B and C->D) cross
  private doSegmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
    // Based on the orientation method
    function orientation(px: number, py: number, qx: number, qy: number, rx: number, ry: number) {
      const val = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
      if (val === 0) return 0; // colinear
      return val > 0 ? 1 : 2; // clock or counterclock wise
    }
    const o1 = orientation(ax, ay, bx, by, cx, cy);
    const o2 = orientation(ax, ay, bx, by, dx, dy);
    const o3 = orientation(cx, cy, dx, dy, ax, ay);
    const o4 = orientation(cx, cy, dx, dy, bx, by);
    if (o1 !== o2 && o3 !== o4) return true;
    return false;
  }

  // 5. Recommendations
  computeRecommendations() {
    const recs: string[] = [];
    // Only show collision order recommendations
    const transitions = this.getAllTransitions();
    const collisionPairs: Set<string> = new Set();
    for (const t of transitions) {
      if (t.issues && t.issues.includes('Collision') && t.collisionWith) {
        for (const other of t.collisionWith) {
          // Only suggest once per pair
          const key = [t.performer, other.performer].sort().join('-') + `-${t.from}`;
          if (!collisionPairs.has(key)) {
            collisionPairs.add(key);
            const first = t.dist > other.dist ? t.performer : other.performer;
            const second = t.dist > other.dist ? other.performer : t.performer;
            recs.push(`In F${t.from + 1}→F${t.to + 1}, ${first} should go before ${second} to avoid collision.`);
          }
        }
      }
    }
    return recs;
  }

  // 6. Display Existing Tips: just use this.tips

  // Returns a 2D array of counts for each grid cell
  getHeatmapGrid(): number[][] {
    const cols = Math.ceil(this.stageWidth / this.gridSize);
    const rows = Math.ceil(this.stageHeight / this.gridSize);
    const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (const formation of this.formations) {
      for (const performer of formation) {
        if (performer.x == null || performer.y == null) continue;
        const col = Math.floor(performer.x / this.gridSize);
        const row = Math.floor(performer.y / this.gridSize);
        if (row >= 0 && row < rows && col >= 0 && col < cols) {
          grid[row][col]++;
        }
      }
    }
    return grid;
  }

  // Returns the maximum heat value in the grid for color scaling
  maxHeat(): number {
    const grid = this.getHeatmapGrid();
    let max = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell > max) max = cell;
      }
    }
    return max || 1;
  }

  // Helper for heatmap cell value (safe for template)
  getHeatValue(rowIdx: number, colIdx: number): number {
    const grid = this.getHeatmapGrid();
    if (Array.isArray(grid[rowIdx]) && typeof grid[rowIdx][colIdx] === 'number') {
      return grid[rowIdx][colIdx];
    }
    return 0;
  }

  // For showing performer initials at a given cell in the current formation
  getPerformersAtCell(row: number, col: number): string[] {
    if (!this.formations[this.currentFormationIndex]) return [];
    return this.formations[this.currentFormationIndex]
      .filter((p: any) => {
        const c = Math.floor(p.x / this.gridSize);
        const r = Math.floor(p.y / this.gridSize);
        return c === col && r === row;
      })
      .map((p: any) => this.getInitials(p.name));
  }

  getInitials(name: string): string {
    if (!name) return '';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
  }

  // Stub methods for advanced analysis (to be implemented)
  getOverallReport() {}
  getHeatmapAnalysis() {}
  getSpacingDiversity() {}
  getHardestTransition() {}
  getConflictDetection() {}
  getRecommendations() {}

  // Mini stage grid dimensions (smaller version)
  miniStageWidthPx = 280;
  miniStageHeightPx = 210;
  miniStageCols = 8;
  miniStageRows = 4;
  miniStageDivisions = 3;

  // Main grid lines (vertical/horizontal) in px
  getMiniMainVerticals(): number[] {
    const arr = [];
    for (let i = 0; i <= this.miniStageCols; i++) {
      arr.push((i / this.miniStageCols) * this.miniStageWidthPx);
    }
    return arr;
  }
  getMiniMainHorizontals(): number[] {
    const arr = [];
    for (let i = 0; i <= this.miniStageRows; i++) {
      arr.push((i / this.miniStageRows) * this.miniStageHeightPx);
    }
    return arr;
  }
  // Subgrid lines (vertical/horizontal) in px
  getMiniSubVerticals(): number[] {
    const arr: number[] = [];
    for (let i = 0; i < this.miniStageCols; i++) {
      const start = (i / this.miniStageCols) * this.miniStageWidthPx;
      const end = ((i + 1) / this.miniStageCols) * this.miniStageWidthPx;
      for (let d = 1; d <= this.miniStageDivisions; d++) {
        arr.push(start + ((end - start) * d) / (this.miniStageDivisions + 1));
      }
    }
    return arr;
  }
  getMiniSubHorizontals(): number[] {
    const arr: number[] = [];
    for (let i = 0; i < this.miniStageRows; i++) {
      const start = (i / this.miniStageRows) * this.miniStageHeightPx;
      const end = ((i + 1) / this.miniStageRows) * this.miniStageHeightPx;
      for (let d = 1; d <= this.miniStageDivisions; d++) {
        arr.push(start + ((end - start) * d) / (this.miniStageDivisions + 1));
      }
    }
    return arr;
  }

  // Get all performer positions (all formations) scaled to mini stage
  getAllPerformerPositionsOnMiniStage(): { x: number, y: number }[] {
    const positions: { x: number, y: number }[] = [];
    if (!this.formations?.length) return positions;
    // Use main stage width/height for scaling
    const stageWidth = this.stageWidth || 32;
    const stageHeight = this.stageHeight || 24;
    for (const formation of this.formations) {
      for (const p of formation) {
        if (typeof p.x === 'number' && typeof p.y === 'number') {
          positions.push({
            x: (p.x / stageWidth) * this.miniStageWidthPx,
            y: (p.y / stageHeight) * this.miniStageHeightPx
          });
        }
      }
    }
    return positions;
  }

  // Get all transitions between formations (for transitions tab), with collision detection
  getAllTransitions(): any[] {
    const transitions: any[] = [];
    if (!this.formations || this.formations.length < 2) return transitions;
    for (let i = 0; i < this.formations.length - 1; i++) {
      const f1 = this.formations[i];
      const f2 = this.formations[i + 1];
      const duration = this.formationDurations[i] || 4;
      for (const p1 of f1) {
        const p2 = f2.find((p: any) => p.id === p1.id);
        if (p2) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const speed = dist / duration;
          let difficulty = dist * speed * ((p1.height || 65) < 60 ? 1.2 : 1);
          let issues: string[] = [];
          if (speed > 2.5) issues.push('Fast');
          if ((p2.height || 65) - (p1.height || 65) > 8) issues.push('Height Conflict');
          transitions.push({
            from: i,
            to: i + 1,
            performer: p1.name,
            performerId: p1.id,
            dist: dist,
            speed: speed,
            height: p1.height,
            duration,
            difficulty,
            issues,
            start: { x: p1.x, y: p1.y },
            end: { x: p2.x, y: p2.y }
          });
        }
      }
    }
    // Collision detection: for each transition group (same from/to), check all pairs
    for (let i = 0; i < this.formations.length - 1; i++) {
      const group = transitions.filter(t => t.from === i && t.to === i + 1);
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          const t1 = group[a];
          const t2 = group[b];
          if (this.doSegmentsIntersect(
            t1.start.x, t1.start.y, t1.end.x, t1.end.y,
            t2.start.x, t2.start.y, t2.end.x, t2.end.y
          )) {
            if (!t1.issues.includes('Collision')) t1.issues.push('Collision');
            if (!t2.issues.includes('Collision')) t2.issues.push('Collision');
            // Add collision info for recommendations
            t1.collisionWith = t1.collisionWith || [];
            t2.collisionWith = t2.collisionWith || [];
            t1.collisionWith.push(t2);
            t2.collisionWith.push(t1);
          }
        }
      }
    }
    return transitions;
  }

  // Get difficulty label and color for a transition
  getTransitionDifficultyLabel(difficulty: number): { label: string, color: string } {
    if (difficulty > 7) return { label: 'Hard', color: 'red' };
    if (difficulty > 3.5) return { label: 'Medium', color: 'yellow' };
    return { label: 'Easy', color: 'green' };
  }

  // Get the top N hardest transitions by difficulty
  getTopHardestTransitions(n: number): any[] {
    return this.getAllTransitions()
      .sort((a, b) => b.difficulty - a.difficulty)
      .slice(0, n)
      .map(t => ({
        to: t.to + 1, // formation number (1-based)
        performer: t.performer,
        dist: t.dist,
        speed: t.speed
      }));
  }

  getTopTransitionsSimple(n: number): any[] {
    return this.getAllTransitions()
      .sort((a, b) => b.difficulty - a.difficulty)
      .slice(0, n)
      .map(t => ({
        to: t.to + 1, // formation number (1-based)
        performer: t.performer,
        dist: t.dist,
        time: t.duration // use duration instead of speed
      }));
  }

  // Get spacing tips for a given formation index
  getSpacingTipsForFormation(index: number): any[] {
    const tips: any[] = [];
    if (!this.formations || !this.formations[index]) return tips;
    const formation = this.formations[index];
    const heightBlockPairs = new Set<string>();
    // Height blocking: someone behind a much taller person
    for (const p1 of formation) {
      for (const p2 of formation) {
        if (p1.id !== p2.id && Math.abs(p1.x - p2.x) < 1 && p1.y > p2.y) {
          if ((p2.height || 65) - (p1.height || 65) > 8) {
            tips.push({
              type: 'height_block',
              message: `${p1.name} may be blocked by taller ${p2.name} in this formation.`
            });
            // Mark this pair so we don't show 'front shorter than back' for them
            heightBlockPairs.add(`${p1.id}-${p2.id}`);
          }
        }
      }
    }
    // Mirror height mismatch: check if symmetric positions have different heights
    const stageWidth = this.stageWidth || 32;
    const seenMirrorPairs = new Set<string>();
    for (const p1 of formation) {
      // Mirror x across center
      const mirrorX = stageWidth - p1.x;
      const mirror = formation.find((p: any) => Math.abs(p.x - mirrorX) < 0.5 && Math.abs(p.y - p1.y) < 0.5 && p.id !== p1.id);
      if (mirror && Math.abs((p1.height || 65) - (mirror.height || 65)) > 4) {
        // Create a unique key for the pair (order-independent)
        const pairKey = [p1.id, mirror.id].sort().join('-');
        if (!seenMirrorPairs.has(pairKey)) {
          tips.push({
            type: 'mirror_height',
            message: `${p1.name} and their mirror (${mirror.name}) have different heights.`
          });
          seenMirrorPairs.add(pairKey);
        }
      }
    }
    // Skill/height order: someone in front is lower skill or shorter than someone behind
    for (const p1 of formation) {
      for (const p2 of formation) {
        if (p1.id !== p2.id && Math.abs(p1.x - p2.x) < 1 && p1.y < p2.y) {
          // Only show 'front shorter than back' if not already flagged as a height block
          if ((p1.height || 65) < (p2.height || 65) && !heightBlockPairs.has(`${p2.id}-${p1.id}`)) {
            tips.push({
              type: 'front_shorter',
              message: `${p1.name} (front) is shorter than ${p2.name} (behind).` 
            });
          }
          if ((p1.skill || 0) < (p2.skill || 0)) {
            tips.push({
              type: 'front_lower_skill',
              message: `${p1.name} (front) has lower skill than ${p2.name} (behind).` 
            });
          }
        }
      }
    }
    return tips;
  }

  // Get start/end position tips for overview (based on previous/next segment)
  getStartEndPositionTips(): any[] {
    // This is a placeholder: in a real app, you would compare the first/last formation of this segment to the last/first formation of the previous/next segment.
    // For now, just return any tips in this.tips with type 'start_end'.
    return (this.tips || []).filter(t => t.type === 'start_end');
  }

  getSymmetricalPercent(): number {
    // Use spacingDiversity.symmetry (0-1) as % symmetrical formations
    return Math.round((this.spacingDiversity.symmetry || 0) * 100);
  }
  getSpreadPercent(): number {
    // Use spacingDiversity.spacedPct (0-1) as % spread out formations
    return Math.round((this.spacingDiversity.spacedPct || 0) * 100);
  }

  getClumpedPercent(): number {
    // Use spacingDiversity.clumpedPct (0-1) as % clumped formations
    return Math.round((this.spacingDiversity.clumpedPct || 0) * 100);
  }

  private resizeObserver: ResizeObserver | null = null;
  private controlBarEl: HTMLElement | null = null;
  private bottomPanelEl: HTMLElement | null = null;

  ngAfterViewInit() {
    // Find the control bar and bottom panel elements in the DOM
    this.controlBarEl = document.querySelector('.control-bar');
    this.bottomPanelEl = document.querySelector('.bottom-panel');
    this.updatePanelMaxHeight();
    // Observe for changes in their size
    this.resizeObserver = new ResizeObserver(() => {
      this.updatePanelMaxHeight();
    });
    if (this.controlBarEl) this.resizeObserver.observe(this.controlBarEl);
    if (this.bottomPanelEl) this.resizeObserver.observe(this.bottomPanelEl);
    window.addEventListener('resize', this.updatePanelMaxHeight);
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      if (this.controlBarEl) this.resizeObserver.unobserve(this.controlBarEl);
      if (this.bottomPanelEl) this.resizeObserver.unobserve(this.bottomPanelEl);
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.updatePanelMaxHeight);
  }

  updatePanelMaxHeight = () => {
    // Get heights of control bar and bottom panel
    const controlBar = document.querySelector('.control-bar') as HTMLElement;
    const bottomPanel = document.querySelector('.bottom-panel') as HTMLElement;
    const controlBarHeight = controlBar ? controlBar.offsetHeight : 0;
    const bottomPanelHeight = bottomPanel ? bottomPanel.offsetHeight : 0;
    // The panel's top offset (distance from top of viewport)
    const panel = (this as any).el?.nativeElement?.querySelector('.ai-tips-panel') as HTMLElement;
    const panelTop = panel ? panel.getBoundingClientRect().top : 40;
    // Calculate max height
    const maxHeight = window.innerHeight - (panelTop || 40) - controlBarHeight - bottomPanelHeight;
    if (panel) {
      panel.style.maxHeight = maxHeight > 100 ? `${maxHeight}px` : '100px';
    }
  };

  constructor(public el: ElementRef) {}
} 