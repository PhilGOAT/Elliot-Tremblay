import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Liste des matchs
router.get('/', async (req, res) => {
  try {
    const { status, game } = req.query;

    const where = {};
    if (status) where.status = status;
    if (game) where.game = game;

    const matches = await req.prisma.match.findMany({
      where,
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
        bets: { select: { id: true, prediction: true, amount: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Ajouter les stats de paris pour chaque match
    const matchesWithStats = matches.map(match => {
      const player1Bets = match.bets.filter(b => b.prediction === 'player1');
      const player2Bets = match.bets.filter(b => b.prediction === 'player2');

      return {
        ...match,
        betStats: {
          player1Total: player1Bets.reduce((sum, b) => sum + b.amount, 0),
          player2Total: player2Bets.reduce((sum, b) => sum + b.amount, 0),
          player1Count: player1Bets.length,
          player2Count: player2Bets.length
        },
        bets: undefined // Ne pas exposer les détails des paris
      };
    });

    res.json(matchesWithStats);
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détail d'un match
router.get('/:id', async (req, res) => {
  try {
    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        player1: { select: { id: true, username: true, wins: true, losses: true } },
        player2: { select: { id: true, username: true, wins: true, losses: true } },
        bets: {
          select: {
            id: true,
            prediction: true,
            amount: true,
            user: { select: { username: true } }
          }
        }
      }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    res.json(match);
  } catch (error) {
    console.error('Get match error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un match
router.post('/', authenticate, async (req, res) => {
  try {
    const { game, player1Id, player2Id, scheduledAt } = req.body;

    if (!game || !player1Id || !player2Id) {
      return res.status(400).json({ error: 'Jeu et joueurs requis' });
    }

    if (player1Id === player2Id) {
      return res.status(400).json({ error: 'Les joueurs doivent être différents' });
    }

    const match = await req.prisma.match.create({
      data: {
        game,
        player1Id,
        player2Id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
      },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } }
      }
    });

    res.status(201).json(match);
  } catch (error) {
    console.error('Create match error:', error);
    res.status(500).json({ error: 'Erreur lors de la création du match' });
  }
});

// Mettre à jour le score et terminer le match
router.patch('/:id/result', authenticate, async (req, res) => {
  try {
    const { player1Score, player2Score } = req.body;

    if (player1Score === undefined || player2Score === undefined) {
      return res.status(400).json({ error: 'Scores requis' });
    }

    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id },
      include: { bets: true }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    if (match.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Match déjà terminé' });
    }

    // Déterminer le gagnant
    let winnerId = null;
    let winningPrediction = null;

    if (player1Score > player2Score) {
      winnerId = match.player1Id;
      winningPrediction = 'player1';
    } else if (player2Score > player1Score) {
      winnerId = match.player2Id;
      winningPrediction = 'player2';
    }

    // Calculer le pool total et les gains
    const totalPool = match.bets.reduce((sum, bet) => sum + bet.amount, 0);
    const winningBets = match.bets.filter(b => b.prediction === winningPrediction);
    const winningPool = winningBets.reduce((sum, bet) => sum + bet.amount, 0);

    // Mise à jour transactionnelle
    await req.prisma.$transaction(async (tx) => {
      // Mettre à jour le match
      await tx.match.update({
        where: { id: req.params.id },
        data: {
          player1Score,
          player2Score,
          winnerId,
          status: 'COMPLETED'
        }
      });

      // Traiter les paris
      for (const bet of match.bets) {
        if (winnerId === null) {
          // Match nul - rembourser
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'REFUNDED', payout: bet.amount }
          });
          await tx.user.update({
            where: { id: bet.userId },
            data: { balance: { increment: bet.amount } }
          });
        } else if (bet.prediction === winningPrediction) {
          // Pari gagné
          const payout = winningPool > 0
            ? Math.floor((bet.amount / winningPool) * totalPool)
            : bet.amount;

          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'WON', payout }
          });
          await tx.user.update({
            where: { id: bet.userId },
            data: {
              balance: { increment: payout },
              wins: { increment: 1 }
            }
          });
        } else {
          // Pari perdu
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'LOST', payout: 0 }
          });
          await tx.user.update({
            where: { id: bet.userId },
            data: { losses: { increment: 1 } }
          });
        }
      }
    });

    const updatedMatch = await req.prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } }
      }
    });

    res.json(updatedMatch);
  } catch (error) {
    console.error('Update match result error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du résultat' });
  }
});

// Annuler un match
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id },
      include: { bets: true }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    if (match.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Match déjà terminé' });
    }

    // Rembourser tous les paris
    await req.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED' }
      });

      for (const bet of match.bets) {
        await tx.bet.update({
          where: { id: bet.id },
          data: { status: 'REFUNDED', payout: bet.amount }
        });
        await tx.user.update({
          where: { id: bet.userId },
          data: { balance: { increment: bet.amount } }
        });
      }
    });

    res.json({ message: 'Match annulé et paris remboursés' });
  } catch (error) {
    console.error('Cancel match error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation' });
  }
});

export default router;
