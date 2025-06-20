# Performer Consistency Feature

## Overview

The Performer Consistency Feature is a non-intrusive system that helps users maintain consistent performer positioning across segments. It analyzes the final positions of performers in each segment and provides helpful warnings when performers end on different sides of the stage between consecutive segments.

## How It Works

### 1. Position Analysis
- Analyzes the last formation in each segment to determine where performers end
- Determines which side of the stage each performer is on (left, right, or center)
- Uses a 10% tolerance zone in the center of the stage

### 2. Cross-Segment Comparison
- **Smart Performer Tracking**: For each performer in a segment, finds their most recent previous appearance in any earlier segment
- **Non-Adjacent Analysis**: Unlike simple adjacent segment comparison, this system can detect inconsistencies across any number of intervening segments
- **Example**: If a performer appears in Segment 1, then Segment 4, the system will compare their positions between these segments, not just between adjacent segments

### 3. Warning Generation
- Identifies performers who end on different sides between their most recent previous segment and current segment
- Provides specific, actionable messages about positioning inconsistencies
- Shows the exact segments and sides involved in the inconsistency

## Key Features

### Non-Intrusive Design
- Warnings appear in a floating panel that doesn't interfere with workflow
- Users can dismiss warnings when they're not needed
- Warnings only show for the current segment being edited

### Smart Detection
- **Most Recent Previous**: Finds the closest previous segment where each performer appears
- **Cross-Segment Gaps**: Works even when performers skip multiple segments
- **Real-time Updates**: Checks for warnings when formations are added, modified, or saved

### Helpful Messages
- Clear, specific guidance about which performer needs attention
- Shows the exact segments and side changes involved
- Suggests positioning consistency for smoother transitions

## Technical Implementation

### Service Architecture
- `PerformerConsistencyService`: Core analysis logic
- `analyzePerformerConsistency()`: Main method for cross-segment analysis
- `findMostRecentPreviousSegment()`: Smart algorithm to find previous appearances

### Integration Points
- **Create Segment Component**: Displays warnings and triggers checks
- **Formation Changes**: Automatically checks when performers are moved or added
- **Save Operations**: Validates consistency when segments are saved

### Performance Considerations
- Efficient segment sorting by `segmentOrder`
- Smart caching of roster data
- Debounced warning checks to avoid excessive API calls

## Usage Examples

### Scenario 1: Adjacent Segments
- **Segment 1**: Performer A ends on left side
- **Segment 2**: Performer A starts on right side
- **Result**: Warning about side inconsistency

### Scenario 2: Non-Adjacent Segments
- **Segment 1**: Performer B ends on left side
- **Segment 2**: Performer B not present
- **Segment 3**: Performer B not present  
- **Segment 4**: Performer B starts on right side
- **Result**: Warning about side inconsistency between Segment 1 and Segment 4

### Scenario 3: Multiple Performers
- **Segment 1**: Performers A, B, C all end on left side
- **Segment 4**: Performers A, B start on left side, C starts on right side
- **Result**: Warning only for Performer C's inconsistency

## Benefits

1. **Improved Choreography Flow**: Helps maintain logical performer movement patterns
2. **Reduced Confusion**: Prevents jarring position changes between segments
3. **Better Performance**: Smoother transitions when performers maintain consistent sides
4. **Educational**: Teaches users about good choreography practices
5. **Non-Blocking**: Provides guidance without forcing changes

## Future Enhancements

- **Pattern Recognition**: Detect common positioning patterns and suggest optimizations
- **Visual Indicators**: Show suggested positioning on the stage
- **Batch Operations**: Allow users to fix multiple inconsistencies at once
- **Custom Rules**: Allow teams to define their own consistency rules 