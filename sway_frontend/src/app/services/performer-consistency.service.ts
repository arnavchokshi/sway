import { Injectable } from '@angular/core';
import { SegmentService } from './segment.service';
import { TeamService } from './team.service';
import { Observable, forkJoin, map, switchMap } from 'rxjs';

export interface PerformerPosition {
  performerId: string;
  performerName: string;
  x: number;
  y: number;
  side: 'left' | 'right' | 'center';
  segmentName?: string;
}

export interface SegmentAnalysis {
  segmentId: string;
  segmentName: string;
  performerPositions: PerformerPosition[];
}

export interface ConsistencyWarning {
  performerId: string;
  performerName: string;
  previousSegment: string;
  previousSide: 'left' | 'right' | 'center';
  currentSegment: string;
  currentSide: 'left' | 'right' | 'center';
  message: string;
}

// New interfaces for the additional positioning tips
export interface MirrorHeightWarning {
  performer1Id: string;
  performer1Name: string;
  performer2Id: string;
  performer2Name: string;
  heightDifference: number;
  message: string;
}

export interface SkillPositionWarning {
  backPerformerId: string;
  backPerformerName: string;
  frontPerformerId: string;
  frontPerformerName: string;
  skillDifference: number;
  message: string;
}

export interface FormationTip {
  type: 'consistency' | 'mirror_height' | 'skill_position';
  warning: ConsistencyWarning | MirrorHeightWarning | SkillPositionWarning;
}

@Injectable({
  providedIn: 'root'
})
export class PerformerConsistencyService {

  constructor(
    private segmentService: SegmentService,
    private teamService: TeamService
  ) {}

  /**
   * Analyzes performer positioning consistency across all segments for a team
   * Only checks boundary formations: first formation vs previous segment's last formation,
   * and last formation vs next segment's first formation
   */
  analyzePerformerConsistency(teamId: string): Observable<ConsistencyWarning[]> {
    return this.teamService.getTeamById(teamId).pipe(
      switchMap(teamResponse => {
        const teamRoster = teamResponse.team.members || [];
        const rosterMap = new Map<string, any>(teamRoster.map((member: any) => [member._id, member]));
        
        return this.segmentService.getSegmentsForTeam(teamId).pipe(
          map(response => {
            const segments = response.segments || [];
            if (segments.length < 2) {
              return []; // Need at least 2 segments to analyze consistency
            }

            // Sort segments by segmentOrder
            const sortedSegments = segments.sort((a, b) => {
              if (a.segmentOrder !== undefined && b.segmentOrder !== undefined) {
                return a.segmentOrder - b.segmentOrder;
              }
              return 0;
            });

            const warnings: ConsistencyWarning[] = [];
            
            // Analyze each segment boundary only once
            for (let i = 0; i < sortedSegments.length - 1; i++) {
              const currentSegment = sortedSegments[i];
              const nextSegment = sortedSegments[i + 1];
              
              console.log(`\nProcessing boundary ${i}: ${currentSegment.name} ↔ ${nextSegment.name}`);
              
              // Check current segment's last formation vs next segment's first formation
              console.log(`  Checking boundary: ${currentSegment.name} last formation vs ${nextSegment.name} first formation`);
              const lastFormationAnalysis = this.analyzeFormation(
                currentSegment.formations[currentSegment.formations.length - 1], 
                currentSegment, 
                rosterMap
              );
              const nextFirstFormationAnalysis = this.analyzeFormation(nextSegment.formations[0], nextSegment, rosterMap);
              
              this.compareFormations(
                lastFormationAnalysis,
                nextFirstFormationAnalysis,
                currentSegment.name,
                nextSegment.name,
                'boundary',
                warnings
              );
            }
            
            return warnings;
          })
        );
      })
    );
  }

  /**
   * Analyzes a specific formation for mirror height issues and skill-based position recommendations
   */
  analyzeFormationPositioning(formation: any[], segment: any, teamId: string): Observable<FormationTip[]> {
    return this.teamService.getTeamById(teamId).pipe(
      map(teamResponse => {
        const teamRoster = teamResponse.team.members || [];
        const rosterMap = new Map<string, any>(teamRoster.map((member: any) => [member._id, member]));
        
        const tips: FormationTip[] = [];
        
        // Analyze mirror height issues
        const mirrorHeightWarnings = this.analyzeMirrorHeights(formation, segment, rosterMap);
        mirrorHeightWarnings.forEach(warning => {
          tips.push({ type: 'mirror_height', warning });
        });
        
        // Analyze skill-based position recommendations
        const skillPositionWarnings = this.analyzeSkillPositions(formation, segment, rosterMap);
        skillPositionWarnings.forEach(warning => {
          tips.push({ type: 'skill_position', warning });
        });
        
        return tips;
      })
    );
  }

  /**
   * Analyzes mirror performers for height differences
   */
  private analyzeMirrorHeights(formation: any[], segment: any, rosterMap: Map<string, any>): MirrorHeightWarning[] {
    const warnings: MirrorHeightWarning[] = [];
    const stageCenterX = segment.width / 2;
    
    // Group performers by their Y position (same row)
    const performersByY = new Map<number, any[]>();
    
    formation.forEach((performer: any) => {
      if (performer.user) { // Only analyze real performers
        const y = Math.round(performer.y * 10) / 10; // Round to 1 decimal place for grouping
        if (!performersByY.has(y)) {
          performersByY.set(y, []);
        }
        performersByY.get(y)!.push(performer);
      }
    });
    
    // Check each row for mirror performers
    performersByY.forEach((performersInRow, yPosition) => {
      if (performersInRow.length < 2) return; // Need at least 2 performers in a row
      
      // Find mirror pairs
      for (let i = 0; i < performersInRow.length; i++) {
        for (let j = i + 1; j < performersInRow.length; j++) {
          const performer1 = performersInRow[i];
          const performer2 = performersInRow[j];
          
          // Check if they are mirrors (same Y, opposite X positions)
          const distanceFromCenter1 = Math.abs(performer1.x - stageCenterX);
          const distanceFromCenter2 = Math.abs(performer2.x - stageCenterX);
          
          // They are mirrors if they are roughly the same distance from center
          const tolerance = 1.0; // 1 foot tolerance
          if (Math.abs(distanceFromCenter1 - distanceFromCenter2) <= tolerance) {
            // Check if they are on opposite sides
            const isOppositeSides = (performer1.x < stageCenterX && performer2.x > stageCenterX) ||
                                   (performer1.x > stageCenterX && performer2.x < stageCenterX);
            
            if (isOppositeSides) {
              // Get their heights
              const user1 = rosterMap.get(performer1.user);
              const user2 = rosterMap.get(performer2.user);
              
              if (user1 && user2 && user1.height && user2.height) {
                const heightDifference = Math.abs(user1.height - user2.height);
                
                // If height difference is more than 10 inches, create a warning
                if (heightDifference > 10) {
                  const warning: MirrorHeightWarning = {
                    performer1Id: performer1.user,
                    performer1Name: user1.name,
                    performer2Id: performer2.user,
                    performer2Name: user2.name,
                    heightDifference,
                    message: `Your mirrors ${user1.name} and ${user2.name} have a significant height gap (${heightDifference.toFixed(0)} inches). Consider moving them for a more symmetrical formation.`
                  };
                  warnings.push(warning);
                }
              }
            }
          }
        }
      }
    });
    
    return warnings;
  }

  /**
   * Analyzes performers for skill-based position recommendations
   */
  private analyzeSkillPositions(formation: any[], segment: any, rosterMap: Map<string, any>): SkillPositionWarning[] {
    const warnings: SkillPositionWarning[] = [];
    const stageDepth = segment.depth || 24; // Default stage depth
    const stageCenterY = stageDepth / 2;
    
    // Analyze performers in the current formation
    const performersWithPositions: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      skillLevel: number;
    }> = [];
    
    formation.forEach((performer: any) => {
      if (performer.user) { // Only analyze real performers, not dummies
        const user = rosterMap.get(performer.user);
        if (user) {
          // Get skill level from the segment's styles
          let skillLevel = 1; // Default skill level
          if (segment.stylesInSegment && segment.stylesInSegment.length > 0) {
            // Try to find the highest skill level among the segment's styles
            const segmentStyles = segment.stylesInSegment.map((style: any) => 
              typeof style === 'string' ? style : style.name
            );
            
            for (const styleName of segmentStyles) {
              const styleKey = styleName.toLowerCase();
              const userSkillLevel = user.skillLevels?.[styleKey];
              if (userSkillLevel && userSkillLevel > skillLevel) {
                skillLevel = userSkillLevel;
              }
            }
          } else {
            // Fallback to any available skill level if no segment styles
            const availableSkills = Object.values(user.skillLevels || {});
            if (availableSkills.length > 0) {
              skillLevel = Math.max(...availableSkills.map(s => Number(s) || 1));
            }
          }
          
          performersWithPositions.push({
            id: performer.user,
            name: user.name,
            x: performer.x,
            y: performer.y,
            skillLevel
          });
        }
      }
    });
    
    // Find performers in back half vs front half
    const backHalfPerformers = performersWithPositions.filter(p => p.y > stageCenterY);
    const frontHalfPerformers = performersWithPositions.filter(p => p.y <= stageCenterY);
    
    // Compare skill levels between back and front performers
    backHalfPerformers.forEach(backPerformer => {
      frontHalfPerformers.forEach(frontPerformer => {
        const skillDifference = frontPerformer.skillLevel - backPerformer.skillLevel;
        
        // Recommend swap if front performer has significantly higher skill than back performer
        // This means we have a good dancer in front and bad dancer in back, which should be swapped
        if (skillDifference >= 2) {
          const warning: SkillPositionWarning = {
            backPerformerId: backPerformer.id,
            backPerformerName: backPerformer.name,
            frontPerformerId: frontPerformer.id,
            frontPerformerName: frontPerformer.name,
            skillDifference,
            message: `${frontPerformer.name} (skill level ${frontPerformer.skillLevel}) is positioned in the front half while ${backPerformer.name} (skill level ${backPerformer.skillLevel}) is in the back half. Consider swapping their positions for better visual impact.`
          };
          warnings.push(warning);
        }
      });
    });
    
    return warnings;
  }

  /**
   * Analyzes a specific formation to extract performer positions and sides
   */
  private analyzeFormation(formation: any[], segment: any, rosterMap: Map<string, any>): PerformerPosition[] {
    const performerPositions: PerformerPosition[] = [];
    
    if (formation && formation.length > 0) {
      formation.forEach((performer: any) => {
        if (performer.user) { // Only analyze real performers, not dummies
          const side = this.determineSide(performer.x, segment.width);
          performerPositions.push({
            performerId: performer.user,
            performerName: this.getPerformerName(performer, rosterMap),
            x: performer.x,
            y: performer.y,
            side,
            segmentName: segment.name
          });
        }
      });
    }
    
    return performerPositions;
  }

  /**
   * Compares two formations and generates warnings for inconsistent positioning
   */
  private compareFormations(
    formation1: PerformerPosition[],
    formation2: PerformerPosition[],
    segment1Name: string,
    segment2Name: string,
    position: 'start' | 'end' | 'boundary',
    warnings: ConsistencyWarning[]
  ) {
    console.log(`Comparing formations: ${segment1Name} vs ${segment2Name} (${position})`);
    console.log('Formation 1 performers:', formation1.map(p => `${p.performerName}: ${p.side}`));
    console.log('Formation 2 performers:', formation2.map(p => `${p.performerName}: ${p.side}`));
    
    formation1.forEach(performer1 => {
      const performer2 = formation2.find(p => p.performerId === performer1.performerId);
      
      if (performer2 && performer1.side !== performer2.side) {
        console.log(`Found inconsistency for ${performer1.performerName}: ${performer1.side} vs ${performer2.side}`);
        
        // Since we're only checking each boundary once, we don't need complex deduplication
        // Just create a simple key based on the segment pair and performer
        const normalizedKey = `${performer1.performerId}-${segment1Name}-${segment2Name}`;
        
        console.log('Generated normalized key:', normalizedKey);
        console.log('Current warnings count:', warnings.length);
        
        // Check if this exact positioning issue already exists
        const existingWarning = warnings.find(w => {
          const existingKey = `${w.performerId}-${w.previousSegment}-${w.currentSegment}`;
          console.log('Checking existing warning key:', existingKey, 'vs normalized key:', normalizedKey);
          return existingKey === normalizedKey;
        });
        
        if (!existingWarning) {
          // For boundary analysis, segment1 is always the previous segment and segment2 is the current segment
          const warning = {
            performerId: performer1.performerId,
            performerName: performer1.performerName,
            previousSegment: segment1Name,
            previousSide: performer1.side,
            currentSegment: segment2Name,
            currentSide: performer2.side,
            message: this.generateWarningMessage(
              performer1.performerName,
              segment1Name,
              performer1.side,
              segment2Name,
              performer2.side,
              position
            )
          };
          
          console.log('Adding warning:', warning.message);
          warnings.push(warning);
        } else {
          console.log('Skipping duplicate warning for:', performer1.performerName);
        }
      }
    });
  }

  /**
   * Analyzes a single segment to extract performer positions and sides
   */
  private analyzeSegment(segment: any, rosterMap: Map<string, any>): SegmentAnalysis {
    const performerPositions: PerformerPosition[] = [];
    
    if (segment.formations && segment.formations.length > 0) {
      // Use the last formation in the segment to determine final positions
      const lastFormation = segment.formations[segment.formations.length - 1];
      
      lastFormation.forEach((performer: any) => {
        if (performer.user) { // Only analyze real performers, not dummies
          const side = this.determineSide(performer.x, segment.width);
          performerPositions.push({
            performerId: performer.user,
            performerName: this.getPerformerName(performer, rosterMap),
            x: performer.x,
            y: performer.y,
            side,
            segmentName: segment.name
          });
        }
      });
    }
    
    return {
      segmentId: segment._id,
      segmentName: segment.name,
      performerPositions
    };
  }

  /**
   * Determines which side of the stage a performer is on based on their x position
   */
  private determineSide(x: number, stageWidth: number): 'left' | 'right' | 'center' {
    const centerX = stageWidth / 2;
    const tolerance = stageWidth * 0.1; // 10% of stage width for center zone
    
    if (x < centerX - tolerance) {
      return 'left';
    } else if (x > centerX + tolerance) {
      return 'right';
    } else {
      return 'center';
    }
  }

  /**
   * Gets the performer name from the roster or uses a fallback
   */
  private getPerformerName(performer: any, rosterMap: Map<string, any>): string {
    const teamMember = rosterMap.get(performer.user);
    if (teamMember && teamMember.name) {
      return teamMember.name;
    }
    return `Performer ${performer.user}`;
  }

  /**
   * Generates a user-friendly warning message
   */
  private generateWarningMessage(
    performerName: string,
    previousSegment: string,
    previousSide: string,
    currentSegment: string,
    currentSide: string,
    position: 'start' | 'end' | 'boundary'
  ): string {
    const sideNames: { [key: string]: string } = {
      left: 'left side',
      right: 'right side',
      center: 'center'
    };
    
    if (position === 'start') {
      return `${performerName} was on the ${sideNames[previousSide]} at the end of ${previousSegment} but starts on the ${sideNames[currentSide]} at the beginning of ${currentSegment}. Consider positioning them consistently at segment boundaries for smoother transitions.`;
    } else if (position === 'end') {
      return `${performerName} ends on the ${sideNames[previousSide]} in ${previousSegment} but should end on the ${sideNames[currentSide]} to match the start of ${currentSegment}. Consider adjusting the final formation for smoother transitions.`;
    } else {
      return `${performerName} was on the ${sideNames[previousSide]} at the end of ${previousSegment} but starts on the ${sideNames[currentSide]} at the beginning of ${currentSegment}. Consider positioning them consistently at segment boundaries for smoother transitions.`;
    }
  }

  /**
   * Analyzes a specific performer's positioning across all segments
   * Only shows boundary formations: first and last formation of each segment
   */
  analyzePerformerAcrossSegments(performerId: string, teamId: string): Observable<PerformerPosition[]> {
    return this.teamService.getTeamById(teamId).pipe(
      switchMap(teamResponse => {
        const teamRoster = teamResponse.team.members || [];
        const rosterMap = new Map<string, any>(teamRoster.map((member: any) => [member._id, member]));
        
        return this.segmentService.getSegmentsForTeam(teamId).pipe(
          map(response => {
            const segments = response.segments || [];
            const positions: PerformerPosition[] = [];
            
            // Sort segments by segmentOrder
            const sortedSegments = segments.sort((a, b) => {
              if (a.segmentOrder !== undefined && b.segmentOrder !== undefined) {
                return a.segmentOrder - b.segmentOrder;
              }
              return 0;
            });
            
            sortedSegments.forEach(segment => {
              if (segment.formations && segment.formations.length > 0) {
                // Check first formation
                const firstFormation = segment.formations[0];
                const firstPerformer = firstFormation.find((p: any) => p.user === performerId);
                
                if (firstPerformer) {
                  const side = this.determineSide(firstPerformer.x, segment.width);
                  positions.push({
                    performerId: firstPerformer.user,
                    performerName: this.getPerformerName(firstPerformer, rosterMap),
                    x: firstPerformer.x,
                    y: firstPerformer.y,
                    side,
                    segmentName: `${segment.name} (start)`
                  });
                }
                
                // Check last formation (only if different from first)
                if (segment.formations.length > 1) {
                  const lastFormation = segment.formations[segment.formations.length - 1];
                  const lastPerformer = lastFormation.find((p: any) => p.user === performerId);
                  
                  if (lastPerformer) {
                    const side = this.determineSide(lastPerformer.x, segment.width);
                    positions.push({
                      performerId: lastPerformer.user,
                      performerName: this.getPerformerName(lastPerformer, rosterMap),
                      x: lastPerformer.x,
                      y: lastPerformer.y,
                      side,
                      segmentName: `${segment.name} (end)`
                    });
                  }
                }
              }
            });
            
            return positions;
          })
        );
      })
    );
  }
} 