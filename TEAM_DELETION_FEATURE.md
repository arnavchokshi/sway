# Team Deletion with Cascading Deletes

This feature ensures that when a team is deleted from the database, all associated sets and segments are automatically deleted as well.

## Implementation Details

### Backend Changes

1. **New API Endpoint**: `DELETE /api/teams/:teamId`
   - Deletes the team and all associated data
   - Returns information about what was deleted

2. **Database Middleware**: Added pre-delete middleware to the Team model
   - Automatically deletes all segments associated with the team
   - Automatically deletes all sets associated with the team
   - Provides an additional layer of protection against orphaned data

### Frontend Changes

1. **New Service Method**: `TeamService.deleteTeam(teamId: string)`
   - Calls the new backend endpoint
   - Returns an Observable with deletion results

## Usage Example

```typescript
// In your component
import { TeamService } from '../services/team.service';

constructor(private teamService: TeamService) {}

deleteTeam(teamId: string) {
  if (confirm('Are you sure you want to delete this team? This will also delete all associated sets and segments.')) {
    this.teamService.deleteTeam(teamId).subscribe({
      next: (response) => {
        console.log('Team deleted successfully:', response);
        // Handle success (e.g., redirect to home page)
      },
      error: (error) => {
        console.error('Error deleting team:', error);
        // Handle error
      }
    });
  }
}
```

## API Response Format

```json
{
  "message": "Team and all associated data deleted successfully",
  "deletedTeam": {
    "_id": "team_id",
    "name": "Team Name",
    // ... other team properties
  },
  "deletedSegments": 5,
  "deletedSets": 3
}
```

## Safety Features

1. **Double Protection**: Both the API endpoint and database middleware handle cascading deletes
2. **Logging**: All deletions are logged for debugging purposes
3. **Error Handling**: Comprehensive error handling at both frontend and backend levels
4. **Confirmation**: Frontend should implement user confirmation before deletion

## Database Relationships

- **Team** → **Sets** (one-to-many)
- **Team** → **Segments** (one-to-many)
- **Sets** → **Segments** (many-to-many through segments array)

When a team is deleted, all related sets and segments are automatically removed to maintain data integrity. 