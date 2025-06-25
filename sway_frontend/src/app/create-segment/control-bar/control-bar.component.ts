import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-control-bar',
  templateUrl: './control-bar.component.html',
  styleUrls: ['./control-bar.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ControlBarComponent {
  // Input properties from parent component
  @Input() currentFormationIndex: number = 0;
  @Input() totalFormations: number = 0;
  @Input() isPlaying: boolean = false;
  @Input() playbackTime: number = 0;
  @Input() totalSegmentDuration: number = 0;
  @Input() timelineZoom: number = 1;
  @Input() minTimelineZoom: number = 0.5;
  @Input() maxTimelineZoom: number = 3;
  @Input() timelineZoomStep: number = 0.1;
  @Input() isCaptain: boolean = false;
  @Input() canUndo: boolean = false;
  @Input() canRedo: boolean = false;

  // Output events to parent component
  @Output() prevFormation = new EventEmitter<void>();
  @Output() playPause = new EventEmitter<void>();
  @Output() nextFormation = new EventEmitter<void>();
  @Output() zoomChange = new EventEmitter<number>();
  @Output() addFormation = new EventEmitter<void>();
  @Output() duplicateFormation = new EventEmitter<void>();
  @Output() deleteFormation = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();

  onPrevFormation() {
    this.prevFormation.emit();
  }

  onPlayPause() {
    this.playPause.emit();
  }

  onNextFormation() {
    this.nextFormation.emit();
  }

  onUndo() {
    this.undo.emit();
  }

  onRedo() {
    this.redo.emit();
  }

  onZoomChange(event: any) {
    const newZoom = parseFloat(event.target.value);
    this.zoomChange.emit(newZoom);
  }

  onAddFormation() {
    this.addFormation.emit();
  }

  onDuplicateFormation() {
    this.duplicateFormation.emit();
  }

  onDeleteFormation() {
    this.deleteFormation.emit();
  }

  formatTime(time: number): string {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  getTimelineZoomPercentage(): number {
    return Math.round(this.timelineZoom * 100);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // Check if Command key is pressed (metaKey on Mac, ctrlKey on Windows/Linux)
    const isCommandPressed = event.metaKey || event.ctrlKey;
    
    if (isCommandPressed && event.key === 'z') {
      if (event.shiftKey) {
        // Command+Shift+Z = Redo
        if (this.canRedo) {
          event.preventDefault();
          this.onRedo();
        }
      } else {
        // Command+Z = Undo
        if (this.canUndo) {
          event.preventDefault();
          this.onUndo();
        }
      }
    }
  }
} 