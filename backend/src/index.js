import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import matchRoutes from './routes/matches.js';
import betRoutes from './routes/bets.js';
import notificationRoutes from './routes/notifications.js';
import tournamentRoutes from './routes/tournaments.js';
import xboxRoutes from './routes/xbox.js';
import liveStreamsRoutes from './routes/liveStreams.js';
import friendsRoutes from './routes/friends.js';
import verifyRoutes from './routes/verify.js';
import streamManager from './services/streamManager.js';

dotenv.config();

const app = express();
const server = createServer(app);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Initialiser le WebSocket pour les streams en direct
streamManager.initialize(server, prisma);

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));
app.use(express.json());

// Root health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Xbox Betting API' });
});

// Make prisma available in routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/xbox', xboxRoutes);
app.use('/api/live-streams', liveStreamsRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/verify', verifyRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Xbox Betting API running on port ${PORT}`);
  console.log(`📡 WebSocket ready for live streams`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
