import { Injectable } from '@angular/core';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface FormationStep {
  description: string;
  formationType: string;
  dancerCount: number;
  positions: Array<{
    x: number;
    y: number;
    dancerId?: string;
  }>;
  spacing?: number;
  centerX?: number;
  centerY?: number;
}

export interface FormationSequence {
  steps: FormationStep[];
  totalFormations: number;
  concept: string;
  estimatedDuration: number; // in seconds
}

export interface AIFormationRequest {
  concept: string;
  dancerCount: number;
  stageWidth: number;
  stageDepth: number;
  teamRoster: Array<{
    id: string;
    name: string;
    skillLevels: { [styleName: string]: number };
    height?: number;
  }>;
  danceStyles: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AIFormationService {
  private genAI: GoogleGenerativeAI;
  private readonly API_KEY = 'AIzaSyDiHM9oln89bRwYrk22tCfAgidCClkALQU';

  constructor() {
    this.genAI = new GoogleGenerativeAI(this.API_KEY);
  }

  /**
   * Generate formation sequence from natural language concept
   */
  async generateFormationSequence(request: AIFormationRequest): Promise<FormationSequence> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

      const prompt = this.buildPrompt(request);
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return this.parseAIResponse(text, request);
    } catch (error) {
      console.error('Error generating formation sequence:', error);
      throw new Error('Failed to generate formation sequence. Please try again.');
    }
  }

  /**
   * Build the prompt for Gemini API
   */
  private buildPrompt(request: AIFormationRequest): string {
    return `
You are an expert dance formation choreographer. Generate a formation sequence based on the user's concept.

CONCEPT: ${request.concept}
DANCER COUNT: ${request.dancerCount}
STAGE DIMENSIONS: ${request.stageWidth} feet wide x ${request.stageDepth} feet deep
DANCE STYLES: ${request.danceStyles.join(', ')}

AVAILABLE DANCERS:
${request.teamRoster.map(dancer => 
  `- ${dancer.name} (ID: ${dancer.id}): Skills: ${Object.entries(dancer.skillLevels).map(([style, level]) => `${style}: ${level}/5`).join(', ')}`
).join('\n')}

TASK: Create a formation sequence that matches the concept. Each formation should be practical and achievable.

OUTPUT FORMAT (JSON):
{
  "steps": [
    {
      "description": "Brief description of this formation",
      "formationType": "circle|line|diamond|v|scattered|custom",
      "dancerCount": 8,
      "positions": [
        {"x": 16, "y": 12, "dancerId": "optional_specific_dancer_id"}
      ],
      "spacing": 4,
      "centerX": 16,
      "centerY": 12
    }
  ],
  "totalFormations": 3,
  "concept": "Original concept",
  "estimatedDuration": 45
}

RULES:
1. X coordinates: 0 to ${request.stageWidth} (left to right)
2. Y coordinates: 0 to ${request.stageDepth} (front to back)
3. Keep dancers on stage (x >= 0, x <= ${request.stageWidth})
4. Maintain reasonable spacing (2-6 feet between dancers)
5. Consider skill levels - place stronger dancers in key positions
6. Make transitions logical and smooth
7. Each formation should be visually balanced

Generate only the JSON response, no additional text.
`;
  }

  /**
   * Parse the AI response into a FormationSequence
   */
  private parseAIResponse(response: string, request: AIFormationRequest): FormationSequence {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and enhance the response
      const steps: FormationStep[] = parsed.steps.map((step: any, index: number) => {
        return {
          description: step.description || `Formation ${index + 1}`,
          formationType: step.formationType || 'custom',
          dancerCount: step.dancerCount || request.dancerCount,
          positions: this.validatePositions(step.positions, request.stageWidth, request.stageDepth),
          spacing: step.spacing || 4,
          centerX: step.centerX || request.stageWidth / 2,
          centerY: step.centerY || request.stageDepth / 2
        };
      });

      return {
        steps,
        totalFormations: parsed.totalFormations || steps.length,
        concept: parsed.concept || request.concept,
        estimatedDuration: parsed.estimatedDuration || (steps.length * 15) // 15 seconds per formation
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      throw new Error('Failed to parse formation sequence. Please try again.');
    }
  }

  /**
   * Validate and fix positions to ensure they're within stage bounds
   */
  private validatePositions(positions: any[], stageWidth: number, stageDepth: number): Array<{x: number, y: number, dancerId?: string}> {
    return positions.map(pos => ({
      x: Math.max(0, Math.min(stageWidth, pos.x || 0)),
      y: Math.max(0, Math.min(stageDepth, pos.y || 0)),
      dancerId: pos.dancerId
    }));
  }

  /**
   * Generate a simple formation as fallback
   */
  generateFallbackFormation(request: AIFormationRequest): FormationSequence {
    const centerX = request.stageWidth / 2;
    const centerY = request.stageDepth / 2;
    
    // Create a simple circle formation
    const positions = [];
    const radius = Math.min(request.stageWidth, request.stageDepth) / 4;
    
    for (let i = 0; i < request.dancerCount; i++) {
      const angle = (i / request.dancerCount) * 2 * Math.PI;
      positions.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      });
    }

    return {
      steps: [{
        description: 'Circle formation in center',
        formationType: 'circle',
        dancerCount: request.dancerCount,
        positions,
        spacing: radius,
        centerX,
        centerY
      }],
      totalFormations: 1,
      concept: request.concept,
      estimatedDuration: 15
    };
  }

  /**
   * Get formation suggestions based on common patterns
   */
  getFormationSuggestions(dancerCount: number, stageWidth: number, stageDepth: number): string[] {
    const suggestions = [
      `Start with ${dancerCount} dancers in a circle in the center, then spread out into a larger circle`,
      `Begin with ${dancerCount} dancers in a line across the front, then move into a V formation`,
      `Start with ${dancerCount} dancers scattered across the stage, then form a diamond shape`,
      `Begin with ${dancerCount} dancers in two parallel lines, then merge into a single line`,
      `Start with ${dancerCount} dancers in a tight cluster, then expand into a wide formation`
    ];

    return suggestions;
  }
} 