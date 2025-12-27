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
        bets: { select: { id: true, prediction: true, amount: true, betType: true } }
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
            betType: true,
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
      player1UserId, player2UserId, scheduledAt,
      // OCR options
      ocrEnabled, twitchChannel
    } = req.body;

    if (!game || !player1Name || !player2Name) {
      return res.status(400).json({ error: 'Jeu et noms des équipes/joueurs requis' });
    }

    // Si un userId est fourni, récupérer le username pour player1HumanName/player2HumanName
    let p1HumanName = player1HumanName;
    let p2HumanName = player2HumanName;

    if (player1UserId && player1Type === 'HUMAN') {
      const user1 = await req.prisma.user.findUnique({
        where: { id: player1UserId },
        select: { username: true }
      });
      if (user1) p1HumanName = user1.username;
    }

    if (player2UserId && player2Type === 'HUMAN') {
      const user2 = await req.prisma.user.findUnique({
        where: { id: player2UserId },
        select: { username: true }
      });
      if (user2) p2HumanName = user2.username;
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
        player1HumanName: player1Type === 'HUMAN' ? p1HumanName : null,
        player2HumanName: player2Type === 'HUMAN' ? p2HumanName : null,
        player1Id: player1Type === 'HUMAN' && player1UserId ? player1UserId : null,
        player2Id: player2Type === 'HUMAN' && player2UserId ? player2UserId : null,
        createdBy: req.userId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        // OCR options
        ocrEnabled: ocrEnabled || false,
        twitchChannel: ocrEnabled && twitchChannel ? twitchChannel : null
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

// Soumettre le score (double confirmation)
router.post('/:id/submit-score', authenticate, async (req, res) => {
  try {
    const { player1Score, player2Score } = req.body;

    if (player1Score === undefined || player2Score === undefined) {
      return res.status(400).json({ error: 'Les deux scores sont requis' });
    }

    if (player1Score < 0 || player2Score < 0) {
      return res.status(400).json({ error: 'Les scores doivent être positifs' });
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

    if (match.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Match annulé' });
    }

    // Identifier si l'utilisateur est joueur 1 ou joueur 2
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId }
    });

    const isPlayer1 = match.player1HumanName === user.username || match.createdBy === req.userId;
    const isPlayer2 = match.player2HumanName === user.username;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: 'Tu ne participes pas à ce match' });
    }

    const now = new Date();

    if (isPlayer1) {
      // Joueur 1 soumet son score
      if (match.player1SubmittedAt) {
        return res.status(400).json({ error: 'Tu as déjà soumis ton score' });
      }

      await req.prisma.match.update({
        where: { id: req.params.id },
        data: {
          player1SubmittedP1Score: player1Score,
          player1SubmittedP2Score: player2Score,
          player1SubmittedAt: now,
          status: 'LIVE'
        }
      });

      // Vérifier si l'autre joueur a déjà soumis
      if (match.player2SubmittedAt) {
        return await checkAndValidateScores(req, res, req.params.id, player1Score, player2Score, match.player2SubmittedP1Score, match.player2SubmittedP2Score);
      }

      return res.json({
        message: 'Score soumis! En attente de la confirmation de l\'adversaire.',
        waitingFor: 'player2'
      });
    } else {
      // Joueur 2 soumet son score
      if (match.player2SubmittedAt) {
        return res.status(400).json({ error: 'Tu as déjà soumis ton score' });
      }

      await req.prisma.match.update({
        where: { id: req.params.id },
        data: {
          player2SubmittedP1Score: player1Score,
          player2SubmittedP2Score: player2Score,
          player2SubmittedAt: now,
          status: 'LIVE'
        }
      });

      // Vérifier si l'autre joueur a déjà soumis
      if (match.player1SubmittedAt) {
        return await checkAndValidateScores(req, res, req.params.id, match.player1SubmittedP1Score, match.player1SubmittedP2Score, player1Score, player2Score);
      }

      return res.json({
        message: 'Score soumis! En attente de la confirmation de l\'adversaire.',
        waitingFor: 'player1'
      });
    }
  } catch (error) {
    console.error('Submit score error:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission du score' });
  }
});

// Fonction helper pour vérifier et valider les scores
async function checkAndValidateScores(req, res, matchId, p1SubmittedP1, p1SubmittedP2, p2SubmittedP1, p2SubmittedP2) {
  // Les deux joueurs ont soumis, vérifier si les scores correspondent
  if (p1SubmittedP1 === p2SubmittedP1 && p1SubmittedP2 === p2SubmittedP2) {
    // Scores identiques! Valider automatiquement le match
    const player1Score = p1SubmittedP1;
    const player2Score = p1SubmittedP2;

    const match = await req.prisma.match.findUnique({
      where: { id: matchId },
      include: { bets: true }
    });

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
      await tx.match.update({
        where: { id: matchId },
        data: {
          player1Score,
          player2Score,
          winnerId: winningPrediction,
          status: 'COMPLETED'
        }
      });

      // Traiter les paris (même logique que dans /:id/result)
      for (const bet of match.bets) {
        const betType = bet.betType || 'WINNER';
        let betWon = false;
        let betRefunded = false;

        if (betType === 'WINNER') {
          if (winningPrediction === null) {
            betRefunded = true;
          } else {
            betWon = bet.prediction === winningPrediction;
          }
        } else if (betType === 'CLOSE_MATCH') {
          betWon = (bet.prediction === 'yes' && isCloseMatch) ||
                   (bet.prediction === 'no' && !isCloseMatch);
        } else if (betType === 'HIGH_SCORE') {
          betWon = (bet.prediction === 'yes' && isHighScore) ||
                   (bet.prediction === 'no' && !isHighScore);
        }

        if (betRefunded) {
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
            matchId
          );
        } else if (betWon) {
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
            matchId
          );
        } else {
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
            matchId
          );
        }
      }
    });

    return res.json({
      message: 'Scores confirmés! Match validé automatiquement.',
      validated: true,
      player1Score,
      player2Score,
      winner: winningPrediction
    });
  } else {
    // Scores différents! Créer un conflit
    await req.prisma.match.update({
      where: { id: matchId },
      data: { scoreDispute: true }
    });

    return res.json({
      message: 'Conflit de scores! Les scores soumis ne correspondent pas. Un administrateur va vérifier.',
      dispute: true,
      player1Submission: { p1: p1SubmittedP1, p2: p1SubmittedP2 },
      player2Submission: { p1: p2SubmittedP1, p2: p2SubmittedP2 }
    });
  }
}

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

// ============================================
// OCR - Détection automatique du score
// ============================================

// Activer l'OCR pour un match (lier à un stream Twitch)
router.post('/:id/ocr/enable', authenticate, async (req, res) => {
  try {
    const { twitchChannel } = req.body;

    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    // Vérifier que c'est le créateur ou un participant
    if (match.createdBy !== req.userId && match.player1Id !== req.userId && match.player2Id !== req.userId) {
      return res.status(403).json({ error: 'Tu ne participes pas à ce match' });
    }

    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Match terminé ou annulé' });
    }

    // Si pas de twitchChannel fourni, utiliser celui de l'utilisateur
    let channel = twitchChannel;
    if (!channel) {
      const user = await req.prisma.user.findUnique({
        where: { id: req.userId },
        select: { twitchUsername: true }
      });
      channel = user?.twitchUsername;
    }

    if (!channel) {
      return res.status(400).json({ error: 'Aucun channel Twitch spécifié ou configuré' });
    }

    // Activer l'OCR
    const updatedMatch = await req.prisma.match.update({
      where: { id: req.params.id },
      data: {
        ocrEnabled: true,
        twitchChannel: channel,
        status: 'LIVE'
      }
    });

    res.json({
      message: `OCR activé! Le score sera détecté automatiquement depuis ${channel}`,
      match: updatedMatch
    });
  } catch (error) {
    console.error('Enable OCR error:', error);
    res.status(500).json({ error: 'Erreur activation OCR' });
  }
});

// Désactiver l'OCR pour un match
router.post('/:id/ocr/disable', authenticate, async (req, res) => {
  try {
    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    if (match.createdBy !== req.userId) {
      return res.status(403).json({ error: 'Seul le créateur peut désactiver l\'OCR' });
    }

    const updatedMatch = await req.prisma.match.update({
      where: { id: req.params.id },
      data: {
        ocrEnabled: false
      }
    });

    res.json({
      message: 'OCR désactivé',
      match: updatedMatch
    });
  } catch (error) {
    console.error('Disable OCR error:', error);
    res.status(500).json({ error: 'Erreur désactivation OCR' });
  }
});

// Obtenir le score OCR actuel pour un match
router.get('/:id/ocr', async (req, res) => {
  try {
    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        ocrEnabled: true,
        twitchChannel: true,
        ocrScore1: true,
        ocrScore2: true,
        ocrPeriod: true,
        ocrTime: true,
        ocrLastUpdate: true,
        ocrConfidence: true,
        status: true
      }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    // Si OCR est activé, chercher aussi dans ActiveStream pour les données en temps réel
    let liveData = null;
    if (match.ocrEnabled && match.twitchChannel) {
      liveData = await req.prisma.activeStream.findUnique({
        where: { twitchChannel: match.twitchChannel }
      });
    }

    res.json({
      ...match,
      liveStream: liveData ? {
        isLive: liveData.isLive,
        detectedScore1: liveData.detectedScore1,
        detectedScore2: liveData.detectedScore2,
        detectedPeriod: liveData.detectedPeriod,
        detectedTime: liveData.detectedTime,
        powerPlay: liveData.powerPlay,
        confidence: liveData.confidence,
        lastOcrAt: liveData.lastOcrAt
      } : null
    });
  } catch (error) {
    console.error('Get OCR status error:', error);
    res.status(500).json({ error: 'Erreur récupération OCR' });
  }
});

// Appliquer le score OCR comme score final
router.post('/:id/ocr/apply', authenticate, async (req, res) => {
  try {
    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    if (match.createdBy !== req.userId) {
      return res.status(403).json({ error: 'Seul le créateur peut appliquer le score' });
    }

    if (!match.ocrEnabled) {
      return res.status(400).json({ error: 'OCR non activé pour ce match' });
    }

    // Récupérer le score depuis ActiveStream
    const liveData = await req.prisma.activeStream.findUnique({
      where: { twitchChannel: match.twitchChannel }
    });

    if (!liveData || liveData.detectedScore1 === null) {
      return res.status(400).json({ error: 'Aucun score détecté' });
    }

    // Mettre à jour le match avec le score OCR
    await req.prisma.match.update({
      where: { id: req.params.id },
      data: {
        ocrScore1: liveData.detectedScore1,
        ocrScore2: liveData.detectedScore2,
        ocrPeriod: liveData.detectedPeriod,
        ocrTime: liveData.detectedTime,
        ocrLastUpdate: new Date(),
        ocrConfidence: liveData.confidence
      }
    });

    res.json({
      message: 'Score OCR enregistré',
      score1: liveData.detectedScore1,
      score2: liveData.detectedScore2,
      period: liveData.detectedPeriod,
      time: liveData.detectedTime
    });
  } catch (error) {
    console.error('Apply OCR score error:', error);
    res.status(500).json({ error: 'Erreur application score OCR' });
  }
});

// Finaliser le match avec le score OCR
router.post('/:id/ocr/finalize', authenticate, async (req, res) => {
  try {
    const match = await req.prisma.match.findUnique({
      where: { id: req.params.id },
      include: { bets: true }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    if (match.createdBy !== req.userId) {
      return res.status(403).json({ error: 'Seul le créateur peut finaliser' });
    }

    if (match.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Match déjà terminé' });
    }

    // Utiliser le score OCR stocké ou le dernier score live
    let player1Score = match.ocrScore1;
    let player2Score = match.ocrScore2;

    if (player1Score === null && match.twitchChannel) {
      const liveData = await req.prisma.activeStream.findUnique({
        where: { twitchChannel: match.twitchChannel }
      });
      if (liveData) {
        player1Score = liveData.detectedScore1;
        player2Score = liveData.detectedScore2;
      }
    }

    if (player1Score === null || player2Score === null) {
      return res.status(400).json({ error: 'Aucun score détecté pour finaliser' });
    }

    // Déterminer le gagnant
    let winningPrediction = null;
    if (player1Score > player2Score) {
      winningPrediction = 'player1';
    } else if (player2Score > player1Score) {
      winningPrediction = 'player2';
    }

    // Calculer les stats
    const thresholds = GAME_THRESHOLDS[match.game] || GAME_THRESHOLDS.OTHER;
    const scoreDiff = Math.abs(player1Score - player2Score);
    const totalScore = player1Score + player2Score;
    const isCloseMatch = scoreDiff <= thresholds.closeMatch;
    const isHighScore = totalScore >= thresholds.highScore;

    // Transaction pour finaliser
    await req.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: req.params.id },
        data: {
          player1Score,
          player2Score,
          winnerId: winningPrediction,
          status: 'COMPLETED',
          ocrEnabled: false
        }
      });

      // Traiter les paris (même logique que submit-score)
      for (const bet of match.bets) {
        const betType = bet.betType || 'WINNER';
        let betWon = false;
        let betRefunded = false;

        if (betType === 'WINNER') {
          if (winningPrediction === null) {
            betRefunded = true;
          } else {
            betWon = bet.prediction === winningPrediction;
          }
        } else if (betType === 'CLOSE_MATCH') {
          betWon = (bet.prediction === 'yes' && isCloseMatch) ||
                   (bet.prediction === 'no' && !isCloseMatch);
        } else if (betType === 'HIGH_SCORE') {
          betWon = (bet.prediction === 'yes' && isHighScore) ||
                   (bet.prediction === 'no' && !isHighScore);
        }

        if (betRefunded) {
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'REFUNDED', payout: bet.amount }
          });
          await tx.user.update({
            where: { id: bet.userId },
            data: { balance: { increment: bet.amount } }
          });
        } else if (betWon) {
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
        } else {
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

    res.json({
      message: 'Match finalisé avec le score OCR!',
      player1Score,
      player2Score,
      winner: winningPrediction
    });
  } catch (error) {
    console.error('Finalize OCR match error:', error);
    res.status(500).json({ error: 'Erreur finalisation match' });
  }
});

export default router;
