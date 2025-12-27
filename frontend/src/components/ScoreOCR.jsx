import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ScoreOCR({ streamId, onScoreDetected, player1Name, player2Name, twitchChannel, game }) {
  const [captureLoading, setCaptureLoading] = useState(false);
  const [detectedScores, setDetectedScores] = useState({ score1: 0, score2: 0 });
  const [originalDetected, setOriginalDetected] = useState(null); // Pour comparer avec correction
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [rawText, setRawText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showIncorrectForm, setShowIncorrectForm] = useState(false);
  const [incorrectNote, setIncorrectNote] = useState('');

  // Capture automatique depuis Twitch
  const captureFromTwitch = async () => {
    setCaptureLoading(true);
    setError(null);
    setFeedbackSent(false);

    try {
      const response = await fetch(`${API_URL}/api/live-streams/${streamId}/capture-twitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: twitchChannel,
          autoUpdate: false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur de capture');
      }

      if (data.success) {
        const detected = {
          score1: data.detected.score1 ?? 0,
          score2: data.detected.score2 ?? 0,
          period: data.detected.period,
          time: data.detected.time
        };
        setDetectedScores(detected);
        setOriginalDetected(detected); // Sauvegarder l'original pour comparaison
        setRawText(data.rawText || '');
        setShowConfirm(true);
      } else {
        throw new Error('Aucun score détecté');
      }
    } catch (err) {
      console.error('Erreur capture Twitch:', err);
      setError(err.message);
    } finally {
      setCaptureLoading(false);
    }
  };

  // Confirmer et mettre à jour le score + envoyer feedback
  const confirmScore = async () => {
    // Envoyer le feedback d'apprentissage
    try {
      await fetch(`${API_URL}/api/live-streams/${streamId}/ocr-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detected: originalDetected,
          corrected: detectedScores,
          rawText,
          twitchChannel,
          game
        })
      });
      setFeedbackSent(true);
    } catch (err) {
      console.error('Erreur envoi feedback:', err);
    }

    // Appeler le callback parent
    if (onScoreDetected) {
      onScoreDetected(detectedScores);
    }

    // Reset
    setTimeout(() => {
      setShowConfirm(false);
      setRawText('');
      setOriginalDetected(null);
      setFeedbackSent(false);
    }, 1500);
  };

  // Marquer comme incorrect
  const markAsIncorrect = async () => {
    try {
      await fetch(`${API_URL}/api/live-streams/${streamId}/ocr-incorrect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detected: originalDetected,
          rawText,
          feedbackNote: incorrectNote,
          twitchChannel,
          game
        })
      });

      setShowIncorrectForm(false);
      setIncorrectNote('');
      setShowConfirm(false);
      setError('Merci! Le système va apprendre de cette erreur.');

      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error('Erreur marquage incorrect:', err);
    }
  };

  // Vérifier si l'utilisateur a fait des corrections
  const hasCorrections = originalDetected && (
    originalDetected.score1 !== detectedScores.score1 ||
    originalDetected.score2 !== detectedScores.score2
  );

  return (
    <div className="bg-gray-700 rounded-lg p-4">
      <h4 className="font-bold text-purple-400 mb-3">
        📺 Lire le score depuis Twitch
      </h4>

      {/* Bouton capture automatique */}
      {!showConfirm && !showIncorrectForm && (
        <div className="space-y-3">
          <button
            onClick={captureFromTwitch}
            disabled={captureLoading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-3 rounded-lg font-bold flex items-center justify-center gap-2"
          >
            {captureLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                Capture en cours...
              </>
            ) : (
              <>
                📸 Capturer le score depuis Twitch
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Le système apprend de tes corrections pour s'améliorer!
          </p>

          {error && (
            <div className={`${error.includes('Merci') ? 'bg-green-900/50 border-green-600' : 'bg-red-900/50 border-red-600'} border rounded-lg p-3 text-sm`}>
              <p className={error.includes('Merci') ? 'text-green-300' : 'text-red-300'}>{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Formulaire "marquer comme incorrect" */}
      {showIncorrectForm && (
        <div className="space-y-3">
          <p className="text-sm text-gray-300">Qu'est-ce qui n'allait pas?</p>
          <textarea
            value={incorrectNote}
            onChange={(e) => setIncorrectNote(e.target.value)}
            placeholder="Ex: Le score n'était pas visible, mauvaise détection..."
            className="w-full bg-gray-800 rounded-lg p-3 text-sm"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowIncorrectForm(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded-lg"
            >
              Annuler
            </button>
            <button
              onClick={markAsIncorrect}
              className="flex-1 bg-red-600 hover:bg-red-500 py-2 rounded-lg font-bold"
            >
              Envoyer
            </button>
          </div>
        </div>
      )}

      {/* Résultat et confirmation */}
      {showConfirm && !showIncorrectForm && (
        <div className="space-y-3">
          {/* Texte détecté (debug) */}
          {rawText && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Texte détecté (debug)</summary>
              <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-auto max-h-20">
                {rawText}
              </pre>
            </details>
          )}

          {/* Score détecté */}
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400 text-center mb-2">
              Score détecté {hasCorrections && <span className="text-yellow-400">(modifié)</span>}:
            </p>
            <div className="flex justify-center items-center gap-4 text-2xl font-bold">
              <div className="text-center">
                <div className="text-sm text-gray-400">{player1Name}</div>
                <input
                  type="number"
                  value={detectedScores.score1}
                  onChange={(e) => setDetectedScores({ ...detectedScores, score1: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-gray-700 rounded p-2 text-center text-3xl"
                  min="0"
                  max="20"
                />
              </div>
              <span className="text-gray-500">-</span>
              <div className="text-center">
                <div className="text-sm text-gray-400">{player2Name}</div>
                <input
                  type="number"
                  value={detectedScores.score2}
                  onChange={(e) => setDetectedScores({ ...detectedScores, score2: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-gray-700 rounded p-2 text-center text-3xl"
                  min="0"
                  max="20"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              {hasCorrections
                ? '🧠 Ta correction va aider le système à apprendre!'
                : 'Corrige si nécessaire avant de confirmer'
              }
            </p>
          </div>

          {/* Feedback envoyé */}
          {feedbackSent && (
            <div className="bg-green-900/50 border border-green-600 rounded-lg p-2 text-center text-sm text-green-400">
              ✅ {hasCorrections ? 'Correction enregistrée!' : 'Apprentissage enregistré!'}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setShowIncorrectForm(true)}
              className="bg-red-900/50 hover:bg-red-900 border border-red-600 px-3 py-2 rounded-lg text-sm"
              title="Marquer comme totalement incorrect"
            >
              ❌
            </button>
            <button
              onClick={() => {
                setShowConfirm(false);
                setRawText('');
                setOriginalDetected(null);
              }}
              className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded-lg"
            >
              Annuler
            </button>
            <button
              onClick={confirmScore}
              disabled={feedbackSent}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 py-2 rounded-lg font-bold"
            >
              {feedbackSent ? '✅ OK!' : '✅ Confirmer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
