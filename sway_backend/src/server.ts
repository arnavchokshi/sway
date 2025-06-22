import express, { Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
require('dotenv/config');
import bcrypt from 'bcrypt';
import { User } from './models/User';
import { Team } from './models/Team';
import { Segment } from './models/Segment';
import AWS from 'aws-sdk';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.ATLAS_URI;
if (!uri) {
  console.error('ATLAS_URI is not defined in your .env file');
  process.exit(1);
}

mongoose.connect(uri)
  .then(() => {
    console.log("Successfully connected to MongoDB Atlas");
  })
  .catch((error: any) => {
    console.error("Error connecting to MongoDB Atlas:", error);
    process.exit(1);
  });

const connection = mongoose.connection;
connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

connection.once('open', () => {
  console.log("MongoDB database connection established successfully");
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

app.get('/', (req: Request, res: Response) => {
  res.send('Hello from the backend!');
});

app.post('/api/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, team } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, name, team, captain: true });
    await user.save();
    res.status(201).json({ message: 'User created', user });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

app.post('/api/teams', async (req: Request, res: Response) => {
  try {
    const { name, school, owner } = req.body;

    // Generate a unique join code: teamName + 2 random digits
    let joinCode;
    let isUnique = false;
    while (!isUnique) {
      const randomDigits = Math.floor(10 + Math.random() * 90); // 2 digits
      joinCode = `${name.replace(/\s+/g, '').toLowerCase()}${randomDigits}`;
      const existing = await Team.findOne({ joinCode });
      if (!existing) isUnique = true;
    }

    const team = new Team({ name, school, owner, members: [owner], joinCode });
    await team.save();
    res.status(201).json({ message: 'Team created', team });
  } catch (error: any) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: error.message || 'Failed to create team' });
  }
});

app.patch('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const update = req.body;
    
    // If password is being updated, hash it
    if (update.password) {
      update.password = await bcrypt.hash(update.password, 10);
    }

    // Fetch the user document
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If skillLevels is present, update it as a Map
    if (update.skillLevels) {
      user.skillLevels = update.skillLevels; // Accepts plain object for Map
      delete update.skillLevels;
    }

    // Update other fields
    Object.assign(user, update);
    await user.save();
    await user.populate('team', 'name _id');
    res.json({ message: 'User updated', user });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

app.post('/api/bulk-users', async (req: Request, res: Response) => {
  try {
    const { team, users } = req.body;
    // Create users and assign them to the team
    const createdUsers = await User.insertMany(users.map((u: any, idx: number) => ({
      ...u,
      team,
      email: u.email || `user${Date.now()}_${idx}@placeholder.com`
    })));
    const userIds = createdUsers.map(u => u._id);

    // Add these users to the team's members array
    await Team.findByIdAndUpdate(team, { $addToSet: { members: { $each: userIds } } });

    res.json({ message: 'Users created and added to team', users: createdUsers });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create users' });
  }
});

app.get('/api/team-by-join-code/:joinCode', async (req: Request, res: Response) => {
  try {
    const { joinCode } = req.params;
    const team = await Team.findOne({ joinCode }).populate({
      path: 'members',
      select: 'name email _id' // Explicitly select the fields we need
    });
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json({ team, members: team.members });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch team' });
  }
});

app.post('/api/segments', async (req: Request, res: Response) => {
  try {
    const { teamId, name, depth, width, divisions, animationDurations, stylesInSegment } = req.body;
    // Find the team to verify it exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    // Only allow styles that exist in the team's styles array
    const validStyleNames = (team.styles || []).map((s: any) => s.name);
    const filteredStyles = (Array.isArray(stylesInSegment) ? stylesInSegment : []).filter((s: any) => validStyleNames.includes(s));
    // Create the segment with provided name and grid settings
    const segment = new Segment({
      name,
      team: teamId,
      roster: [],
      formations: [],
      depth,
      width,
      divisions,
      animationDurations: Array.isArray(animationDurations) ? animationDurations : [1],
      musicUrl: '',
      stylesInSegment: filteredStyles
    });
    await segment.save();
    res.status(201).json({ message: 'Segment created', segment });
  } catch (error: any) {
    console.error('Error creating segment:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create segment' });
  }
});

app.post('/api/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  console.log('Login attempt:', { email });
  try {
    const user = await User.findOne({ email }).populate('team');
    console.log('Found user:', user ? 'Yes' : 'No');
    if (!user) return res.status(400).json({ error: 'User not found' });

    // If you use bcrypt for password hashing
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch ? 'Yes' : 'No');
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Don't send password back
    const { password: _, ...userData } = user.toObject();
    res.json({ user: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/segments/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const segments = await Segment.find({ team: teamId });
    res.json({ segments });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch segments' });
  }
});

app.get('/api/teams/:id', async (req: Request, res: Response) => {
  try {
    const team = await Team.findById(req.params.id).populate('members');
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({ team });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch team' });
  }
});

app.get('/api/segment/:id', async (req: Request, res: Response) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });
    res.json({ segment });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch segment' });
  }
});

app.patch('/api/segment/:id', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    let oldMusicUrl = null;
    // Only allow stylesInSegment to be updated if provided
    if (update.stylesInSegment) {
      const segment = await Segment.findById(req.params.id);
      if (!segment) return res.status(404).json({ error: 'Segment not found' });
      const team = await Team.findById(segment.team);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      const validStyleNames = (team.styles || []).map((s: any) => s.name);
      update.stylesInSegment = (Array.isArray(update.stylesInSegment) ? update.stylesInSegment : []).filter((s: any) => validStyleNames.includes(s));
    }
    // If musicUrl is being updated, delete the old audio file from S3
    if (update.musicUrl) {
      const segment = await Segment.findById(req.params.id);
      if (segment && segment.musicUrl && segment.musicUrl !== update.musicUrl) {
        oldMusicUrl = segment.musicUrl;
      }
    }
    const segment = await Segment.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    // Delete old audio file from S3 if needed
    if (oldMusicUrl) {
      const key = oldMusicUrl.split('.com/')[1];
      if (key) {
        try {
          await s3.deleteObject({
            Bucket: process.env.AWS_S3_BUCKET || '',
            Key: key
          }).promise();
          console.log('Old audio deleted from S3:', key);
        } catch (err) {
          console.error('Failed to delete old audio from S3:', err);
        }
      }
    }
    if (!segment) return res.status(404).json({ error: 'Segment not found' });
    res.json({ message: 'Segment updated', segment });
  } catch (error: any) {
    console.error('Error updating segment:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update segment' });
  }
});

app.delete('/api/segment/:id', async (req: Request, res: Response) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    // --- NEW: Delete all dummy users in the segment's roster ---
    if (segment.roster && segment.roster.length > 0) {
      // Find all users in the roster who are dummies
      const dummyUsers = await User.find({ _id: { $in: segment.roster }, isDummy: true });
      const dummyIds = dummyUsers.map(u => u._id);
      if (dummyIds.length > 0) {
        await User.deleteMany({ _id: { $in: dummyIds } });
        console.log('Deleted dummy users:', dummyIds);
      }
    }
    // --- END NEW ---

    // If segment has a musicUrl, delete the audio file from S3
    if (segment.musicUrl) {
      const key = segment.musicUrl.split('.com/')[1];
      if (key) {
        try {
          await s3.deleteObject({
            Bucket: process.env.AWS_S3_BUCKET || '',
            Key: key
          }).promise();
          console.log('Audio deleted from S3:', key);
        } catch (err) {
          console.error('Failed to delete audio from S3:', err);
        }
      }
    }

    // Now delete the segment from the database
    await Segment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Segment deleted', segment });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete segment' });
  }
});

app.post('/api/segment/:id/music-presigned-url', async (req: Request, res: Response) => {
  const { filename, filetype } = req.body;
  const segmentId = req.params.id;
  const key = `segments/${segmentId}/${Date.now()}_${filename}`;
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Expires: 60, // seconds
    ContentType: filetype
  };
  try {
    const url = await s3.getSignedUrlPromise('putObject', params);
    res.json({ url, key });
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    res.status(500).json({ error: 'Failed to generate S3 presigned URL' });
  }
});

// Add new endpoint to get signed URL for reading the file
app.get('/api/segment/:id/music-url', async (req: Request, res: Response) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment || !segment.musicUrl) {
      return res.status(404).json({ error: 'Music file not found' });
    }

    // Extract the key from the musicUrl
    const key = segment.musicUrl.split('.com/')[1];
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Expires: 3600 // URL expires in 1 hour
    };

    const url = await s3.getSignedUrlPromise('getObject', params);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

app.post('/api/segment/:id/video-presigned-url', async (req: Request, res: Response) => {
  const { filename, filetype } = req.body;
  const segmentId = req.params.id;
  const key = `segments/${segmentId}/videos/${Date.now()}_${filename}`;
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Expires: 60, // seconds
    ContentType: filetype
  };
  try {
    const url = await s3.getSignedUrlPromise('putObject', params);
    res.json({ url, key });
  } catch (err) {
    console.error('Error generating video presigned URL:', err);
    res.status(500).json({ error: 'Failed to generate S3 presigned URL' });
  }
});

// Add new endpoint to get signed URL for reading video
app.get('/api/segment/:id/video-url', async (req: Request, res: Response) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    if (!segment.videoUrl) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    res.json({ url: segment.videoUrl });
  } catch (error: any) {
    console.error('Error getting video URL:', error);
    res.status(500).json({ error: 'Failed to get video URL' });
  }
});

app.post('/api/teams/:id/members', async (req: Request, res: Response) => {
  try {
    const teamId = req.params.id;
    const { name, isDummy } = req.body;

    // Create a new user for this member
    const user = new User({
      name,
      team: teamId,
      captain: false,
      isDummy: !!isDummy
    });
    await user.save();

    // Add the user to the team's members array
    const team = await Team.findByIdAndUpdate(
      teamId,
      { $addToSet: { members: user._id } },
      { new: true }
    ).populate('members');

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({ message: 'Member added successfully', team, user });
  } catch (error: any) {
    console.error('Error adding team member:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add team member' });
  }
});

app.get('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).populate('team');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Don't send password back
    const { password: _, ...userData } = user.toObject();
    res.json(userData);
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch user' });
  }
});

app.patch('/api/teams/:teamId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const { teamId, memberId } = req.params;
    const { captain } = req.body;

    // Update the user's captain status
    const user = await User.findByIdAndUpdate(
      memberId,
      { captain },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the updated team with populated members
    const team = await Team.findById(teamId).populate('members');
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({ message: 'Member role updated', team });
  } catch (error: any) {
    console.error('Error updating member role:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update member role' });
  }
});

// Add style to team
app.post('/api/teams/:id/styles', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const team = await Team.findByIdAndUpdate(
      id,
      { $push: { styles: { name, color } } },
      { new: true }
    ).populate('members');

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({ message: 'Style added successfully', team });
  } catch (error: any) {
    console.error('Error adding style:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add style' });
  }
});

// Update style
app.patch('/api/teams/:teamId/styles/:styleIndex', async (req: Request, res: Response) => {
  try {
    const { teamId, styleIndex } = req.params;
    const { name, color } = req.body;

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (!team.styles[styleIndex]) {
      return res.status(404).json({ error: 'Style not found' });
    }

    team.styles[styleIndex] = { name, color };
    await team.save();

    const updatedTeam = await Team.findById(teamId).populate('members');
    res.json({ message: 'Style updated successfully', team: updatedTeam });
  } catch (error: any) {
    console.error('Error updating style:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update style' });
  }
});

// Delete style
app.delete('/api/teams/:teamId/styles/:styleIndex', async (req: Request, res: Response) => {
  try {
    const { teamId, styleIndex } = req.params;

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get the style name before deleting it
    const styleToDelete = team.styles[parseInt(styleIndex)];
    if (!styleToDelete) {
      return res.status(404).json({ error: 'Style not found' });
    }

    // Remove the style from the team
    team.styles.splice(parseInt(styleIndex), 1);
    await team.save();

    // Remove the style from all segments that contain it
    await Segment.updateMany(
      { team: teamId, stylesInSegment: styleToDelete.name },
      { $pull: { stylesInSegment: styleToDelete.name } }
    );

    const updatedTeam = await Team.findById(teamId).populate('members');
    res.json({ message: 'Style deleted successfully', team: updatedTeam });
  } catch (error: any) {
    console.error('Error deleting style:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete style' });
  }
});

app.post('/api/dummy-users', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const user = new User({
      name,
      isDummy: true
    });
    await user.save();
    res.status(201).json({ user });
  } catch (error: any) {
    console.error('Error creating dummy user:', error);
    res.status(500).json({ error: (error instanceof Error ? error.message : 'Failed to create dummy user') });
  }
});

app.delete('/api/dummy-users/:id', async (req: Request, res: Response) => {
  try {
    console.log('🗑️ DEBUG Backend: Attempting to delete dummy user with ID:', req.params.id);
    
    const user = await User.findById(req.params.id);
    console.log('🗑️ DEBUG Backend: Found user:', user ? { _id: user._id, name: user.name, isDummy: user.isDummy } : 'NOT FOUND');
    
    if (!user) {
      console.log('❌ DEBUG Backend: User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.isDummy) {
      console.log('❌ DEBUG Backend: User is not a dummy user');
      return res.status(400).json({ error: 'Cannot delete non-dummy user' });
    }
    
    console.log('✅ DEBUG Backend: Deleting dummy user:', user._id);
    await User.findByIdAndDelete(req.params.id);
    console.log('✅ DEBUG Backend: Dummy user deleted successfully');
    
    res.json({ message: 'Dummy user deleted' });
  } catch (error: any) {
    console.error('❌ DEBUG Backend: Error deleting dummy user:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete dummy user' });
  }
});

app.delete('/api/teams/:teamId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const { teamId, memberId } = req.params;

    // Remove the member from the team's members array
    const team = await Team.findByIdAndUpdate(
      teamId,
      { $pull: { members: memberId } },
      { new: true }
    ).populate('members');

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Actually delete the user document as well
    await User.findByIdAndDelete(memberId);

    res.json({ message: 'Member removed successfully', team });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to remove member' });
  }
});

app.listen(port, () => {
    console.log(`Server is running at: http://localhost:${port}`);
});