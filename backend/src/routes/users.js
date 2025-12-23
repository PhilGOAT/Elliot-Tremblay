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
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
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
