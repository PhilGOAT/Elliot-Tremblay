import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

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
