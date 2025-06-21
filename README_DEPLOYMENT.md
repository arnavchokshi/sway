# Sway Application - Render Deployment Guide

## Overview

This guide will help you deploy your Sway application (Angular frontend + Node.js backend) to Render. The application has been configured for deployment with the following changes:

### Changes Made for Deployment

1. **Backend Configuration** (`sway_backend/`)
   - ✅ Added `render.yaml` configuration file
   - ✅ Updated `package.json` with build and start scripts
   - ✅ Configured TypeScript compilation for production

2. **Frontend Configuration** (`sway_frontend/`)
   - ✅ Added `render.yaml` configuration file
   - ✅ Created `environment.prod.ts` for production settings
   - ✅ Updated all services to use environment configuration
   - ✅ Removed hardcoded localhost URLs

3. **Environment Configuration**
   - ✅ Updated all API calls to use environment variables
   - ✅ Created production environment file
   - ✅ Added proper TypeScript types

## Quick Start

### 1. Test Your Builds Locally

Run the deployment script to test your builds:

```bash
./deploy.sh
```

This will:
- Install dependencies for both frontend and backend
- Build the TypeScript backend
- Build the Angular frontend
- Verify both builds are successful

### 2. Prepare Your Environment Variables

You'll need these environment variables for your backend service in Render:

| Variable | Description | Example |
|----------|-------------|---------|
| `ATLAS_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/sway` |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for S3 | `...` |
| `AWS_REGION` | AWS region | `us-west-2` |
| `AWS_S3_BUCKET` | S3 bucket name | `sway-music-upload` |
| `NODE_ENV` | Environment | `production` |

### 3. Deploy to Render

#### Backend Service
1. Go to [render.com](https://render.com) and sign in
2. Click "New +" → "Web Service"
3. Connect your Git repository
4. Configure the service:
   - **Name**: `sway-backend`
   - **Root Directory**: `sway_backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

5. Add environment variables in the "Environment" tab
6. Click "Create Web Service"

#### Frontend Service
1. Click "New +" → "Static Site"
2. Connect the same Git repository
3. Configure the service:
   - **Name**: `sway-frontend`
   - **Root Directory**: `sway_frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Plan**: Free

4. Click "Create Static Site"

### 4. Update Frontend Configuration

After your backend is deployed:

1. Copy your backend URL (e.g., `https://sway-backend.onrender.com`)
2. Update `sway_frontend/src/environments/environment.prod.ts`:
   ```typescript
   export const environment = {
     production: true,
     apiUrl: 'https://your-backend-url.onrender.com/api', // Update this
     s3Bucket: 'sway-music-upload',
     s3Region: 'us-west-2'
   };
   ```
3. Commit and push the changes
4. Render will automatically redeploy your frontend

## File Structure

```
sway/
├── sway_backend/
│   ├── render.yaml          # Backend deployment config
│   ├── package.json         # Updated with build scripts
│   ├── tsconfig.json        # TypeScript config
│   └── src/
│       └── server.ts        # Main server file
├── sway_frontend/
│   ├── render.yaml          # Frontend deployment config
│   ├── package.json         # Angular config
│   └── src/
│       └── environments/
│           ├── environment.ts        # Development config
│           └── environment.prod.ts   # Production config
├── deploy.sh               # Build test script
├── DEPLOYMENT.md           # Detailed deployment guide
└── README_DEPLOYMENT.md    # This file
```

## Services Updated

The following services and components have been updated to use environment configuration:

### Backend Services
- ✅ Express server with TypeScript compilation
- ✅ MongoDB Atlas connection
- ✅ AWS S3 integration
- ✅ CORS configuration

### Frontend Services
- ✅ `AuthService` - Login functionality
- ✅ `TeamService` - Team management
- ✅ `SegmentService` - Segment operations
- ✅ `VideoService` - Video uploads
- ✅ All components with API calls

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Render build logs
   - Ensure all dependencies are in package.json
   - Verify TypeScript compilation works locally

2. **Environment Variables**
   - Double-check all variables are set correctly
   - Mark sensitive variables as "Secret" in Render
   - Ensure MongoDB Atlas allows connections from Render

3. **CORS Issues**
   - Update backend CORS configuration to allow your frontend domain
   - Check that frontend is using the correct backend URL

4. **Database Connection**
   - Verify MongoDB Atlas connection string
   - Ensure IP whitelist includes Render's IPs (or use 0.0.0.0/0)

### Useful Commands

```bash
# Test backend locally
cd sway_backend
npm install
npm run build
npm start

# Test frontend locally
cd sway_frontend
npm install
npm run build
npm start
```

## Security Notes

- ✅ Never commit sensitive environment variables
- ✅ Use Render's environment variable system for secrets
- ✅ Regularly rotate AWS credentials
- ✅ Consider using Render's SSL certificates

## Support

If you encounter issues:
1. Check the detailed `DEPLOYMENT.md` guide
2. Review Render's documentation
3. Check build and runtime logs in Render dashboard
4. Test locally to isolate issues

## Next Steps

After successful deployment:
1. Test all functionality on the deployed application
2. Set up custom domains if needed
3. Configure monitoring and logging
4. Set up CI/CD for automatic deployments
5. Consider upgrading to paid plans for production use

---

**Happy Deploying! 🚀** 