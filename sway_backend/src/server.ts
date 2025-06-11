const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv/config');
const bcrypt = require('bcrypt');
const { User } = require('./models/User');
const { Team } = require('./models/Team');
const { Segment } = require('./models/Segment');
const AWS = require('aws-sdk');

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
  .catch((error) => {
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

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name, team } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, name, team, captain: true });
    await user.save();
    res.status(201).json({ message: 'User created', user });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

app.post('/api/teams', async (req, res) => {
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
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: error.message || 'Failed to create team' });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const update = req.body;
    const user = await User.findByIdAndUpdate(userId, update, { new: true })
      .populate('team', 'name _id'); // Populate the team field
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User updated', user });
  } catch (error: unknown) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update user' });
  }
});

app.post('/api/bulk-users', async (req, res) => {
  try {
    const { team, users } = req.body;
    // Create users and assign them to the team
    const createdUsers = await User.insertMany(users.map((u, idx) => ({
      ...u,
      team,
      email: u.email || `user${Date.now()}_${idx}@placeholder.com`
    })));
    const userIds = createdUsers.map(u => u._id);

    // Add these users to the team's members array
    await Team.findByIdAndUpdate(team, { $addToSet: { members: { $each: userIds } } });

    res.json({ message: 'Users created and added to team', users: createdUsers });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create users' });
  }
});

app.get('/api/team-by-join-code/:joinCode', async (req, res) => {
  try {
    const { joinCode } = req.params;
    const team = await Team.findOne({ joinCode }).populate('members');
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json({ team, members: team.members });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch team' });
  }
});

app.post('/api/segments', async (req, res) => {
  try {
    const { teamId, name, depth, width, divisions, animationDurations } = req.body;
    // Find the team to verify it exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

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
      musicUrl: ''
    });

    await segment.save();
    res.status(201).json({ message: 'Segment created', segment });
  } catch (error: unknown) {
    console.error('Error creating segment:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create segment' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email }).populate('team');
    if (!user) return res.status(400).json({ error: 'User not found' });

    // If you use bcrypt for password hashing
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Don't send password back
    const { password: _, ...userData } = user.toObject();
    res.json({ user: userData });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/segments/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const segments = await Segment.find({ team: teamId });
    res.json({ segments });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch segments' });
  }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('members');
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({ team });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch team' });
  }
});

app.get('/api/segment/:id', async (req, res) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });
    res.json({ segment });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch segment' });
  }
});

app.patch('/api/segment/:id', async (req, res) => {
  try {
    const segment = await Segment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!segment) return res.status(404).json({ error: 'Segment not found' });
    res.json({ message: 'Segment updated', segment });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update segment' });
  }
});

app.delete('/api/segment/:id', async (req, res) => {
  try {
    const segment = await Segment.findByIdAndDelete(req.params.id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });
    res.json({ message: 'Segment deleted', segment });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete segment' });
  }
});

app.post('/api/segment/:id/music-presigned-url', async (req, res) => {
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
app.get('/api/segment/:id/music-url', async (req, res) => {
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

app.listen(port, () => {
    console.log(`Server is running at: http://localhost:${port}`);
});