import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Service d'apprentissage OCR (RAG simplifié)
 * Apprend des corrections utilisateurs pour améliorer la détection
 */

/**
 * Enregistre une correction OCR pour l'apprentissage
 */
export async function recordCorrection({
  streamId,
  game,
  rawText,
  detected,
  corrected,
  twitchChannel,
  imageHash,
  processingTime
}) {
  // Déterminer si l'OCR était correct
  const wasCorrect =
    detected.score1 === corrected.score1 &&
    detected.score2 === corrected.score2;

  const wasIncorrect = !wasCorrect;

  // Sauvegarder la correction
  const correction = await prisma.ocrCorrection.create({
    data: {
      streamId,
      game: game || 'NHL',
      rawText: rawText || '',
      detectedScore1: detected.score1,
      detectedScore2: detected.score2,
      detectedPeriod: detected.period,
      detectedTime: detected.time,
      correctedScore1: corrected.score1,
      correctedScore2: corrected.score2,
      correctedPeriod: corrected.period,
      correctedTime: corrected.time,
      wasCorrect,
      wasIncorrect,
      twitchChannel,
      imageHash,
      processingTime
    }
  });

  // Mettre à jour les patterns appris
  if (rawText) {
    await updateLearnedPatterns(game || 'NHL', rawText, corrected, wasCorrect);
  }

  console.log(`[OCR Learning] Correction enregistrée: ${wasCorrect ? 'CORRECT' : 'CORRIGÉ'}`);

  return correction;
}

/**
 * Met à jour les patterns appris basé sur les corrections
 */
async function updateLearnedPatterns(game, rawText, corrected, wasCorrect) {
  // Extraire les patterns du texte brut
  const scorePattern = rawText.match(/(\d{1,2})\s*[-–—:]\s*(\d{1,2})/);
  const timePattern = rawText.match(/(\d{1,2}):(\d{2})/);

  if (scorePattern) {
    const pattern = scorePattern[0];
    const normalizedValue = `${corrected.score1}-${corrected.score2}`;

    await upsertPattern(game, 'score', pattern, normalizedValue, wasCorrect);
  }

  if (timePattern && corrected.time) {
    const pattern = timePattern[0];
    await upsertPattern(game, 'time', pattern, corrected.time, wasCorrect);
  }
}

/**
 * Met à jour ou crée un pattern appris
 */
async function upsertPattern(game, patternType, rawPattern, normalizedValue, wasCorrect) {
  try {
    const existing = await prisma.ocrPattern.findUnique({
      where: {
        game_patternType_rawPattern: {
          game,
          patternType,
          rawPattern
        }
      }
    });

    if (existing) {
      // Mettre à jour les stats
      const newSuccessCount = existing.successCount + (wasCorrect ? 1 : 0);
      const newFailureCount = existing.failureCount + (wasCorrect ? 0 : 1);
      const newConfidence = newSuccessCount / (newSuccessCount + newFailureCount);

      await prisma.ocrPattern.update({
        where: { id: existing.id },
        data: {
          successCount: newSuccessCount,
          failureCount: newFailureCount,
          confidence: newConfidence,
          normalizedValue: wasCorrect ? normalizedValue : existing.normalizedValue
        }
      });
    } else {
      // Créer un nouveau pattern
      await prisma.ocrPattern.create({
        data: {
          game,
          patternType,
          rawPattern,
          normalizedValue,
          successCount: wasCorrect ? 1 : 0,
          failureCount: wasCorrect ? 0 : 1,
          confidence: wasCorrect ? 1.0 : 0.0
        }
      });
    }
  } catch (error) {
    console.error('[OCR Learning] Erreur upsert pattern:', error);
  }
}

/**
 * Améliore les résultats OCR basé sur les patterns appris
 */
export async function enhanceOcrResults(game, rawText, detected) {
  // Chercher des patterns similaires dans la base
  const patterns = await prisma.ocrPattern.findMany({
    where: {
      game,
      confidence: { gte: 0.7 } // Seulement les patterns avec haute confiance
    },
    orderBy: { confidence: 'desc' }
  });

  let enhanced = { ...detected };
  let confidenceBoost = 0;

  for (const pattern of patterns) {
    if (rawText.includes(pattern.rawPattern)) {
      if (pattern.patternType === 'score') {
        // Parser le score normalisé
        const [score1, score2] = pattern.normalizedValue.split('-').map(Number);
        if (!isNaN(score1) && !isNaN(score2)) {
          enhanced.score1 = score1;
          enhanced.score2 = score2;
          confidenceBoost += pattern.confidence * 0.2;
        }
      } else if (pattern.patternType === 'time') {
        enhanced.time = pattern.normalizedValue;
        confidenceBoost += pattern.confidence * 0.1;
      }
    }
  }

  enhanced.confidence = Math.min(1.0, (detected.confidence || 0.5) + confidenceBoost);
  enhanced.enhancedByLearning = confidenceBoost > 0;

  return enhanced;
}

/**
 * Marque un résultat OCR comme erroné (sans correction)
 */
export async function markAsIncorrect({
  streamId,
  game,
  rawText,
  detected,
  feedbackNote,
  twitchChannel
}) {
  const correction = await prisma.ocrCorrection.create({
    data: {
      streamId,
      game: game || 'NHL',
      rawText: rawText || '',
      detectedScore1: detected.score1,
      detectedScore2: detected.score2,
      detectedPeriod: detected.period,
      detectedTime: detected.time,
      wasCorrect: false,
      wasIncorrect: true,
      feedbackNote,
      twitchChannel
    }
  });

  // Décrémenter la confiance des patterns associés
  if (rawText) {
    const scorePattern = rawText.match(/(\d{1,2})\s*[-–—:]\s*(\d{1,2})/);
    if (scorePattern) {
      await decrementPatternConfidence(game || 'NHL', 'score', scorePattern[0]);
    }
  }

  console.log(`[OCR Learning] Marqué comme incorrect: ${feedbackNote || 'pas de note'}`);

  return correction;
}

/**
 * Décrémente la confiance d'un pattern
 */
async function decrementPatternConfidence(game, patternType, rawPattern) {
  try {
    const existing = await prisma.ocrPattern.findUnique({
      where: {
        game_patternType_rawPattern: {
          game,
          patternType,
          rawPattern
        }
      }
    });

    if (existing) {
      const newFailureCount = existing.failureCount + 1;
      const newConfidence = existing.successCount / (existing.successCount + newFailureCount);

      await prisma.ocrPattern.update({
        where: { id: existing.id },
        data: {
          failureCount: newFailureCount,
          confidence: newConfidence
        }
      });
    }
  } catch (error) {
    console.error('[OCR Learning] Erreur décrémentation confiance:', error);
  }
}

/**
 * Obtient les statistiques d'apprentissage
 */
export async function getLearningStats(game) {
  const totalCorrections = await prisma.ocrCorrection.count({
    where: game ? { game } : undefined
  });

  const correctCount = await prisma.ocrCorrection.count({
    where: {
      ...(game ? { game } : {}),
      wasCorrect: true
    }
  });

  const incorrectCount = await prisma.ocrCorrection.count({
    where: {
      ...(game ? { game } : {}),
      wasIncorrect: true
    }
  });

  const patterns = await prisma.ocrPattern.findMany({
    where: game ? { game } : undefined,
    orderBy: { confidence: 'desc' },
    take: 10
  });

  const accuracy = totalCorrections > 0
    ? (correctCount / totalCorrections) * 100
    : 0;

  return {
    totalCorrections,
    correctCount,
    incorrectCount,
    accuracy: Math.round(accuracy * 10) / 10,
    topPatterns: patterns.map(p => ({
      type: p.patternType,
      pattern: p.rawPattern,
      value: p.normalizedValue,
      confidence: Math.round(p.confidence * 100)
    }))
  };
}

/**
 * Génère un hash d'image pour le matching
 */
export function generateImageHash(imageBuffer) {
  return crypto.createHash('md5').update(imageBuffer).digest('hex');
}

export default {
  recordCorrection,
  enhanceOcrResults,
  markAsIncorrect,
  getLearningStats,
  generateImageHash
};
