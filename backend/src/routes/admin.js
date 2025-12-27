import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { analyzeScreenshot, analyzeFromTwitch, checkStreamLive } from '../services/streamCapture.js';
import { getLearningStats, recordCorrection, enhanceOcrResults } from '../services/ocrLearning.js';
import { startOcrWorker, stopOcrWorker, getWorkerStatus, forceScan } from '../services/ocrWorker.js';
import multer from 'multer';

const router = Router();

// Config multer pour upload d'images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont acceptées'), false);
    }
  }
});

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

// ============================================
// ROUTES OCR - Détection de score par image
// ============================================

// POST /admin/ocr/analyze-twitch - Analyser un stream Twitch en direct
router.post('/ocr/analyze-twitch', authenticate, requireAdmin, async (req, res) => {
  try {
    const { channelName } = req.body;

    if (!channelName) {
      return res.status(400).json({ error: 'Nom du channel Twitch requis' });
    }

    console.log(`[Admin OCR] Analyse du stream Twitch: ${channelName}`);

    // Vérifier si le stream est en ligne
    const isLive = await checkStreamLive(channelName);
    if (!isLive) {
      return res.json({
        success: false,
        error: 'Le stream n\'est pas en ligne',
        channel: channelName
      });
    }

    // Analyser le stream
    const result = await analyzeFromTwitch(channelName);

    // Améliorer avec l'apprentissage
    if (result.success && result.rawText) {
      const enhanced = await enhanceOcrResults('NHL', result.rawText, result);
      return res.json({
        ...result,
        ...enhanced,
        enhanced: enhanced.enhancedByLearning
      });
    }

    res.json(result);
  } catch (error) {
    console.error('[Admin OCR] Erreur analyse Twitch:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/ocr/analyze-image - Analyser une image uploadée
router.post('/ocr/analyze-image', authenticate, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image requise' });
    }

    console.log(`[Admin OCR] Analyse d'image: ${req.file.originalname} (${req.file.size} bytes)`);

    // Analyser l'image
    const result = await analyzeScreenshot(req.file.buffer);

    if (!result) {
      return res.json({
        success: false,
        error: 'Impossible d\'analyser l\'image'
      });
    }

    // Améliorer avec l'apprentissage
    const enhanced = await enhanceOcrResults('NHL', result.rawText, result);

    res.json({
      success: true,
      ...enhanced,
      filename: req.file.originalname,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin OCR] Erreur analyse image:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/ocr/correct - Enregistrer une correction OCR
router.post('/ocr/correct', authenticate, requireAdmin, async (req, res) => {
  try {
    const { detected, corrected, rawText, twitchChannel, game } = req.body;

    if (!detected || !corrected) {
      return res.status(400).json({ error: 'Données détectées et corrigées requises' });
    }

    const correction = await recordCorrection({
      streamId: null,
      game: game || 'NHL',
      rawText: rawText || '',
      detected,
      corrected,
      twitchChannel
    });

    res.json({
      success: true,
      correctionId: correction.id,
      wasCorrect: correction.wasCorrect
    });
  } catch (error) {
    console.error('[Admin OCR] Erreur correction:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/ocr/stats - Statistiques d'apprentissage OCR
router.get('/ocr/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const { game } = req.query;
    const stats = await getLearningStats(game || 'NHL');
    res.json(stats);
  } catch (error) {
    console.error('[Admin OCR] Erreur stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OCR WORKER - Détection automatique en temps réel
// ============================================

// GET /admin/ocr/worker/status - Statut du worker OCR
router.get('/ocr/worker/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const status = getWorkerStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/ocr/worker/start - Démarrer le worker OCR
router.post('/ocr/worker/start', authenticate, requireAdmin, async (req, res) => {
  try {
    startOcrWorker();
    res.json({ success: true, message: 'Worker OCR démarré' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/ocr/worker/stop - Arrêter le worker OCR
router.post('/ocr/worker/stop', authenticate, requireAdmin, async (req, res) => {
  try {
    stopOcrWorker();
    res.json({ success: true, message: 'Worker OCR arrêté' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/ocr/worker/scan - Forcer un scan immédiat
router.post('/ocr/worker/scan', authenticate, requireAdmin, async (req, res) => {
  try {
    await forceScan();
    res.json({ success: true, message: 'Scan forcé effectué' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/active-streams - Récupérer tous les streams actifs avec scores OCR
router.get('/active-streams', authenticate, requireAdmin, async (req, res) => {
  try {
    const activeStreams = await req.prisma.activeStream.findMany({
      where: { isLive: true },
      orderBy: { updatedAt: 'desc' }
    });

    // Enrichir avec les infos utilisateur
    const streamsWithUsers = await Promise.all(
      activeStreams.map(async (stream) => {
        const user = await req.prisma.user.findUnique({
          where: { id: stream.userId },
          select: {
            id: true,
            username: true,
            twitchUsername: true,
            xboxGamertag: true,
            xboxAvatar: true
          }
        });

        return {
          ...stream,
          user,
          twitchUrl: `https://twitch.tv/${stream.twitchChannel}`
        };
      })
    );

    res.json({
      count: streamsWithUsers.length,
      workerStatus: getWorkerStatus(),
      streams: streamsWithUsers
    });
  } catch (error) {
    console.error('[Admin] Erreur active-streams:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /admin/active-streams/:id - Supprimer un stream actif
router.delete('/active-streams/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await req.prisma.activeStream.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FONCTIONS HELPER
// ============================================

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
