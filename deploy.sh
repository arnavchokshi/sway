#!/bin/bash

echo "🚀 Sway Deployment Script"
echo "=========================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the root directory of the Sway project"
    exit 1
fi

echo "📦 Building Backend..."
cd sway_backend

# Install dependencies
echo "Installing backend dependencies..."
npm install

# Build the TypeScript
echo "Building TypeScript..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Backend build failed! Check the TypeScript compilation errors above."
    exit 1
fi

echo "✅ Backend build successful!"

echo ""
echo "📦 Building Frontend..."
cd ../sway_frontend

# Install dependencies
echo "Installing frontend dependencies..."
npm install

# Build the Angular app
echo "Building Angular app..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Frontend build failed! Check the build errors above."
    exit 1
fi

echo "✅ Frontend build successful!"

echo ""
echo "🎉 Both builds completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "1. Push your code to a Git repository (GitHub, GitLab, etc.)"
echo "2. Go to render.com and create a new account if you don't have one"
echo "3. Create a new Web Service for the backend:"
echo "   - Root Directory: sway_backend"
echo "   - Build Command: npm install && npm run build"
echo "   - Start Command: npm start"
echo "4. Create a new Static Site for the frontend:"
echo "   - Root Directory: sway_frontend"
echo "   - Build Command: npm install && npm run build"
echo "   - Publish Directory: dist"
echo "5. Set up environment variables in Render for the backend:"
echo "   - ATLAS_URI (your MongoDB connection string)"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo "   - AWS_REGION"
echo "   - AWS_S3_BUCKET"
echo "6. Update the frontend environment.prod.ts with your backend URL"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions" 