import express from 'express';
import {
  verifyTwitchUsername,
  verifyXboxGamertag,
  verifyPsnId,
  verifyEaId,
  verifySteamName,
  verifyNintendoId,
  verifyAllGamertags
} from '../services/verification.js';

const router = express.Router();

// POST /api/verify/twitch - Vérifier un pseudo Twitch
router.post('/twitch', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length < 2) {
      return res.status(400).json({
        valid: false,
        error: 'Pseudo Twitch requis (minimum 2 caractères)'
      });
    }

    const result = await verifyTwitchUsername(username.trim());
    res.json(result);
  } catch (error) {
    console.error('Erreur vérification Twitch:', error);
    res.status(500).json({
      valid: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

// POST /api/verify/xbox - Vérifier un gamertag Xbox
router.post('/xbox', async (req, res) => {
  try {
    const { gamertag } = req.body;

    if (!gamertag || gamertag.trim().length < 1) {
      return res.status(400).json({
        valid: false,
        error: 'Gamertag Xbox requis'
      });
    }

    const result = await verifyXboxGamertag(gamertag.trim());
    res.json(result);
  } catch (error) {
    console.error('Erreur vérification Xbox:', error);
    res.status(500).json({
      valid: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

// POST /api/verify/psn - Vérifier un PSN ID
router.post('/psn', async (req, res) => {
  try {
    const { psnId } = req.body;

    if (!psnId || psnId.trim().length < 3) {
      return res.status(400).json({
        valid: false,
        error: 'PSN ID requis (minimum 3 caractères)'
      });
    }

    const result = await verifyPsnId(psnId.trim());
    res.json(result);
  } catch (error) {
    console.error('Erreur vérification PSN:', error);
    res.status(500).json({
      valid: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

// POST /api/verify/ea - Vérifier un EA ID
router.post('/ea', async (req, res) => {
  try {
    const { eaId } = req.body;

    if (!eaId || eaId.trim().length < 4) {
      return res.status(400).json({
        valid: false,
        error: 'EA ID requis (minimum 4 caractères)'
      });
    }

    const result = await verifyEaId(eaId.trim());
    res.json(result);
  } catch (error) {
    console.error('Erreur vérification EA:', error);
    res.status(500).json({
      valid: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

// POST /api/verify/steam - Vérifier un nom Steam
router.post('/steam', async (req, res) => {
  try {
    const { steamName } = req.body;

    if (!steamName || steamName.trim().length < 2) {
      return res.status(400).json({
        valid: false,
        error: 'Nom Steam requis (minimum 2 caractères)'
      });
    }

    const result = await verifySteamName(steamName.trim());
    res.json(result);
  } catch (error) {
    console.error('Erreur vérification Steam:', error);
    res.status(500).json({
      valid: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

// POST /api/verify/nintendo - Vérifier un Nintendo ID
router.post('/nintendo', async (req, res) => {
  try {
    const { nintendoId } = req.body;

    if (!nintendoId || nintendoId.trim().length < 1) {
      return res.status(400).json({
        valid: false,
        error: 'Nintendo ID requis'
      });
    }

    const result = await verifyNintendoId(nintendoId.trim());
    res.json(result);
  } catch (error) {
    console.error('Erreur vérification Nintendo:', error);
    res.status(500).json({
      valid: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

// POST /api/verify/all - Vérifier tous les gamertags d'un coup
router.post('/all', async (req, res) => {
  try {
    const gamertags = req.body;

    if (!gamertags || typeof gamertags !== 'object') {
      return res.status(400).json({
        allValid: false,
        error: 'Données invalides'
      });
    }

    const result = await verifyAllGamertags(gamertags);
    res.json(result);
  } catch (error) {
    console.error('Erreur vérification all:', error);
    res.status(500).json({
      allValid: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

export default router;
