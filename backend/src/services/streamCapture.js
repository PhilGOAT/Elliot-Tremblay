import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { spawn } from 'child_process';

/**
 * Service de capture et analyse de streams pour NHL
 * Détecte les scores, temps, événements en temps réel
 */

// Régions de l'écran NHL où chercher les données (en pourcentage)
const NHL_REGIONS = {
  // Score et temps - en haut centre de l'écran
  scoreboard: {
    left: 35,    // 35% depuis la gauche
    top: 2,      // 2% depuis le haut
    width: 30,   // 30% de largeur
    height: 8    // 8% de hauteur
  },
  // Écran de but - centre de l'écran
  goalScreen: {
    left: 25,
    top: 30,
    width: 50,
    height: 40
  },
  // Stats entre-périodes - plein écran
  statsScreen: {
    left: 10,
    top: 15,
    width: 80,
    height: 70
  }
};

// Patterns regex pour extraire les données
const PATTERNS = {
  // Score: "3 - 2", "3-2", "3  2"
  score: /(\d{1,2})\s*[-–—]\s*(\d{1,2})/,
  // Temps: "14:32", "5:00", "20:00"
  time: /(\d{1,2}):(\d{2})/,
  // Période: "1ST", "2ND", "3RD", "OT", "1RE", "2E", "3E"
  period: /(1ST|2ND|3RD|OT|SO|1RE|2E|3E|PROL|TB)/i,
  // Power play: "PP", "5 ON 4", "5ON4"
  powerPlay: /(PP|POWER\s*PLAY|5\s*ON\s*4|5ON4|4\s*ON\s*3)/i,
  // Tirs au but
  shots: /SHOTS?\s*[:=]?\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})/i,
  // Mises en jeu
  faceoffs: /FACEOFFS?\s*[:=]?\s*(\d{1,3})%?\s*[-–—]\s*(\d{1,3})%?/i
};

/**
 * Capture une frame depuis un stream Twitch
 */
export async function captureTwitchFrame(channelName) {
  console.log(`[Twitch] Capture depuis le channel: ${channelName}`);

  return new Promise((resolve, reject) => {
    // Utiliser streamlink pour obtenir le stream et ffmpeg pour capturer une frame
    const streamlink = spawn('streamlink', [
      `https://twitch.tv/${channelName}`,
      'best',
      '--stdout'
    ]);

    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-vframes', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-y',
      'pipe:1'
    ]);

    // Pipe streamlink vers ffmpeg
    streamlink.stdout.pipe(ffmpeg.stdin);

    const chunks = [];

    ffmpeg.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    let errorOutput = '';
    streamlink.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('close', (code) => {
      streamlink.kill();
      if (chunks.length > 0) {
        console.log('[Twitch] Frame capturée avec succès');
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`Pas de frame capturée. Streamlink output: ${errorOutput}`));
      }
    });

    ffmpeg.on('error', (err) => {
      streamlink.kill();
      reject(err);
    });

    streamlink.on('error', (err) => {
      ffmpeg.kill();
      reject(new Error(`Streamlink error: ${err.message}. Le stream est-il en ligne?`));
    });

    // Timeout après 15 secondes
    setTimeout(() => {
      streamlink.kill();
      ffmpeg.kill();
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error('Capture timeout - le stream est peut-être hors ligne'));
      }
    }, 15000);
  });
}

/**
 * Capture et analyse le score depuis un stream Twitch
 */
export async function analyzeFromTwitch(channelName) {
  try {
    console.log(`[OCR] Analyse du stream Twitch: ${channelName}`);

    // Capturer une frame
    const imageBuffer = await captureTwitchFrame(channelName);

    // Analyser l'image
    const gameState = await analyzeScreenshot(imageBuffer);

    return {
      success: true,
      ...gameState,
      channel: channelName,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[OCR] Erreur analyse Twitch:', error.message);
    return {
      success: false,
      error: error.message,
      channel: channelName
    };
  }
}

/**
 * Analyse une image de screenshot pour extraire les données du match
 */
export async function analyzeScreenshot(imageBuffer) {
  try {
    // Prétraiter l'image pour améliorer l'OCR
    const processedImage = await preprocessImage(imageBuffer);

    // OCR sur l'image entière
    const result = await Tesseract.recognize(processedImage, 'eng', {
      tessedit_pageseg_mode: 6, // Assume uniform text block
      tessedit_char_whitelist: '0123456789:-STDNROPWLAYFCEIHK ',
    });

    const text = result.data.text;
    console.log('[OCR] Texte détecté:', text);

    // Extraire les données
    const gameState = parseGameState(text);

    return gameState;
  } catch (error) {
    console.error('[OCR] Erreur analyse screenshot:', error);
    return null;
  }
}

/**
 * Prétraite l'image pour améliorer la précision OCR
 */
async function preprocessImage(imageBuffer) {
  try {
    // Convertir en niveaux de gris, augmenter le contraste
    const processed = await sharp(imageBuffer)
      .grayscale()
      .normalize() // Améliore le contraste
      .sharpen()   // Rend le texte plus net
      .threshold(128) // Noir et blanc
      .toBuffer();

    return processed;
  } catch (error) {
    console.error('[Preprocess] Erreur:', error);
    return imageBuffer;
  }
}

/**
 * Analyse le texte OCR pour extraire l'état du match
 */
function parseGameState(text) {
  const state = {
    score1: null,
    score2: null,
    time: null,
    period: null,
    powerPlay: false,
    screenType: 'GAMEPLAY', // GAMEPLAY, GOAL, INTERMISSION, STATS
    shots1: null,
    shots2: null,
    rawText: text
  };

  // Détecter le score
  const scoreMatch = text.match(PATTERNS.score);
  if (scoreMatch) {
    state.score1 = parseInt(scoreMatch[1]);
    state.score2 = parseInt(scoreMatch[2]);
  }

  // Détecter le temps
  const timeMatch = text.match(PATTERNS.time);
  if (timeMatch) {
    state.time = `${timeMatch[1]}:${timeMatch[2]}`;
  }

  // Détecter la période
  const periodMatch = text.match(PATTERNS.period);
  if (periodMatch) {
    const periodStr = periodMatch[1].toUpperCase();
    if (periodStr === '1ST' || periodStr === '1RE') state.period = 1;
    else if (periodStr === '2ND' || periodStr === '2E') state.period = 2;
    else if (periodStr === '3RD' || periodStr === '3E') state.period = 3;
    else if (periodStr === 'OT' || periodStr === 'PROL') state.period = 4;
    else if (periodStr === 'SO' || periodStr === 'TB') state.period = 5;
  }

  // Détecter power play
  state.powerPlay = PATTERNS.powerPlay.test(text);

  // Détecter les tirs (stats écran)
  const shotsMatch = text.match(PATTERNS.shots);
  if (shotsMatch) {
    state.shots1 = parseInt(shotsMatch[1]);
    state.shots2 = parseInt(shotsMatch[2]);
    state.screenType = 'STATS';
  }

  // Détecter si c'est un écran de but
  if (text.includes('GOAL') || text.includes('BUT') || text.includes('SCORED')) {
    state.screenType = 'GOAL';
  }

  // Détecter entre-périodes
  if (text.includes('INTERMISSION') || text.includes('ENTRACTE') ||
      text.includes('END OF') || text.includes('FIN DE')) {
    state.screenType = 'INTERMISSION';
  }

  return state;
}

/**
 * Analyse une région spécifique de l'image
 */
export async function analyzeRegion(imageBuffer, region) {
  try {
    // Obtenir les dimensions de l'image
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    // Calculer les coordonnées de la région
    const left = Math.round((region.left / 100) * width);
    const top = Math.round((region.top / 100) * height);
    const regionWidth = Math.round((region.width / 100) * width);
    const regionHeight = Math.round((region.height / 100) * height);

    // Extraire la région
    const croppedImage = await sharp(imageBuffer)
      .extract({ left, top, width: regionWidth, height: regionHeight })
      .toBuffer();

    return analyzeScreenshot(croppedImage);
  } catch (error) {
    console.error('[Region] Erreur extraction région:', error);
    return null;
  }
}

/**
 * Analyse spécifique du scoreboard NHL
 */
export async function analyzeScoreboard(imageBuffer) {
  return analyzeRegion(imageBuffer, NHL_REGIONS.scoreboard);
}

/**
 * Détecte le type d'écran actuel
 */
export async function detectScreenType(imageBuffer) {
  const state = await analyzeScreenshot(imageBuffer);
  return state?.screenType || 'UNKNOWN';
}

/**
 * Compare deux états pour détecter un changement de score (but)
 */
export function detectGoal(previousState, currentState) {
  if (!previousState || !currentState) return null;

  const prev1 = previousState.score1 ?? 0;
  const prev2 = previousState.score2 ?? 0;
  const curr1 = currentState.score1 ?? 0;
  const curr2 = currentState.score2 ?? 0;

  if (curr1 > prev1) {
    return {
      team: 1,
      newScore1: curr1,
      newScore2: curr2,
      time: currentState.time,
      period: currentState.period
    };
  }

  if (curr2 > prev2) {
    return {
      team: 2,
      newScore1: curr1,
      newScore2: curr2,
      time: currentState.time,
      period: currentState.period
    };
  }

  return null;
}

/**
 * Génère un screenshot depuis un URL de stream (requiert FFmpeg)
 */
export async function captureStreamFrame(streamUrl) {
  // Cette fonction nécessite FFmpeg installé sur le serveur
  // Pour Twitch/YouTube, on utilise youtube-dl ou streamlink

  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    // Utiliser FFmpeg pour capturer une frame
    const ffmpeg = spawn('ffmpeg', [
      '-i', streamUrl,
      '-vframes', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-'
    ]);

    const chunks = [];

    ffmpeg.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);

    // Timeout après 10 secondes
    setTimeout(() => {
      ffmpeg.kill();
      reject(new Error('Capture timeout'));
    }, 10000);
  });
}

export default {
  analyzeScreenshot,
  analyzeScoreboard,
  detectScreenType,
  detectGoal,
  captureStreamFrame,
  captureTwitchFrame,
  analyzeFromTwitch,
  NHL_REGIONS,
  PATTERNS
};
