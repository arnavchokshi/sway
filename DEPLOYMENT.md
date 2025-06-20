# Deploying Sway to Render

This guide will help you deploy your Sway application (Angular frontend + Node.js backend) to Render.

## Prerequisites

1. A Render account (free tier available)
2. MongoDB Atlas database
3. AWS S3 bucket for file storage
4. Your application code pushed to a Git repository (GitHub, GitLab, etc.)

## Step 1: Prepare Your Environment Variables

### Backend Environment Variables
You'll need to set these in Render for your backend service:

- `ATLAS_URI`: Your MongoDB Atlas connection string
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `AWS_REGION`: Your AWS region (e.g., us-east-1)
- `NODE_ENV`: production
- `PORT`: 10000 (Render will override this)

### Frontend Environment Variables
- `NODE_ENV`: production

## Step 2: Deploy Backend Service

1. **Go to Render Dashboard**
   - Visit [render.com](https://render.com)
   - Sign in to your account

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Select the repository containing your Sway project

3. **Configure Backend Service**
   - **Name**: `sway-backend`
   - **Root Directory**: `sway_backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free

4. **Add Environment Variables**
   - Click on "Environment" tab
   - Add all the backend environment variables listed above
   - Make sure to mark sensitive variables as "Secret"

5. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy your backend

## Step 3: Deploy Frontend Service

1. **Create New Static Site**
   - Click "New +" → "Static Site"
   - Connect the same Git repository

2. **Configure Frontend Service**
   - **Name**: `sway-frontend`
   - **Root Directory**: `sway_frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Plan**: Free

3. **Add Environment Variables**
   - Add `NODE_ENV: production`

4. **Deploy**
   - Click "Create Static Site"
   - Render will build and deploy your frontend

## Step 4: Update Frontend API Configuration

After deployment, you'll need to update your frontend to point to the deployed backend URL.

1. **Find your backend URL**
   - Go to your backend service in Render
   - Copy the URL (e.g., `https://sway-backend.onrender.com`)

2. **Update API calls in frontend**
   - Update all API calls in your Angular application to use the new backend URL
   - You may need to update environment files or service configurations

## Step 5: Configure CORS (if needed)

If you encounter CORS issues, you may need to update your backend CORS configuration to allow requests from your frontend domain.

In `sway_backend/src/server.ts`, update the CORS configuration:

```typescript
app.use(cors({
  origin: ['https://your-frontend-url.onrender.com', 'http://localhost:4200'],
  credentials: true
}));
```

## Step 6: Test Your Deployment

1. **Test Backend**
   - Visit your backend URL + `/` (e.g., `https://sway-backend.onrender.com/`)
   - You should see "Hello from the backend!"

2. **Test Frontend**
   - Visit your frontend URL
   - Test all functionality to ensure it works with the deployed backend

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check the build logs in Render
   - Ensure all dependencies are in package.json
   - Verify TypeScript compilation works locally

2. **Environment Variables**
   - Double-check all environment variables are set correctly
   - Ensure sensitive variables are marked as "Secret"

3. **Database Connection**
   - Verify your MongoDB Atlas connection string
   - Ensure your IP is whitelisted in MongoDB Atlas (or use 0.0.0.0/0 for Render)

4. **AWS S3 Issues**
   - Verify your AWS credentials are correct
   - Ensure your S3 bucket permissions allow the operations your app needs

### Useful Commands

To test locally before deploying:

```bash
# Backend
cd sway_backend
npm install
npm run build
npm start

# Frontend
cd sway_frontend
npm install
npm run build
```

## Cost Considerations

- **Free Tier**: Both services can run on Render's free tier
- **Limitations**: Free tier has cold starts and limited bandwidth
- **Upgrade**: Consider upgrading to paid plans for production use

## Security Notes

- Never commit sensitive environment variables to your repository
- Use Render's environment variable system for all secrets
- Regularly rotate your AWS credentials
- Consider using Render's built-in SSL certificates

## Support

If you encounter issues:
1. Check Render's documentation
2. Review build and runtime logs in Render dashboard
3. Test locally to isolate issues
4. Contact Render support if needed 