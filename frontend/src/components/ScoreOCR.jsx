import { useState, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ScoreOCR({ streamId, onScoreDetected, player1Name, player2Name, twitchChannel }) {
  const [loading, setLoading] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [detectedScores, setDetectedScores] = useState({ score1: 0, score2: 0 });
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [rawText, setRawText] = useState('');

  // Capture automatique depuis Twitch
  const captureFromTwitch = async () => {
    setCaptureLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/live-streams/${streamId}/capture-twitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: twitchChannel,
          autoUpdate: false // On veut d'abord voir le résultat
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur de capture');
      }

      if (data.success) {
        setDetectedScores({
          score1: data.detected.score1 ?? 0,
          score2: data.detected.score2 ?? 0
        });
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

  // Confirmer et mettre à jour le score
  const confirmScore = () => {
    if (onScoreDetected) {
      onScoreDetected(detectedScores);
    }
    setShowConfirm(false);
    setRawText('');
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4">
      <h4 className="font-bold text-purple-400 mb-3">
        📺 Lire le score depuis Twitch
      </h4>

      {/* Bouton capture automatique */}
      {!showConfirm && (
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
            Le système va capturer une image du stream et lire le score automatiquement
          </p>

          {error && (
            <div className="bg-red-900/50 border border-red-600 rounded-lg p-3 text-sm">
              <p className="text-red-400 font-bold">Erreur:</p>
              <p className="text-red-300">{error}</p>
              <p className="text-xs text-gray-400 mt-2">
                Vérifie que le stream est en ligne. Si le problème persiste,
                utilise la mise à jour manuelle.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Résultat et confirmation */}
      {showConfirm && (
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
            <p className="text-sm text-gray-400 text-center mb-2">Score détecté:</p>
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
              Corrige si nécessaire avant de confirmer
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowConfirm(false);
                setRawText('');
              }}
              className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded-lg"
            >
              Annuler
            </button>
            <button
              onClick={confirmScore}
              className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded-lg font-bold"
            >
              ✅ Confirmer le score
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
