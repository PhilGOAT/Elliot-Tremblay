import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Placer un pari
router.post('/', authenticate, async (req, res) => {
  try {
    const { matchId, amount, prediction } = req.body;

    if (!matchId || !amount || !prediction) {
      return res.status(400).json({ error: 'Match, montant et prédiction requis' });
    }

    if (amount < 10) {
      return res.status(400).json({ error: 'Mise minimum: 10 coins' });
    }

    if (!['player1', 'player2'].includes(prediction)) {
      return res.status(400).json({ error: 'Prédiction invalide' });
    }

    // Vérifier le match
    const match = await req.prisma.match.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    if (match.status !== 'PENDING' && match.status !== 'LIVE') {
      return res.status(400).json({ error: 'Paris fermés pour ce match' });
    }

    // Vérifier que l'utilisateur n'est pas un des joueurs
    if (match.player1Id === req.userId || match.player2Id === req.userId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas parier sur votre propre match' });
    }

    // Vérifier le solde
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (user.balance < amount) {
      return res.status(400).json({ error: 'Solde insuffisant' });
    }

    // Vérifier si un pari existe déjà
    const existingBet = await req.prisma.bet.findUnique({
      where: {
        userId_matchId: {
          userId: req.userId,
          matchId
        }
      }
    });

    if (existingBet) {
      return res.status(400).json({ error: 'Vous avez déjà parié sur ce match' });
    }

    // Créer le pari et débiter le solde
    const bet = await req.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.userId },
        data: { balance: { decrement: amount } }
      });

      return tx.bet.create({
        data: {
          userId: req.userId,
          matchId,
          amount,
          prediction
        },
        include: {
          match: {
            include: {
              player1: { select: { username: true } },
              player2: { select: { username: true } }
            }
          }
        }
      });
    });

    res.status(201).json(bet);
  } catch (error) {
    console.error('Create bet error:', error);
    res.status(500).json({ error: 'Erreur lors du placement du pari' });
  }
});

// Mes paris
router.get('/my', authenticate, async (req, res) => {
  try {
    const bets = await req.prisma.bet.findMany({
      where: { userId: req.userId },
      include: {
        match: {
          include: {
            player1: { select: { username: true } },
            player2: { select: { username: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(bets);
  } catch (error) {
    console.error('Get my bets error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Annuler un pari (seulement si le match n'a pas commencé)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const bet = await req.prisma.bet.findUnique({
      where: { id: req.params.id },
      include: { match: true }
    });

    if (!bet) {
      return res.status(404).json({ error: 'Pari non trouvé' });
    }

    if (bet.userId !== req.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    if (bet.match.status !== 'PENDING') {
      return res.status(400).json({ error: 'Impossible d\'annuler un pari sur un match en cours ou terminé' });
    }

    // Rembourser et supprimer le pari
    await req.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.userId },
        data: { balance: { increment: bet.amount } }
      });

      await tx.bet.delete({
        where: { id: req.params.id }
      });
    });

    res.json({ message: 'Pari annulé et remboursé' });
  } catch (error) {
    console.error('Cancel bet error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation' });
  }
});

export default router;
