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
            
            // Analyze each segment against the most recent previous segment for each performer
            for (let i = 1; i < sortedSegments.length; i++) {
              const currentSegment = sortedSegments[i];
              const currentAnalysis = this.analyzeSegment(currentSegment, rosterMap);
              
              // For each performer in the current segment, find their most recent previous appearance
              currentAnalysis.performerPositions.forEach(currentPerformer => {
                const previousSegment = this.findMostRecentPreviousSegment(
                  currentPerformer.performerId, 
                  sortedSegments, 
                  i, 
                  rosterMap
                );
                
                if (previousSegment) {
                  const previousAnalysis = this.analyzeSegment(previousSegment, rosterMap);
                  const previousPerformer = previousAnalysis.performerPositions.find(
                    p => p.performerId === currentPerformer.performerId
                  );
                  
                  if (previousPerformer && previousPerformer.side !== currentPerformer.side) {
                    warnings.push({
                      performerId: currentPerformer.performerId,
                      performerName: currentPerformer.performerName,
                      previousSegment: previousSegment.name,
                      previousSide: previousPerformer.side,
                      currentSegment: currentSegment.name,
                      currentSide: currentPerformer.side,
                      message: this.generateWarningMessage(
                        currentPerformer.performerName,
                        previousSegment.name,
                        previousPerformer.side,
                        currentSegment.name,
                        currentPerformer.side
                      )
                    });
                  }
                }
              });
            }
            
            return warnings;
          })
        );
      })
    );
  }

  /**
   * Finds the most recent previous segment where a performer appears
   */
  private findMostRecentPreviousSegment(
    performerId: string, 
    sortedSegments: any[], 
    currentIndex: number, 
    rosterMap: Map<string, any>
  ): any | null {
    // Look backwards from the current segment to find the most recent appearance
    for (let i = currentIndex - 1; i >= 0; i--) {
      const segment = sortedSegments[i];
      const analysis = this.analyzeSegment(segment, rosterMap);
      
      // Check if this performer appears in this segment
      const performerInSegment = analysis.performerPositions.find(
        p => p.performerId === performerId
      );
      
      if (performerInSegment) {
        return segment;
      }
    }
    
    return null; // No previous appearance found
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
    currentSide: string
  ): string {
    const sideNames: { [key: string]: string } = {
      left: 'left side',
      right: 'right side',
      center: 'center'
    };
    
    return `${performerName} ended on the ${sideNames[previousSide]} in ${previousSegment} but starts on the ${sideNames[currentSide]} in ${currentSegment}. Consider positioning them consistently for smoother transitions.`;
  }

  /**
   * Analyzes a specific performer's positioning across all segments
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
                const lastFormation = segment.formations[segment.formations.length - 1];
                const performer = lastFormation.find((p: any) => p.user === performerId);
                
                if (performer) {
                  const side = this.determineSide(performer.x, segment.width);
                  positions.push({
                    performerId: performer.user,
                    performerName: this.getPerformerName(performer, rosterMap),
                    x: performer.x,
                    y: performer.y,
                    side,
                    segmentName: segment.name
                  });
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