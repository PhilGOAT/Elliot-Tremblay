import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { verifyTwitchUsername } from '../services/verification.js';

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
    const { xboxGamertag, psnId, eaId, nintendoId, steamName } = req.body;

    const updatedUser = await req.prisma.user.update({
      where: { id: req.userId },
      data: {
        xboxGamertag: xboxGamertag !== undefined ? xboxGamertag : undefined,
        psnId: psnId !== undefined ? psnId : undefined,
        eaId: eaId !== undefined ? eaId : undefined,
        nintendoId: nintendoId !== undefined ? nintendoId : undefined,
        steamName: steamName !== undefined ? steamName : undefined
      },
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

// Vérifier si un utilisateur est en ligne (joue à la Xbox = stream Twitch actif)
router.get('/:id/online', async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.params.id },
      select: { twitchUsername: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    if (!user.twitchUsername) {
      return res.json({ isOnline: false, reason: 'no_twitch' });
    }

    // Vérifier si le stream Twitch est en ligne
    const twitchStatus = await verifyTwitchUsername(user.twitchUsername);

    // Si on a pu vérifier et que le compte existe, on check s'il stream
    if (twitchStatus.valid && twitchStatus.exists) {
      // Pour vraiment savoir si quelqu'un stream, on doit utiliser l'API Twitch streams
      const isLive = await checkTwitchLive(user.twitchUsername);
      return res.json({
        isOnline: isLive,
        twitchUsername: user.twitchUsername,
        checkedAt: new Date().toISOString()
      });
    }

    res.json({ isOnline: false, reason: 'twitch_not_verified' });
  } catch (error) {
    console.error('Check online error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

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
