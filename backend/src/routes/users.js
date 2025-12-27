import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { verifyTwitchUsername } from '../services/verification.js';
import xboxService from '../services/xboxLive.js';

const router = Router();

// Profil de l'utilisateur connecté
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        balance: true,
        wins: true,
        losses: true,
        lastDailyBonus: true,
        xboxGamertag: true,
        psnId: true,
        eaId: true,
        nintendoId: true,
        steamName: true,
        xboxVerified: true,
        psnVerified: true,
        eaVerified: true,
        nintendoVerified: true,
        steamVerified: true,
        // Xbox Live API data
        xboxXuid: true,
        xboxGamerscore: true,
        xboxAvatar: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier si le bonus quotidien est disponible
    const now = new Date();
    const lastBonus = user.lastDailyBonus ? new Date(user.lastDailyBonus) : null;
    const canClaimBonus = !lastBonus ||
      (now.getTime() - lastBonus.getTime()) >= 24 * 60 * 60 * 1000;

    res.json({
      ...user,
      canClaimDailyBonus: canClaimBonus
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour le profil
router.patch('/me', authenticate, async (req, res) => {
  try {
    const { username, xboxGamertag, psnId, eaId, nintendoId, steamName } = req.body;

    // Préparer les données à mettre à jour
    const updateData = {};

    // Permettre le changement de pseudo
    if (username !== undefined) {
      const trimmedUsername = username.trim();
      if (trimmedUsername.length < 3) {
        return res.status(400).json({ error: 'Le pseudo doit avoir au moins 3 caractères' });
      }
      if (trimmedUsername.length > 20) {
        return res.status(400).json({ error: 'Le pseudo ne peut pas dépasser 20 caractères' });
      }
      updateData.username = trimmedUsername;
    }

    if (xboxGamertag !== undefined) updateData.xboxGamertag = xboxGamertag;
    if (psnId !== undefined) updateData.psnId = psnId;
    if (eaId !== undefined) updateData.eaId = eaId;
    if (nintendoId !== undefined) updateData.nintendoId = nintendoId;
    if (steamName !== undefined) updateData.steamName = steamName;

    const updatedUser = await req.prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        xboxGamertag: true,
        psnId: true,
        eaId: true,
        nintendoId: true,
        steamName: true
      }
    });

    res.json({
      message: 'Profil mis à jour!',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Réclamer le bonus quotidien
router.post('/daily-bonus', authenticate, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier si 24h sont passées depuis le dernier bonus
    const now = new Date();
    const lastBonus = user.lastDailyBonus ? new Date(user.lastDailyBonus) : null;

    if (lastBonus && (now.getTime() - lastBonus.getTime()) < 24 * 60 * 60 * 1000) {
      const timeLeft = 24 * 60 * 60 * 1000 - (now.getTime() - lastBonus.getTime());
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

      return res.status(400).json({
        error: `Bonus déjà réclamé! Reviens dans ${hoursLeft}h ${minutesLeft}min`
      });
    }

    // Donner le bonus
    const DAILY_BONUS = 100;
    const updatedUser = await req.prisma.user.update({
      where: { id: req.userId },
      data: {
        balance: { increment: DAILY_BONUS },
        lastDailyBonus: now
      },
      select: {
        id: true,
        username: true,
        balance: true,
        lastDailyBonus: true
      }
    });

    res.json({
      message: `+${DAILY_BONUS} coins! Reviens demain pour un autre bonus!`,
      bonus: DAILY_BONUS,
      newBalance: updatedUser.balance,
      canClaimDailyBonus: false
    });
  } catch (error) {
    console.error('Daily bonus error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier si l'utilisateur connecté est en train de streamer
router.get('/me/stream-status', authenticate, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        twitchUsername: true
      }
    });

    if (!user || !user.twitchUsername) {
      return res.json({
        isLive: false,
        twitchUsername: null
      });
    }

    const isLive = await checkTwitchLive(user.twitchUsername);

    res.json({
      isLive,
      twitchUsername: user.twitchUsername
    });
  } catch (error) {
    console.error('Stream status error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Classement
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        balance: true,
        wins: true,
        losses: true
      },
      orderBy: [
        { balance: 'desc' },
        { wins: 'desc' }
      ],
      take: 50
    });

    // Calculer le ratio de victoires
    const leaderboard = users.map((user, index) => ({
      ...user,
      rank: index + 1,
      winRate: user.wins + user.losses > 0
        ? Math.round((user.wins / (user.wins + user.losses)) * 100)
        : 0
    }));

    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier si un utilisateur est en ligne (Xbox OU stream Twitch actif)
router.get('/:id/online', async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        twitchUsername: true,
        xboxXuid: true,
        xboxVerified: true,
        xboxAccessToken: true,
        xboxRefreshToken: true,
        xboxTokenExpiry: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    let isOnlineXbox = false;
    let xboxPresence = null;
    let currentGame = null;

    // 1. Vérifier la présence Xbox si le compte est lié
    if (user.xboxVerified && user.xboxXuid && user.xboxAccessToken) {
      try {
        let accessToken = user.xboxAccessToken;

        // Vérifier si le token est expiré et le rafraîchir si possible
        if (user.xboxTokenExpiry && new Date() > new Date(user.xboxTokenExpiry)) {
          if (user.xboxRefreshToken) {
            try {
              const refreshed = await refreshXboxToken(user.xboxRefreshToken);
              if (refreshed) {
                accessToken = refreshed.access_token;
                // Mettre à jour les tokens dans la base de données
                await req.prisma.user.update({
                  where: { id: req.params.id },
                  data: {
                    xboxAccessToken: refreshed.access_token,
                    xboxRefreshToken: refreshed.refresh_token || user.xboxRefreshToken,
                    xboxTokenExpiry: new Date(Date.now() + (refreshed.expires_in * 1000))
                  }
                });
              }
            } catch (refreshError) {
              console.error('Erreur refresh token Xbox:', refreshError);
            }
          }
        }

        // Authentifier avec Xbox Live
        const xboxData = await xboxService.authenticateWithXboxLive(accessToken);

        if (xboxData) {
          const presence = await xboxService.getPresence(
            user.xboxXuid,
            xboxData.xblToken,
            xboxData.userHash
          );

          if (presence) {
            isOnlineXbox = presence.isOnline;
            xboxPresence = presence.state;

            // Trouver le jeu en cours
            const activeDevice = presence.devices?.find(d =>
              d.type === 'XboxOne' || d.type === 'XboxSeriesX' || d.type === 'XboxSeriesS' || d.type === 'Xbox'
            );
            if (activeDevice) {
              const activeGame = activeDevice.titles?.find(t => t.placement === 'Full' && t.state === 'Active');
              if (activeGame) {
                currentGame = activeGame.name;
              }
            }
          }
        }
      } catch (xboxError) {
        console.error('Erreur check Xbox presence:', xboxError);
      }
    }

    // 2. Vérifier le stream Twitch
    let isStreamingTwitch = false;
    if (user.twitchUsername) {
      isStreamingTwitch = await checkTwitchLive(user.twitchUsername);
    }

    // L'utilisateur est "en ligne" s'il est connecté Xbox OU s'il stream sur Twitch
    const isOnline = isOnlineXbox || isStreamingTwitch;

    res.json({
      isOnline,
      isOnlineXbox,
      isStreamingTwitch,
      xboxPresence,
      currentGame,
      twitchUsername: user.twitchUsername,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Check online error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Fonction pour rafraîchir le token Xbox/Microsoft
async function refreshXboxToken(refreshToken) {
  const clientId = process.env.XBOX_CLIENT_ID;
  const clientSecret = process.env.XBOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      console.error('Refresh token failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Refresh token error:', error);
    return null;
  }
}

// Fonction pour vérifier si un stream Twitch est en ligne
async function checkTwitchLive(username) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Sans API Twitch, on ne peut pas savoir
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

    // Si data contient des éléments, le stream est en ligne
    return streamData.data && streamData.data.length > 0;
  } catch (error) {
    console.error('Erreur check Twitch live:', error);
    return false;
  }
}

// Profil public d'un utilisateur
router.get('/:id', async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        balance: true,
        wins: true,
        losses: true,
        xboxGamertag: true,
        twitchUsername: true,
        xboxAvatar: true,
        xboxVerified: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des utilisateurs (pour créer des matchs)
router.get('/', authenticate, async (req, res) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true,
        username: true
      },
      orderBy: { username: 'asc' }
    });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
