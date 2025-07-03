import express, { Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
require('dotenv/config');
import bcrypt from 'bcrypt';
import { User } from './models/User';
import { Team } from './models/Team';
import { Segment } from './models/Segment';
import { Set } from './models/Set';
import AWS from 'aws-sdk';
import Stripe from 'stripe';
import { MembershipService } from './services/membership.service';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2025-05-28.basil' });

// Stripe configuration
const STRIPE_PRICE_ID = 'price_1RfwCNAnXImjVuyNGaYJGbVz';
const STRIPE_WEBHOOK_SECRET = 'whsec_sROy3Y1dUexPbdHGE3dxWjeXrUrl5IlC';

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

    // Generate a unique 7-character join code: first 4 letters of team name + 3 random digits
    let joinCode;
    let isUnique = false;
    while (!isUnique) {
      const teamNamePrefix = name.replace(/\s+/g, '').toLowerCase().substring(0, 4).padEnd(4, 'a');
      const randomDigits = Math.floor(100 + Math.random() * 900); // 3 digits (100-999)
      joinCode = `${teamNamePrefix}${randomDigits}`;
      const existing = await Team.findOne({ joinCode });
      if (!existing) isUnique = true;
    }

    // Set 3 months of Pro and generate referral code
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    const referralCode = await import('./services/membership.service').then(m => m.MembershipService.generateUniqueReferralCode());

    const team = new Team({
      name,
      school,
      owner,
      members: [owner],
      joinCode,
      membershipType: 'pro',
      membershipExpiresAt: threeMonthsFromNow,
      referralCode: await referralCode
    });
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
    console.log('Looking for team with join code:', joinCode);
    
    // Try case-insensitive search
    const team = await Team.findOne({ 
      joinCode: { $regex: new RegExp(`^${joinCode}$`, 'i') }
    }).populate({
      path: 'members',
      select: 'name email _id' // Explicitly select the fields we need
    });
    
    console.log('Team found:', team ? 'Yes' : 'No');
    if (team) {
      console.log('Team name:', team.name, 'Join code:', team.joinCode);
    }
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json({ team, members: team.members });
  } catch (error: any) {
    console.error('Error in team lookup:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch team' });
  }
});

app.post('/api/segments', async (req: Request, res: Response) => {
  try {
    const { teamId, name, depth, width, divisions, animationDurations, stylesInSegment, createdBy, isPublic, setId } = req.body;
    
    // Validate required fields
    if (!createdBy) {
      return res.status(400).json({ error: 'createdBy field is required' });
    }
    
    // Find the team to verify it exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    // Verify the user exists
    const user = await User.findById(createdBy);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
      stylesInSegment: filteredStyles,
      createdBy: createdBy,
      isPublic: isPublic !== undefined ? isPublic : true,
      segmentSet: setId || undefined
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

// New endpoint for privacy-aware segment fetching
app.get('/api/segments/:teamId/visible', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { userId } = req.query; // Get user ID from query parameter
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get user to check if they're a captain
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    let segments;
    if (user.captain) {
      // Captains can see all segments
      segments = await Segment.find({ team: teamId });
    } else {
      // Non-captains can only see public segments
      segments = await Segment.find({ team: teamId, isPublic: true });
    }
    
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

// Add endpoint to update team join code
app.patch('/api/teams/:teamId/join-code', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { joinCode } = req.body;

    // Validate join code format (7 characters, alphanumeric)
    if (!joinCode || joinCode.length !== 7 || !/^[a-zA-Z0-9]{7}$/.test(joinCode)) {
      return res.status(400).json({ error: 'Join code must be exactly 7 alphanumeric characters' });
    }

    // Check if join code is already in use by another team
    const existingTeam = await Team.findOne({ joinCode, _id: { $ne: teamId } });
    if (existingTeam) {
      return res.status(400).json({ error: 'This join code is already in use by another team' });
    }

    // Update the team's join code
    const team = await Team.findByIdAndUpdate(
      teamId,
      { joinCode },
      { new: true }
    );

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({ message: 'Join code updated successfully', team });
  } catch (error: any) {
    console.error('Error updating join code:', error);
    res.status(500).json({ error: error.message || 'Failed to update join code' });
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

    // Now delete the segment from the database (dummy templates are handled automatically)
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

// Remove the old dummy user endpoints and replace with dummy template management
app.post('/api/segments/:segmentId/dummy-templates', async (req: Request, res: Response) => {
  try {
    const { segmentId } = req.params;
    const { name, skillLevels, height, customColor } = req.body;
    
    const segment = await Segment.findById(segmentId);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    // Generate unique dummy template ID
    const dummyTemplateId = `dummy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const dummyTemplate = {
      id: dummyTemplateId,
      name,
      skillLevels: skillLevels || {},
      height: height || 5.5,
      customColor
    };

    // Add dummy template to segment
    segment.dummyTemplates.push(dummyTemplate);
    await segment.save();

    res.status(201).json({ dummyTemplate });
  } catch (error: any) {
    console.error('Error creating dummy template:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create dummy template' });
  }
});

app.delete('/api/segments/:segmentId/dummy-templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { segmentId, templateId } = req.params;
    
    const segment = await Segment.findById(segmentId);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    // Remove dummy template from segment
    segment.dummyTemplates = segment.dummyTemplates.filter(template => template.id !== templateId);
    
    // Remove references to this dummy template from all formations
    segment.formations = segment.formations.map(formation =>
      formation.filter(position => position.dummyTemplateId !== templateId)
    );
    
    await segment.save();
    
    res.json({ message: 'Dummy template deleted' });
  } catch (error: any) {
    console.error('Error deleting dummy template:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete dummy template' });
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

// Delete team with cascading deletes for sets and segments
app.delete('/api/teams/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // Find the team to verify it exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Delete all segments associated with this team
    const deletedSegments = await Segment.deleteMany({ team: teamId });
    console.log(`Deleted ${deletedSegments.deletedCount} segments for team ${teamId}`);

    // Delete all sets associated with this team
    const deletedSets = await Set.deleteMany({ team: teamId });
    console.log(`Deleted ${deletedSets.deletedCount} sets for team ${teamId}`);

    // Delete the team itself
    const deletedTeam = await Team.findByIdAndDelete(teamId);
    console.log(`Deleted team: ${deletedTeam?.name} (${teamId})`);

    res.json({ 
      message: 'Team and all associated data deleted successfully',
      deletedTeam,
      deletedSegments: deletedSegments.deletedCount,
      deletedSets: deletedSets.deletedCount
    });
  } catch (error: any) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: error.message || 'Failed to delete team' });
  }
});

// Sets API endpoints
app.post('/api/sets', async (req: Request, res: Response) => {
  try {
    const { teamId, name } = req.body;
    
    // Find the team to verify it exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const set = new Set({
      name,
      team: teamId,
      segments: [],
      transitionTimes: []
    });

    await set.save();
    res.status(201).json({ message: 'Set created', set });
  } catch (error: any) {
    console.error('Error creating set:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create set' });
  }
});

app.get('/api/sets/team/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const sets = await Set.find({ team: teamId });
    res.json({ sets });
  } catch (error: any) {
    console.error('Error fetching sets:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch sets' });
  }
});

app.get('/api/sets/:id', async (req: Request, res: Response) => {
  try {
    const set = await Set.findById(req.params.id).populate('segments');
    if (!set) return res.status(404).json({ error: 'Set not found' });
    res.json({ set });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch set' });
  }
});

app.patch('/api/sets/:id', async (req: Request, res: Response) => {
  try {
    const set = await Set.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!set) return res.status(404).json({ error: 'Set not found' });
    res.json({ message: 'Set updated', set });
  } catch (error: any) {
    console.error('Error updating set:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update set' });
  }
});

app.delete('/api/sets/:id', async (req: Request, res: Response) => {
  try {
    const set = await Set.findByIdAndDelete(req.params.id);
    if (!set) return res.status(404).json({ error: 'Set not found' });
    res.json({ message: 'Set deleted', set });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete set' });
  }
});

app.post('/api/sets/:id/segments', async (req: Request, res: Response) => {
  try {
    const { segmentId, transitionTime } = req.body;
    const set = await Set.findById(req.params.id);
    if (!set) return res.status(404).json({ error: 'Set not found' });
    
    set.segments.push(segmentId);
    set.transitionTimes.push(transitionTime || 0);
    await set.save();
    
    res.json({ message: 'Segment added to set', set });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to add segment to set' });
  }
});

app.delete('/api/sets/:id/segments/:segmentId', async (req: Request, res: Response) => {
  try {
    const set = await Set.findById(req.params.id);
    if (!set) return res.status(404).json({ error: 'Set not found' });
    
    const segmentIndex = set.segments.findIndex(seg => seg.toString() === req.params.segmentId);
    if (segmentIndex === -1) return res.status(404).json({ error: 'Segment not found in set' });
    
    set.segments.splice(segmentIndex, 1);
    set.transitionTimes.splice(segmentIndex, 1);
    await set.save();
    
    res.json({ message: 'Segment removed from set', set });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to remove segment from set' });
  }
});

// Update segment privacy
app.patch('/api/segment/:segmentId/privacy', async (req: Request, res: Response) => {
  try {
    const { segmentId } = req.params;
    const { isPublic } = req.body;
    
    const segment = await Segment.findByIdAndUpdate(
      segmentId,
      { isPublic },
      { new: true }
    );
    
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    
    res.json({ message: 'Segment privacy updated', segment });
  } catch (error: any) {
    console.error('Error updating segment privacy:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update segment privacy' });
  }
});

// Add endpoint to list all teams (for debugging)
app.get('/api/teams', async (req: Request, res: Response) => {
  try {
    const teams = await Team.find({}, 'name joinCode _id');
    res.json({ teams });
  } catch (error: any) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch teams' });
  }
});

// Add endpoint to update all existing 6-character codes to 7-character codes
app.patch('/api/teams/update-codes-to-7', async (req: Request, res: Response) => {
  try {
    // Find all teams with 6-character codes
    const teams = await Team.find({ joinCode: { $regex: /^.{6}$/ } });
    console.log(`Found ${teams.length} teams with 6-character codes`);
    
    const updatedTeams = [];
    
    for (const team of teams) {
      // Generate a new 7-character code
      let newJoinCode;
      let isUnique = false;
      while (!isUnique) {
        const teamNamePrefix = team.name.replace(/\s+/g, '').toLowerCase().substring(0, 4).padEnd(4, 'a');
        const randomDigits = Math.floor(100 + Math.random() * 900); // 3 digits (100-999)
        newJoinCode = `${teamNamePrefix}${randomDigits}`;
        const existing = await Team.findOne({ joinCode: newJoinCode, _id: { $ne: team._id } });
        if (!existing) isUnique = true;
      }
      
      // Update the team's join code
      const updatedTeam = await Team.findByIdAndUpdate(
        team._id,
        { joinCode: newJoinCode },
        { new: true }
      );
      
      updatedTeams.push({
        oldCode: team.joinCode,
        newCode: newJoinCode,
        teamName: team.name
      });
      
      console.log(`Updated ${team.name}: ${team.joinCode} -> ${newJoinCode}`);
    }
    
    res.json({ 
      message: `Updated ${updatedTeams.length} teams from 6 to 7 characters`,
      updatedTeams 
    });
  } catch (error: any) {
    console.error('Error updating team codes:', error);
    res.status(500).json({ error: error.message || 'Failed to update team codes' });
  }
});

app.post('/api/create-checkout-session', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.body;
    
    if (!teamId) {
      return res.status(400).json({ error: 'Team ID is required' });
    }

    // Verify team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: 'https://sway-frontend-3t6a.onrender.com/membership-plan?success=true',
      cancel_url: 'https://sway-frontend-3t6a.onrender.com/dashboard',
      metadata: {
        teamId: teamId,
      },
    });
    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create subscription (alternative to checkout session)
app.post('/api/subscriptions/create', async (req: Request, res: Response) => {
  try {
    const { teamId, paymentMethodId } = req.body;
    
    if (!teamId || !paymentMethodId) {
      return res.status(400).json({ error: 'Team ID and payment method ID are required' });
    }

    // Verify team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: team.owner.toString(), // Using team owner as customer identifier
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        payment_method: paymentMethodId,
        email: team.owner.toString(),
        metadata: {
          teamId: teamId,
        },
      });
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    // Set as default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: STRIPE_PRICE_ID }],
      metadata: {
        teamId: teamId,
      },
    });

    // Update team membership
    team.membershipType = 'pro';
    team.membershipExpiresAt = new Date((subscription as any).current_period_end * 1000);
    await team.save();

    res.json({ 
      subscription: subscription,
      message: 'Subscription created successfully'
    });
  } catch (err: any) {
    console.error('Error creating subscription:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cancel subscription
app.post('/api/subscriptions/cancel', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.body;
    
    if (!teamId) {
      return res.status(400).json({ error: 'Team ID is required' });
    }

    // Find team's subscription by listing all subscriptions and filtering
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
    });

    const teamSubscription = subscriptions.data.find(sub => 
      sub.metadata && sub.metadata.teamId === teamId
    );

    if (!teamSubscription) {
      return res.status(404).json({ error: 'No active subscription found for this team' });
    }

    // Cancel subscription at period end
    const canceledSubscription = await stripe.subscriptions.update(teamSubscription.id, {
      cancel_at_period_end: true,
    });

    res.json({ 
      subscription: canceledSubscription,
      message: 'Subscription will be canceled at the end of the current period'
    });
  } catch (err: any) {
    console.error('Error canceling subscription:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook handler
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook handlers
async function handleSubscriptionCreated(subscription: any) {
  const teamId = subscription.metadata?.teamId;
  if (teamId) {
    const team = await Team.findById(teamId);
    if (team) {
      team.membershipType = 'pro';
      team.membershipExpiresAt = new Date((subscription as any).current_period_end * 1000);
      await team.save();
      console.log(`Team ${teamId} subscription created, membership updated to pro`);
    }
  }
}

async function handleSubscriptionUpdated(subscription: any) {
  const teamId = subscription.metadata?.teamId;
  if (teamId) {
    const team = await Team.findById(teamId);
    if (team) {
      if (subscription.status === 'active') {
        team.membershipType = 'pro';
        team.membershipExpiresAt = new Date((subscription as any).current_period_end * 1000);
      } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
        team.membershipType = 'free';
        team.membershipExpiresAt = undefined;
      }
      await team.save();
      console.log(`Team ${teamId} subscription updated, membership status: ${subscription.status}`);
    }
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  const teamId = subscription.metadata?.teamId;
  if (teamId) {
    const team = await Team.findById(teamId);
    if (team) {
      team.membershipType = 'free';
      team.membershipExpiresAt = undefined;
      await team.save();
      console.log(`Team ${teamId} subscription deleted, membership reverted to free`);
    }
  }
}

async function handlePaymentSucceeded(invoice: any) {
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const teamId = subscription.metadata?.teamId;
  
  if (teamId) {
    const team = await Team.findById(teamId);
    if (team) {
      team.membershipType = 'pro';
      team.membershipExpiresAt = new Date((subscription as any).current_period_end * 1000);
      await team.save();
      console.log(`Team ${teamId} payment succeeded, membership extended`);
    }
  }
}

async function handlePaymentFailed(invoice: any) {
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const teamId = subscription.metadata?.teamId;
  
  if (teamId) {
    console.log(`Team ${teamId} payment failed, subscription status: ${subscription.status}`);
    // You might want to send notification emails here
  }
}

// ===== MEMBERSHIP API ENDPOINTS =====

// Check and upgrade membership
app.post('/api/teams/:id/check-membership-upgrade', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await MembershipService.checkAndUpgradeMembership(id);
    res.json(result);
  } catch (error: any) {
    console.error('Error checking membership upgrade:', error);
    res.status(500).json({ error: error.message || 'Failed to check membership upgrade' });
  }
});

// Apply referral code
app.post('/api/teams/:id/apply-referral', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { referralCode } = req.body;
    
    if (!referralCode) {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    const result = await MembershipService.applyReferralCode(id, referralCode);
    res.json(result);
  } catch (error: any) {
    console.error('Error applying referral code:', error);
    res.status(500).json({ error: error.message || 'Failed to apply referral code' });
  }
});

// Get membership status
app.get('/api/teams/:id/membership-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const status = await MembershipService.getMembershipStatus(id);
    res.json(status);
  } catch (error: any) {
    console.error('Error getting membership status:', error);
    res.status(500).json({ error: error.message || 'Failed to get membership status' });
  }
});

// Get registered user count
app.get('/api/teams/:id/registered-user-count', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const count = await MembershipService.getRegisteredUserCount(id);
    res.json({ registeredUserCount: count });
  } catch (error: any) {
    console.error('Error getting registered user count:', error);
    res.status(500).json({ error: error.message || 'Failed to get registered user count' });
  }
});

// Check if membership is active
app.get('/api/teams/:id/membership-active', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isActive = await MembershipService.isMembershipActive(id);
    res.json({ isActive });
  } catch (error: any) {
    console.error('Error checking membership status:', error);
    res.status(500).json({ error: error.message || 'Failed to check membership status' });
  }
});

app.listen(port, () => {
    console.log(`Server is running at: http://localhost:${port}`);
});