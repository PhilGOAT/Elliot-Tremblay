import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Middleware pour vérifier si l'utilisateur est admin
const requireAdmin = async (req, res, next) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId },
      select: { isAdmin: true }
    });

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Accès refusé - Admin requis' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /admin/streams - Voir tous les utilisateurs qui streament actuellement
router.get('/streams', authenticate, requireAdmin, async (req, res) => {
  try {
    // Récupérer tous les utilisateurs avec un compte Twitch
    const usersWithTwitch = await req.prisma.user.findMany({
      where: {
        twitchUsername: { not: null }
      },
      select: {
        id: true,
        username: true,
        twitchUsername: true,
        xboxGamertag: true,
        xboxAvatar: true,
        xboxVerified: true
      }
    });

    // Vérifier lesquels sont en ligne
    const streams = [];

    for (const user of usersWithTwitch) {
      const isLive = await checkTwitchLive(user.twitchUsername);
      if (isLive) {
        streams.push({
          ...user,
          isLive: true,
          twitchUrl: `https://twitch.tv/${user.twitchUsername}`
        });
      }
    }

    res.json({
      liveCount: streams.length,
      totalWithTwitch: usersWithTwitch.length,
      streams
    });
  } catch (error) {
    console.error('Get streams error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /admin/users - Liste tous les utilisateurs (admin)
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        balance: true,
        wins: true,
        losses: true,
        xboxGamertag: true,
        twitchUsername: true,
        xboxVerified: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /admin/users/:id - Modifier un utilisateur (admin)
router.patch('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { isAdmin, balance } = req.body;

    const updateData = {};
    if (isAdmin !== undefined) updateData.isAdmin = isAdmin;
    if (balance !== undefined) updateData.balance = balance;

    const user = await req.prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        isAdmin: true,
        balance: true
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Fonction pour vérifier si un stream Twitch est en ligne
async function checkTwitchLive(username) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return false;
  }

  try {
    // Obtenir un token
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      })
    });

    if (!tokenResponse.ok) return false;
    const tokenData = await tokenResponse.json();

    // Vérifier si le stream est en ligne
    const streamResponse = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(username)}`,
      {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      }
    );

    if (!streamResponse.ok) return false;
    const streamData = await streamResponse.json();

    return streamData.data && streamData.data.length > 0;
  } catch (error) {
    console.error('Twitch check error:', error);
    return false;
  }
}

export default router;
