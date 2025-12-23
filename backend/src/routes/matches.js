import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { createNotification } from './notifications.js';

const router = Router();

// Seuils par sport pour les paris "match serré" et "haut score"
const GAME_THRESHOLDS = {
  MADDEN: { closeMatch: 7, highScore: 50 },   // Football américain
  NHL: { closeMatch: 2, highScore: 8 },       // Hockey
  FIFA: { closeMatch: 1, highScore: 5 },      // Soccer
  NBA2K: { closeMatch: 10, highScore: 200 },  // Basketball
  MLB: { closeMatch: 2, highScore: 12 },      // Baseball
  UFC: { closeMatch: 0, highScore: 3 },       // UFC (rounds/finish)
  OTHER: { closeMatch: 3, highScore: 20 }     // Défaut
};

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
    const {
      game, player1Name, player2Name, player1Type, player2Type,
      player1Difficulty, player2Difficulty, player1HumanName, player2HumanName,
      scheduledAt
    } = req.body;

    if (!game || !player1Name || !player2Name) {
      return res.status(400).json({ error: 'Jeu et noms des équipes/joueurs requis' });
    }

    const match = await req.prisma.match.create({
      data: {
        game,
        player1Name,
        player2Name,
        player1Type: player1Type || 'HUMAN',
        player2Type: player2Type || 'HUMAN',
        player1Difficulty: player1Type === 'CPU' ? (player1Difficulty || 'PRO') : null,
        player2Difficulty: player2Type === 'CPU' ? (player2Difficulty || 'PRO') : null,
        player1HumanName: player1Type === 'HUMAN' ? player1HumanName : null,
        player2HumanName: player2Type === 'HUMAN' ? player2HumanName : null,
        createdBy: req.userId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
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

    // Vérifier que c'est le créateur du match
    if (match.createdBy !== req.userId) {
      return res.status(403).json({ error: 'Seul le créateur du match peut entrer le résultat' });
    }

    if (match.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Match déjà terminé' });
    }

    // Déterminer le gagnant
    let winningPrediction = null;

    if (player1Score > player2Score) {
      winningPrediction = 'player1';
    } else if (player2Score > player1Score) {
      winningPrediction = 'player2';
    }

    // Calculer les stats du match selon le sport
    const thresholds = GAME_THRESHOLDS[match.game] || GAME_THRESHOLDS.OTHER;
    const scoreDiff = Math.abs(player1Score - player2Score);
    const totalScore = player1Score + player2Score;
    const isCloseMatch = scoreDiff <= thresholds.closeMatch;
    const isHighScore = totalScore >= thresholds.highScore;

    // Mise à jour transactionnelle
    await req.prisma.$transaction(async (tx) => {
      // Mettre à jour le match
      await tx.match.update({
        where: { id: req.params.id },
        data: {
          player1Score,
          player2Score,
          winnerId: winningPrediction,
          status: 'COMPLETED'
        }
      });

      // Traiter les paris
      for (const bet of match.bets) {
        const betType = bet.betType || 'WINNER';
        let betWon = false;
        let betRefunded = false;

        // Déterminer si le pari est gagné selon le type
        if (betType === 'WINNER') {
          if (winningPrediction === null) {
            betRefunded = true; // Match nul
          } else {
            betWon = bet.prediction === winningPrediction;
          }
        } else if (betType === 'CLOSE_MATCH') {
          // Pari sur match serré
          betWon = (bet.prediction === 'yes' && isCloseMatch) ||
                   (bet.prediction === 'no' && !isCloseMatch);
        } else if (betType === 'HIGH_SCORE') {
          // Pari sur haut score
          betWon = (bet.prediction === 'yes' && isHighScore) ||
                   (bet.prediction === 'no' && !isHighScore);
        }

        if (betRefunded) {
          // Match nul - rembourser (seulement pour WINNER)
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'REFUNDED', payout: bet.amount }
          });
          await tx.user.update({
            where: { id: bet.userId },
            data: { balance: { increment: bet.amount } }
          });
          await createNotification(
            tx, bet.userId, 'BET_REFUNDED',
            'Pari remboursé',
            `Match nul! Tu as été remboursé de ${bet.amount} coins.`,
            match.id
          );
        } else if (betWon) {
          // Pari gagné - double de la mise
          const payout = bet.amount * 2;

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

          let message = `Tu as gagné ${payout} coins!`;
          if (betType === 'CLOSE_MATCH') {
            message = `Match serré (écart ${scoreDiff})! Tu as gagné ${payout} coins!`;
          } else if (betType === 'HIGH_SCORE') {
            message = `Score total ${totalScore}! Tu as gagné ${payout} coins!`;
          }

          await createNotification(
            tx, bet.userId, 'BET_WON',
            'Pari gagné!',
            message,
            match.id
          );
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

          let message = `Tu as perdu ${bet.amount} coins.`;
          if (betType === 'CLOSE_MATCH') {
            message = `Écart de ${scoreDiff} points. Tu as perdu ${bet.amount} coins.`;
          } else if (betType === 'HIGH_SCORE') {
            message = `Score total ${totalScore}. Tu as perdu ${bet.amount} coins.`;
          }

          await createNotification(
            tx, bet.userId, 'BET_LOST',
            'Pari perdu',
            message,
            match.id
          );
        }
      }
    });

    const updatedMatch = await req.prisma.match.findUnique({
      where: { id: req.params.id }
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

    // Vérifier que c'est le créateur du match
    if (match.createdBy !== req.userId) {
      return res.status(403).json({ error: 'Seul le créateur du match peut annuler' });
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
