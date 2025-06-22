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