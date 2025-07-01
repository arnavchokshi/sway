import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AIFormationService, FormationSequence, AIFormationRequest } from '../../services/ai-formation.service';

@Component({
  selector: 'app-ai-formation-generator',
  templateUrl: './ai-formation-generator.component.html',
  styleUrls: ['./ai-formation-generator.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class AIFormationGeneratorComponent implements OnInit {
  @Input() teamRoster: any[] = [];
  @Input() stageWidth: number = 32;
  @Input() stageDepth: number = 24;
  @Input() danceStyles: string[] = [];
  @Output() formationsGenerated = new EventEmitter<FormationSequence>();

  concept: string = '';
  isGenerating: boolean = false;
  error: string = '';
  suggestions: string[] = [];
  generatedSequence: FormationSequence | null = null;
  showPreview: boolean = false;

  constructor(private aiFormationService: AIFormationService) {}

  ngOnInit() {
    this.loadSuggestions();
  }

  loadSuggestions() {
    const dancerCount = this.teamRoster.length;
    this.suggestions = this.aiFormationService.getFormationSuggestions(
      dancerCount, 
      this.stageWidth, 
      this.stageDepth
    );
  }

  async generateFormations() {
    if (!this.concept.trim()) {
      this.error = 'Please enter a formation concept';
      return;
    }

    this.isGenerating = true;
    this.error = '';
    this.generatedSequence = null;

    try {
      const request: AIFormationRequest = {
        concept: this.concept,
        dancerCount: this.teamRoster.length,
        stageWidth: this.stageWidth,
        stageDepth: this.stageDepth,
        teamRoster: this.teamRoster.map(dancer => ({
          id: dancer._id || dancer.id,
          name: dancer.name || dancer.firstName + ' ' + dancer.lastName,
          skillLevels: dancer.skillLevels || {},
          height: dancer.height
        })),
        danceStyles: this.danceStyles
      };

      this.generatedSequence = await this.aiFormationService.generateFormationSequence(request);
      this.showPreview = true;
    } catch (error) {
      console.error('Error generating formations:', error);
      this.error = error instanceof Error ? error.message : 'Failed to generate formations';
      
      // Try fallback formation
      try {
        const request: AIFormationRequest = {
          concept: this.concept,
          dancerCount: this.teamRoster.length,
          stageWidth: this.stageWidth,
          stageDepth: this.stageDepth,
          teamRoster: this.teamRoster.map(dancer => ({
            id: dancer._id || dancer.id,
            name: dancer.name || dancer.firstName + ' ' + dancer.lastName,
            skillLevels: dancer.skillLevels || {},
            height: dancer.height
          })),
          danceStyles: this.danceStyles
        };
        
        this.generatedSequence = this.aiFormationService.generateFallbackFormation(request);
        this.showPreview = true;
      } catch (fallbackError) {
        this.error = 'Unable to generate formations. Please try a different concept.';
      }
    } finally {
      this.isGenerating = false;
    }
  }

  useSuggestion(suggestion: string) {
    this.concept = suggestion;
  }

  applyFormations() {
    if (this.generatedSequence) {
      this.formationsGenerated.emit(this.generatedSequence);
      this.resetForm();
    }
  }

  resetForm() {
    this.concept = '';
    this.generatedSequence = null;
    this.showPreview = false;
    this.error = '';
  }

  closePreview() {
    this.showPreview = false;
    this.generatedSequence = null;
  }

  getFormationPreviewStyle(step: any, index: number) {
    return {
      'background-color': `hsl(${index * 60}, 70%, 90%)`,
      'border-left': `4px solid hsl(${index * 60}, 70%, 50%)`
    };
  }
} 