const express = require('express');
const cors = require('cors');
const { WorkOS } = require('@workos-inc/node');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const workos = new WorkOS(process.env.WORKOS_API_KEY);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// WorkOS authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the session with WorkOS
    const session = await workos.userManagement.authenticateWithSessionCookie({
      sessionCookie: token,
      cookiePassword: process.env.WORKOS_COOKIE_PASSWORD || 'default-cookie-password'
    });

    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    req.user = session.user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Alternative middleware for CLI token verification
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    
    // For CLI, we can verify the access token directly
    const user = await workos.userManagement.getUser({
      userId: token // This would be the user ID from CLI auth
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    // Try session-based auth as fallback
    try {
      const session = await workos.userManagement.authenticateWithSessionCookie({
        sessionCookie: token,
        cookiePassword: process.env.WORKOS_COOKIE_PASSWORD || 'default-cookie-password'
      });

      if (session) {
        req.user = session.user;
        next();
      } else {
        res.status(401).json({ error: 'Authentication failed' });
      }
    } catch (fallbackError) {
      console.error('Authentication error:', error, fallbackError);
      res.status(401).json({ error: 'Authentication failed' });
    }
  }
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Get current user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { workosId: req.user.id }
    });

    // Create user if doesn't exist
    if (!user) {
      user = await prisma.user.create({
        data: {
          workosId: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
        }
      });
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      favoriteColor: user.favoriteColor
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's favorite color
app.get('/api/user/favorite-color', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { workosId: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ favoriteColor: user.favoriteColor });
  } catch (error) {
    console.error('Error fetching favorite color:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user's favorite color
app.put('/api/user/favorite-color', authenticateToken, async (req, res) => {
  try {
    const { favoriteColor } = req.body;

    if (!favoriteColor) {
      return res.status(400).json({ error: 'favoriteColor is required' });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { workosId: req.user.id }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          workosId: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          favoriteColor
        }
      });
    } else {
      user = await prisma.user.update({
        where: { workosId: req.user.id },
        data: { favoriteColor }
      });
    }

    res.json({ 
      message: 'Favorite color updated successfully', 
      favoriteColor: user.favoriteColor 
    });
  } catch (error) {
    console.error('Error updating favorite color:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WorkOS callback endpoint (for web auth)
app.post('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange code for session
    const { user, accessToken, refreshToken } = await workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID,
    });

    // Create or update user in database
    let dbUser = await prisma.user.findUnique({
      where: { workosId: user.id }
    });

    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          workosId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      });
    }

    res.json({ 
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        favoriteColor: dbUser.favoriteColor
      },
      accessToken 
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});