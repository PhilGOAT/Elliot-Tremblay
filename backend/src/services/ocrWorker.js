import { PrismaClient } from '@prisma/client';
import { analyzeFromTwitch, detectGoal } from './streamCapture.js';
import { enhanceOcrResults } from './ocrLearning.js';

const prisma = new PrismaClient();

// Configuration
const OCR_INTERVAL = 30000; // 30 secondes entre chaque scan
const MAX_CONCURRENT_SCANS = 3; // Maximum de streams à scanner en parallèle
let isRunning = false;
let intervalId = null;

/**
 * Service de monitoring OCR en arrière-plan
 * Scanne automatiquement tous les streams Twitch actifs
 */

/**
 * Vérifie si un stream Twitch est en ligne via l'API
 */
async function checkTwitchLive(username) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('[OCR Worker] Pas de credentials Twitch configurés');
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
    console.error('[OCR Worker] Erreur vérification Twitch:', error);
    return false;
  }
}

/**
 * Met à jour la liste des streams actifs
 */
async function updateActiveStreams() {
  console.log('[OCR Worker] Mise à jour des streams actifs...');

  // Récupérer tous les utilisateurs avec un compte Twitch
  const usersWithTwitch = await prisma.user.findMany({
    where: {
      twitchUsername: { not: null }
    },
    select: {
      id: true,
      username: true,
      twitchUsername: true
    }
  });

  console.log(`[OCR Worker] ${usersWithTwitch.length} utilisateurs avec Twitch trouvés`);

  // Vérifier lesquels sont en ligne
  for (const user of usersWithTwitch) {
    try {
      const isLive = await checkTwitchLive(user.twitchUsername);

      if (isLive) {
        // Créer ou mettre à jour le stream actif
        await prisma.activeStream.upsert({
          where: { twitchChannel: user.twitchUsername },
          create: {
            userId: user.id,
            twitchChannel: user.twitchUsername,
            isLive: true
          },
          update: {
            isLive: true
          }
        });
        console.log(`[OCR Worker] ✓ ${user.twitchUsername} est EN LIGNE`);
      } else {
        // Marquer comme hors ligne
        const existing = await prisma.activeStream.findUnique({
          where: { twitchChannel: user.twitchUsername }
        });

        if (existing && existing.isLive) {
          await prisma.activeStream.update({
            where: { id: existing.id },
            data: {
              isLive: false,
              endedAt: new Date()
            }
          });
          console.log(`[OCR Worker] ✗ ${user.twitchUsername} est HORS LIGNE`);
        }
      }
    } catch (error) {
      console.error(`[OCR Worker] Erreur pour ${user.twitchUsername}:`, error.message);
    }
  }
}

/**
 * Analyse un stream avec OCR
 */
async function analyzeStream(activeStream) {
  console.log(`[OCR Worker] Analyse OCR de ${activeStream.twitchChannel}...`);

  try {
    // Capturer et analyser avec OCR
    const result = await analyzeFromTwitch(activeStream.twitchChannel);

    if (!result.success) {
      // Mettre à jour avec l'erreur
      await prisma.activeStream.update({
        where: { id: activeStream.id },
        data: {
          ocrError: result.error,
          lastOcrAt: new Date()
        }
      });
      console.log(`[OCR Worker] Erreur OCR ${activeStream.twitchChannel}: ${result.error}`);
      return null;
    }

    // Améliorer avec l'apprentissage
    const enhanced = await enhanceOcrResults('NHL', result.rawText || '', result);

    // Sauvegarder les scores précédents pour détecter les buts
    const previousState = {
      score1: activeStream.detectedScore1,
      score2: activeStream.detectedScore2
    };

    // Mettre à jour le stream actif
    await prisma.activeStream.update({
      where: { id: activeStream.id },
      data: {
        previousScore1: activeStream.detectedScore1,
        previousScore2: activeStream.detectedScore2,
        detectedScore1: enhanced.score1,
        detectedScore2: enhanced.score2,
        detectedPeriod: enhanced.period,
        detectedTime: enhanced.time,
        powerPlay: enhanced.powerPlay || false,
        screenType: enhanced.screenType,
        confidence: enhanced.confidence,
        ocrError: null,
        lastOcrAt: new Date()
      }
    });

    // Détecter si un but a été marqué
    const goal = detectGoal(previousState, enhanced);
    if (goal) {
      console.log(`[OCR Worker] 🚨 BUT DÉTECTÉ sur ${activeStream.twitchChannel}!`);
      console.log(`[OCR Worker] Nouveau score: ${goal.newScore1} - ${goal.newScore2}`);
    }

    console.log(`[OCR Worker] ✓ ${activeStream.twitchChannel}: ${enhanced.score1 ?? '?'}-${enhanced.score2 ?? '?'} (P${enhanced.period || '?'} ${enhanced.time || '??:??'})`);

    return enhanced;
  } catch (error) {
    console.error(`[OCR Worker] Erreur analyse ${activeStream.twitchChannel}:`, error.message);

    await prisma.activeStream.update({
      where: { id: activeStream.id },
      data: {
        ocrError: error.message,
        lastOcrAt: new Date()
      }
    });

    return null;
  }
}

/**
 * Scanne tous les streams actifs
 */
async function scanActiveStreams() {
  console.log('[OCR Worker] Scan des streams actifs...');

  // Récupérer tous les streams actifs
  const activeStreams = await prisma.activeStream.findMany({
    where: { isLive: true }
  });

  if (activeStreams.length === 0) {
    console.log('[OCR Worker] Aucun stream actif à scanner');
    return;
  }

  console.log(`[OCR Worker] ${activeStreams.length} stream(s) actif(s) à analyser`);

  // Analyser chaque stream (avec limite de concurrence)
  const chunks = [];
  for (let i = 0; i < activeStreams.length; i += MAX_CONCURRENT_SCANS) {
    chunks.push(activeStreams.slice(i, i + MAX_CONCURRENT_SCANS));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(stream => analyzeStream(stream)));
  }

  console.log('[OCR Worker] Scan terminé');
}

/**
 * Boucle principale du worker
 */
async function runWorkerCycle() {
  if (!isRunning) return;

  try {
    // D'abord, mettre à jour la liste des streams en ligne
    await updateActiveStreams();

    // Ensuite, analyser les streams actifs avec OCR
    await scanActiveStreams();
  } catch (error) {
    console.error('[OCR Worker] Erreur cycle:', error);
  }
}

/**
 * Démarre le worker OCR
 */
export function startOcrWorker() {
  if (isRunning) {
    console.log('[OCR Worker] Déjà en cours d\'exécution');
    return;
  }

  isRunning = true;
  console.log('[OCR Worker] 🚀 Démarrage du worker OCR');
  console.log(`[OCR Worker] Intervalle: ${OCR_INTERVAL / 1000}s`);

  // Premier cycle immédiat
  runWorkerCycle();

  // Puis toutes les X secondes
  intervalId = setInterval(runWorkerCycle, OCR_INTERVAL);
}

/**
 * Arrête le worker OCR
 */
export function stopOcrWorker() {
  if (!isRunning) {
    console.log('[OCR Worker] Pas en cours d\'exécution');
    return;
  }

  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log('[OCR Worker] ⏹️ Worker OCR arrêté');
}

/**
 * Retourne le statut du worker
 */
export function getWorkerStatus() {
  return {
    isRunning,
    interval: OCR_INTERVAL
  };
}

/**
 * Force un scan immédiat
 */
export async function forceScan() {
  console.log('[OCR Worker] 🔄 Scan forcé demandé');
  await runWorkerCycle();
}

export default {
  startOcrWorker,
  stopOcrWorker,
  getWorkerStatus,
  forceScan
};
