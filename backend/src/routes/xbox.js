import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import xboxService, { getMicrosoftProfile } from '../services/xboxLive.js';
import crypto from 'crypto';

const router = Router();

// Stockage temporaire des states OAuth (en production, utiliser Redis)
const pendingStates = new Map();

/**
 * GET /xbox/auth
 * Initie le flux OAuth Xbox Live
 */
router.get('/auth', authenticate, (req, res) => {
  try {
    // Vérifier que les credentials Xbox sont configurés
    if (!process.env.XBOX_CLIENT_ID) {
      return res.status(503).json({
        error: 'Xbox Live API non configurée',
        setup: true,
        instructions: 'Configurer XBOX_CLIENT_ID et XBOX_CLIENT_SECRET dans les variables d\'environnement'
      });
    }

    // Générer un state unique pour sécuriser le flux OAuth
    const state = crypto.randomBytes(16).toString('hex');

    // Stocker le state avec l'userId (expire après 10 minutes)
    pendingStates.set(state, {
      userId: req.userId,
      createdAt: Date.now()
    });

    // Nettoyer les states expirés
    setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);

    const authUrl = xboxService.getAuthorizationUrl(state);

    res.json({ authUrl, state });
  } catch (error) {
    console.error('Xbox auth init error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'initialisation Xbox' });
  }
});

/**
 * POST /xbox/callback
 * Callback OAuth - échange le code contre un token
 */
router.post('/callback', authenticate, async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({ error: 'Code et state requis' });
    }

    // Vérifier le state
    const pendingState = pendingStates.get(state);
    if (!pendingState || pendingState.userId !== req.userId) {
      return res.status(400).json({ error: 'State invalide ou expiré' });
    }

    pendingStates.delete(state);

    // Échanger le code contre un token Microsoft
    const tokenData = await xboxService.exchangeCodeForToken(code);

    // Essayer d'authentifier avec Xbox Live
    const xboxData = await xboxService.authenticateWithXboxLive(tokenData.access_token);

    let gamertag, xuid, gamerscore, avatar;

    if (xboxData) {
      // Xbox Live auth réussie
      gamertag = xboxData.gamertag;
      xuid = xboxData.xuid;
      gamerscore = 0;
      avatar = null;

      // Essayer d'obtenir le profil Xbox (peut échouer sans permissions)
      try {
        const profile = await xboxService.getXboxProfile(xboxData.xblToken, xboxData.userHash);
        if (profile) {
          gamerscore = parseInt(profile.Gamerscore) || 0;
          avatar = profile.GameDisplayPicRaw || null;
        }
      } catch (e) {
        console.log('Could not fetch Xbox profile, using basic info');
      }
    } else {
      // Fallback: utiliser Microsoft Graph
      const msProfile = await getMicrosoftProfile(tokenData.access_token);
      if (msProfile) {
        gamertag = msProfile.displayName || 'Microsoft User';
        xuid = msProfile.id;
        gamerscore = 0;
        avatar = null;
      } else {
        throw new Error('Impossible de récupérer le profil');
      }
    }

    // Mettre à jour l'utilisateur
    await req.prisma.user.update({
      where: { id: req.userId },
      data: {
        xboxGamertag: gamertag,
        xboxXuid: xuid,
        xboxAccessToken: tokenData.access_token,
        xboxRefreshToken: tokenData.refresh_token,
        xboxTokenExpiry: new Date(Date.now() + (tokenData.expires_in * 1000)),
        xboxGamerscore: gamerscore,
        xboxAvatar: avatar,
        xboxVerified: true
      }
    });

    res.json({
      success: true,
      gamertag: gamertag,
      gamerscore: gamerscore,
      avatar: avatar,
      message: `Compte "${gamertag}" lié avec succès!`
    });
  } catch (error) {
    console.error('Xbox callback error:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la liaison Xbox' });
  }
});

/**
 * GET /xbox/profile
 * Obtient le profil Xbox de l'utilisateur connecté
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        xboxGamertag: true,
        xboxXuid: true,
        xboxVerified: true,
        xboxGamerscore: true,
        xboxAvatar: true
      }
    });

    if (!user.xboxVerified) {
      return res.status(404).json({ error: 'Compte Xbox non lié' });
    }

    res.json({
      gamertag: user.xboxGamertag,
      xuid: user.xboxXuid,
      gamerscore: user.xboxGamerscore,
      avatar: user.xboxAvatar,
      verified: true
    });
  } catch (error) {
    console.error('Xbox profile error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

/**
 * GET /xbox/activity
 * Obtient l'activité récente Xbox (jeux joués)
 */
router.get('/activity', authenticate, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user.xboxVerified || !user.xboxAccessToken) {
      return res.status(404).json({ error: 'Compte Xbox non lié' });
    }

    // Vérifier si le token est expiré
    if (user.xboxTokenExpiry && new Date() > user.xboxTokenExpiry) {
      return res.status(401).json({ error: 'Token Xbox expiré, reconnexion requise' });
    }

    // Re-authentifier avec Xbox Live
    const xboxData = await xboxService.authenticateWithXboxLive(user.xboxAccessToken);

    // Obtenir l'activité
    const activity = await xboxService.getRecentActivity(
      user.xboxXuid,
      xboxData.xstsToken,
      xboxData.userHash
    );

    // Filtrer pour les jeux de sport EA
    const sportsGames = activity.filter(game => {
      const name = game.name?.toLowerCase() || '';
      return name.includes('madden') ||
             name.includes('nhl') ||
             name.includes('fifa') ||
             name.includes('nba 2k') ||
             name.includes('mlb the show') ||
             name.includes('ufc');
    });

    res.json({
      recentGames: sportsGames.slice(0, 10).map(game => ({
        name: game.name,
        titleId: game.titleId,
        lastPlayed: game.titleHistory?.lastTimePlayed,
        image: game.displayImage
      }))
    });
  } catch (error) {
    console.error('Xbox activity error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'activité' });
  }
});

/**
 * DELETE /xbox/unlink
 * Délier le compte Xbox
 */
router.delete('/unlink', authenticate, async (req, res) => {
  try {
    await req.prisma.user.update({
      where: { id: req.userId },
      data: {
        xboxXuid: null,
        xboxAccessToken: null,
        xboxRefreshToken: null,
        xboxTokenExpiry: null,
        xboxGamerscore: null,
        xboxAvatar: null,
        xboxVerified: false
      }
    });

    res.json({ success: true, message: 'Compte Xbox délié' });
  } catch (error) {
    console.error('Xbox unlink error:', error);
    res.status(500).json({ error: 'Erreur lors de la déconnexion Xbox' });
  }
});

/**
 * GET /xbox/verify/:gamertag
 * Vérifie si un gamertag existe (pour les autres utilisateurs)
 */
router.get('/verify/:gamertag', authenticate, async (req, res) => {
  try {
    const { gamertag } = req.params;

    // Chercher un utilisateur avec un compte Xbox vérifié pour utiliser son token
    const verifiedUser = await req.prisma.user.findFirst({
      where: {
        xboxVerified: true,
        xboxAccessToken: { not: null }
      }
    });

    if (!verifiedUser) {
      return res.status(503).json({
        error: 'Aucun compte Xbox vérifié disponible pour la recherche'
      });
    }

    // Authentifier avec Xbox Live
    const xboxData = await xboxService.authenticateWithXboxLive(verifiedUser.xboxAccessToken);

    // Rechercher le gamertag
    const profile = await xboxService.searchGamertag(
      gamertag,
      xboxData.xstsToken,
      xboxData.userHash
    );

    if (profile) {
      res.json({
        found: true,
        gamertag: profile.Gamertag,
        gamerscore: profile.Gamerscore,
        avatar: profile.GameDisplayPicRaw
      });
    } else {
      res.json({
        found: false,
        message: 'Gamertag non trouvé'
      });
    }
  } catch (error) {
    console.error('Xbox verify error:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification' });
  }
});

export default router;
