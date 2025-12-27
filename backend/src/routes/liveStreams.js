import express from 'express';
import { PrismaClient } from '@prisma/client';
import streamManager from '../services/streamManager.js';
import streamCapture from '../services/streamCapture.js';
import ocrLearning from '../services/ocrLearning.js';
import multer from 'multer';

const router = express.Router();
const prisma = new PrismaClient();

// Configuration multer pour upload de screenshots
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

/**
 * GET /live-streams
 * Liste tous les streams (actifs et en attente)
 */
router.get('/', async (req, res) => {
  try {
    const streams = await prisma.liveStream.findMany({
      where: {
        status: { in: ['WAITING', 'LIVE', 'INTERMISSION'] }
      },
      orderBy: [
        { status: 'asc' }, // LIVE en premier
        { createdAt: 'desc' }
      ],
      include: {
        _count: {
          select: { liveBets: true }
        }
      }
    });

    res.json(streams);
  } catch (error) {
    console.error('Erreur liste streams:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /live-streams/:id
 * Détails d'un stream avec événements et paris
 */
router.get('/:id', async (req, res) => {
  try {
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id },
      include: {
        events: {
          orderBy: { detectedAt: 'desc' },
          take: 20
        },
        liveBets: {
          orderBy: { placedAt: 'desc' },
          take: 10
        },
        _count: {
          select: { liveBets: true }
        }
      }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream non trouvé' });
    }

    res.json(stream);
  } catch (error) {
    console.error('Erreur détails stream:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams
 * Créer un nouveau stream
 */
router.post('/', async (req, res) => {
  try {
    const { title, game, streamUrl, player1Name, player2Name, userId } = req.body;

    const stream = await prisma.liveStream.create({
      data: {
        title,
        game: game || 'NHL',
        streamUrl,
        streamerId: userId,
        player1Name,
        player2Name
      }
    });

    res.status(201).json(stream);
  } catch (error) {
    console.error('Erreur création stream:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams/:id/start
 * Démarrer le monitoring d'un stream
 */
router.post('/:id/start', async (req, res) => {
  try {
    await streamManager.startStream(req.params.id);

    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    res.json({ success: true, stream });
  } catch (error) {
    console.error('Erreur démarrage stream:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams/:id/stop
 * Arrêter un stream
 */
router.post('/:id/stop', async (req, res) => {
  try {
    await streamManager.stopStream(req.params.id);

    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    res.json({ success: true, stream });
  } catch (error) {
    console.error('Erreur arrêt stream:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams/:id/screenshot
 * Upload et analyse d'un screenshot manuel
 * (Alternative au capture automatique depuis le stream)
 */
router.post('/:id/screenshot', upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Analyser le screenshot
    const gameState = await streamCapture.analyzeScreenshot(req.file.buffer);

    if (!gameState) {
      return res.status(400).json({ error: 'Impossible d\'analyser l\'image' });
    }

    // Récupérer l'état précédent
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream non trouvé' });
    }

    const previousState = {
      score1: stream.currentScore1,
      score2: stream.currentScore2,
      period: stream.currentPeriod,
      time: stream.currentTime
    };

    // Détecter un but
    const goal = streamCapture.detectGoal(previousState, gameState);
    if (goal) {
      await streamManager.recordEvent(req.params.id, {
        type: 'GOAL',
        team: goal.team,
        period: goal.period,
        time: goal.time,
        score1: goal.newScore1,
        score2: goal.newScore2,
        description: `But! Score: ${goal.newScore1} - ${goal.newScore2}`
      });
    }

    // Mettre à jour l'état du stream
    await prisma.liveStream.update({
      where: { id: req.params.id },
      data: {
        currentScore1: gameState.score1 ?? stream.currentScore1,
        currentScore2: gameState.score2 ?? stream.currentScore2,
        currentPeriod: gameState.period ?? stream.currentPeriod,
        currentTime: gameState.time ?? stream.currentTime,
        shots1: gameState.shots1 ?? stream.shots1,
        shots2: gameState.shots2 ?? stream.shots2
      }
    });

    res.json({
      success: true,
      gameState,
      goalDetected: !!goal
    });
  } catch (error) {
    console.error('Erreur analyse screenshot:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams/:id/capture-twitch
 * Capture et analyse automatique du score depuis le stream Twitch
 */
router.post('/:id/capture-twitch', async (req, res) => {
  try {
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream non trouvé' });
    }

    // Extraire le channel Twitch depuis l'URL
    const twitchMatch = stream.streamUrl?.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    const channelName = req.body.channel || (twitchMatch ? twitchMatch[1] : null);

    if (!channelName) {
      return res.status(400).json({
        error: 'Aucun channel Twitch trouvé. Ajoute l\'URL Twitch au stream ou fournis le nom du channel.'
      });
    }

    console.log(`[OCR] Capture depuis Twitch: ${channelName}`);

    // Capturer et analyser depuis Twitch
    const result = await streamCapture.analyzeFromTwitch(channelName);

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Impossible de capturer le stream',
        details: 'Vérifie que le stream est en ligne et que streamlink/ffmpeg sont installés'
      });
    }

    // Utiliser le système d'apprentissage pour améliorer les résultats
    const detected = {
      score1: result.score1,
      score2: result.score2,
      period: result.period,
      time: result.time,
      confidence: 0.5 // Confiance de base
    };

    // Améliorer avec les patterns appris
    const enhanced = await ocrLearning.enhanceOcrResults(stream.game, result.rawText, detected);

    // Calculer la confiance basée sur la cohérence des données
    let confidence = enhanced.confidence || 0.5;

    // Bonus de confiance si les scores sont des nombres valides
    if (enhanced.score1 !== null && enhanced.score2 !== null &&
        enhanced.score1 >= 0 && enhanced.score1 <= 20 &&
        enhanced.score2 >= 0 && enhanced.score2 <= 20) {
      confidence += 0.2;
    }

    // Bonus si on détecte une période valide
    if (enhanced.period && enhanced.period >= 1 && enhanced.period <= 5) {
      confidence += 0.1;
    }

    confidence = Math.min(1.0, confidence);

    const response = {
      success: true,
      detected: {
        score1: enhanced.score1,
        score2: enhanced.score2,
        period: enhanced.period,
        time: enhanced.time,
        screenType: result.screenType
      },
      confidence,
      enhancedByLearning: enhanced.enhancedByLearning || false,
      rawText: result.rawText,
      channel: channelName,
      timestamp: result.timestamp
    };

    // Si demandé, mettre à jour automatiquement (seulement si confiance élevée)
    if (req.body.autoUpdate && confidence >= 0.8 && (enhanced.score1 !== null || enhanced.score2 !== null)) {
      const previousState = {
        score1: stream.currentScore1,
        score2: stream.currentScore2
      };

      // Détecter un but
      const goal = streamCapture.detectGoal(previousState, {
        score1: enhanced.score1,
        score2: enhanced.score2
      });

      if (goal) {
        await streamManager.recordEvent(req.params.id, {
          type: 'GOAL',
          team: goal.team,
          period: enhanced.period || stream.currentPeriod,
          time: enhanced.time || stream.currentTime,
          score1: enhanced.score1,
          score2: enhanced.score2,
          description: `But détecté par OCR! Score: ${enhanced.score1} - ${enhanced.score2}`
        });
      }

      // Mettre à jour le stream
      await prisma.liveStream.update({
        where: { id: req.params.id },
        data: {
          currentScore1: enhanced.score1 ?? stream.currentScore1,
          currentScore2: enhanced.score2 ?? stream.currentScore2,
          currentPeriod: enhanced.period ?? stream.currentPeriod,
          currentTime: enhanced.time ?? stream.currentTime
        }
      });

      response.updated = true;
      response.goalDetected = !!goal;
    }

    res.json(response);
  } catch (error) {
    console.error('Erreur capture Twitch:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams/:id/manual-update
 * Mise à jour manuelle du score (pour les cas où l'OCR ne marche pas)
 */
router.post('/:id/manual-update', async (req, res) => {
  try {
    const { score1, score2, period, time, eventType, eventDescription } = req.body;

    // Récupérer l'état précédent
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream non trouvé' });
    }

    // Détecter si c'est un but
    if (score1 !== undefined && score2 !== undefined) {
      const goal = streamCapture.detectGoal(
        { score1: stream.currentScore1, score2: stream.currentScore2 },
        { score1, score2 }
      );

      if (goal) {
        await streamManager.recordEvent(req.params.id, {
          type: 'GOAL',
          team: goal.team,
          period: period || stream.currentPeriod,
          time: time || stream.currentTime,
          score1,
          score2,
          description: eventDescription || `But! Score: ${score1} - ${score2}`
        });
      }
    }

    // Enregistrer un événement personnalisé
    if (eventType) {
      await streamManager.recordEvent(req.params.id, {
        type: eventType,
        period: period || stream.currentPeriod,
        time: time || stream.currentTime,
        score1: score1 ?? stream.currentScore1,
        score2: score2 ?? stream.currentScore2,
        description: eventDescription || ''
      });
    }

    // Mettre à jour le stream
    const updatedStream = await prisma.liveStream.update({
      where: { id: req.params.id },
      data: {
        ...(score1 !== undefined && { currentScore1: score1 }),
        ...(score2 !== undefined && { currentScore2: score2 }),
        ...(period !== undefined && { currentPeriod: period }),
        ...(time !== undefined && { currentTime: time })
      }
    });

    res.json({ success: true, stream: updatedStream });
  } catch (error) {
    console.error('Erreur mise à jour manuelle:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams/:id/bet
 * Placer un pari sur un stream
 */
router.post('/:id/bet', async (req, res) => {
  try {
    const { userId, betType, prediction, amount, spreadValue, totalValue } = req.body;

    // Récupérer le stream pour calculer les cotes
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream non trouvé' });
    }

    if (stream.status !== 'LIVE' && stream.status !== 'INTERMISSION') {
      return res.status(400).json({ error: 'Le stream n\'est pas en cours' });
    }

    // Calculer les cotes dynamiques
    const odds = calculateOdds(stream, betType, prediction, spreadValue, totalValue);

    // Placer le pari
    const bet = await streamManager.placeLiveBet({
      userId,
      streamId: req.params.id,
      betType,
      prediction,
      amount,
      odds,
      spreadValue,
      totalValue
    });

    res.status(201).json(bet);
  } catch (error) {
    console.error('Erreur placement pari:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /live-streams/:id/odds
 * Obtenir les cotes actuelles pour un stream
 */
router.get('/:id/odds', async (req, res) => {
  try {
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream non trouvé' });
    }

    const odds = {
      matchWinner: {
        player1: calculateOdds(stream, 'MATCH_WINNER', 'player1'),
        player2: calculateOdds(stream, 'MATCH_WINNER', 'player2')
      },
      spread: {
        player1_minus_1_5: calculateOdds(stream, 'SPREAD', 'player1', -1.5),
        player1_plus_1_5: calculateOdds(stream, 'SPREAD', 'player1', 1.5),
        player2_minus_1_5: calculateOdds(stream, 'SPREAD', 'player2', -1.5),
        player2_plus_1_5: calculateOdds(stream, 'SPREAD', 'player2', 1.5)
      },
      totalGoals: {
        over_4_5: calculateOdds(stream, 'TOTAL_GOALS', 'over', null, 4.5),
        under_4_5: calculateOdds(stream, 'TOTAL_GOALS', 'under', null, 4.5),
        over_5_5: calculateOdds(stream, 'TOTAL_GOALS', 'over', null, 5.5),
        under_5_5: calculateOdds(stream, 'TOTAL_GOALS', 'under', null, 5.5)
      },
      nextGoal: {
        player1: calculateOdds(stream, 'NEXT_GOAL', 'player1'),
        player2: calculateOdds(stream, 'NEXT_GOAL', 'player2')
      }
    };

    res.json(odds);
  } catch (error) {
    console.error('Erreur calcul cotes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /live-streams/:id/my-bets
 * Obtenir les paris d'un utilisateur sur un stream
 */
router.get('/:id/my-bets', async (req, res) => {
  try {
    const { userId } = req.query;

    const bets = await prisma.liveBet.findMany({
      where: {
        streamId: req.params.id,
        userId
      },
      orderBy: { placedAt: 'desc' }
    });

    res.json(bets);
  } catch (error) {
    console.error('Erreur récupération paris:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Calcule les cotes dynamiques basées sur l'état du match
 */
function calculateOdds(stream, betType, prediction, spreadValue = null, totalValue = null) {
  const score1 = stream.currentScore1;
  const score2 = stream.currentScore2;
  const period = stream.currentPeriod;
  const scoreDiff = score1 - score2;
  const totalGoals = score1 + score2;

  // Temps restant estimé (périodes de 20 min)
  const periodsRemaining = Math.max(0, 3 - period);
  const timeRemainingFactor = 0.3 + (periodsRemaining * 0.233); // 0.3 à 1.0

  let baseCote = 2.0;

  switch (betType) {
    case 'MATCH_WINNER':
      if (prediction === 'player1') {
        if (scoreDiff > 0) baseCote = 1.2 + (timeRemainingFactor * 0.5);
        else if (scoreDiff < 0) baseCote = 2.5 + (-scoreDiff * 0.3);
        else baseCote = 2.0;
      } else {
        if (scoreDiff < 0) baseCote = 1.2 + (timeRemainingFactor * 0.5);
        else if (scoreDiff > 0) baseCote = 2.5 + (scoreDiff * 0.3);
        else baseCote = 2.0;
      }
      break;

    case 'SPREAD':
      // Spread dynamique basé sur le score actuel
      const adjustedDiff = prediction === 'player1' ?
        scoreDiff + spreadValue : -scoreDiff + spreadValue;

      if (adjustedDiff > 0) baseCote = 1.5;
      else if (adjustedDiff < 0) baseCote = 2.5;
      else baseCote = 1.9;

      baseCote += (timeRemainingFactor * 0.3);
      break;

    case 'TOTAL_GOALS':
      const goalsPerPeriod = totalGoals / Math.max(1, period);
      const projectedTotal = goalsPerPeriod * 3;

      if (prediction === 'over') {
        baseCote = projectedTotal > totalValue ? 1.7 : 2.3;
      } else {
        baseCote = projectedTotal < totalValue ? 1.7 : 2.3;
      }
      break;

    case 'NEXT_GOAL':
      // Basé sur le momentum (shots, temps d'attaque)
      const shots1 = stream.shots1 || 10;
      const shots2 = stream.shots2 || 10;
      const shotRatio = shots1 / (shots1 + shots2);

      if (prediction === 'player1') {
        baseCote = 1.5 + ((1 - shotRatio) * 1.5);
      } else {
        baseCote = 1.5 + (shotRatio * 1.5);
      }
      break;

    case 'FIRST_GOAL':
      // Si aucun but n'a été marqué
      if (totalGoals === 0) {
        baseCote = 2.0;
      } else {
        baseCote = 0; // Pari fermé
      }
      break;

    case 'EXACT_SCORE':
      // Plus difficile = meilleure cote
      baseCote = 5 + (Math.abs(scoreDiff) * 2) + (timeRemainingFactor * 5);
      break;

    default:
      baseCote = 2.0;
  }

  // Arrondir à 2 décimales
  return Math.round(baseCote * 100) / 100;
}

// ==========================================
// OCR LEARNING / RAG ENDPOINTS
// ==========================================

/**
 * POST /live-streams/:id/ocr-feedback
 * Enregistre une correction OCR pour l'apprentissage
 */
router.post('/:id/ocr-feedback', async (req, res) => {
  try {
    const { detected, corrected, rawText, twitchChannel, game } = req.body;

    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    const correction = await ocrLearning.recordCorrection({
      streamId: req.params.id,
      game: game || stream?.game || 'NHL',
      rawText,
      detected: detected || {},
      corrected: corrected || {},
      twitchChannel
    });

    res.json({
      success: true,
      correctionId: correction.id,
      wasCorrect: correction.wasCorrect,
      message: correction.wasCorrect
        ? 'OCR était correct! Apprentissage enregistré.'
        : 'Correction enregistrée. Le système va apprendre de cette correction.'
    });
  } catch (error) {
    console.error('Erreur feedback OCR:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-streams/:id/ocr-incorrect
 * Marque un résultat OCR comme incorrect (sans fournir de correction)
 */
router.post('/:id/ocr-incorrect', async (req, res) => {
  try {
    const { detected, rawText, feedbackNote, twitchChannel, game } = req.body;

    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    const correction = await ocrLearning.markAsIncorrect({
      streamId: req.params.id,
      game: game || stream?.game || 'NHL',
      rawText,
      detected: detected || {},
      feedbackNote,
      twitchChannel
    });

    res.json({
      success: true,
      correctionId: correction.id,
      message: 'Merci pour le feedback! Le système va éviter ce pattern à l\'avenir.'
    });
  } catch (error) {
    console.error('Erreur marquage incorrect:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /live-streams/ocr-stats
 * Obtient les statistiques d'apprentissage OCR
 */
router.get('/ocr-stats', async (req, res) => {
  try {
    const { game } = req.query;
    const stats = await ocrLearning.getLearningStats(game);

    res.json(stats);
  } catch (error) {
    console.error('Erreur stats OCR:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /live-streams/:id/twitch-status
 * Vérifie si le stream Twitch est en ligne
 */
router.get('/:id/twitch-status', async (req, res) => {
  try {
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream non trouvé' });
    }

    // Extraire le channel Twitch depuis l'URL
    const twitchMatch = stream.streamUrl?.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    const channelName = twitchMatch ? twitchMatch[1] : null;

    if (!channelName) {
      return res.json({
        isLive: false,
        channel: null,
        error: 'Pas de canal Twitch configuré'
      });
    }

    // Vérifier si le stream est en ligne via streamlink
    const isLive = await streamCapture.checkStreamLive(channelName);

    res.json({
      isLive,
      channel: channelName,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erreur vérification Twitch:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
