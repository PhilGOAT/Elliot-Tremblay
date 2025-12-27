import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ScoreOCR({ streamId, onScoreDetected, player1Name, player2Name, twitchChannel, game }) {
  const [captureLoading, setCaptureLoading] = useState(false);
  const [detectedScores, setDetectedScores] = useState({ score1: 0, score2: 0 });
  const [originalDetected, setOriginalDetected] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [rawText, setRawText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showIncorrectForm, setShowIncorrectForm] = useState(false);
  const [incorrectNote, setIncorrectNote] = useState('');

  // Auto-capture
  const [autoCapture, setAutoCapture] = useState(false);
  const [nextCaptureIn, setNextCaptureIn] = useState(15);
  const [lastCaptureTime, setLastCaptureTime] = useState(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [lastConfidence, setLastConfidence] = useState(null);
  const [lastScore, setLastScore] = useState({ score1: null, score2: null });
  const [captureStatus, setCaptureStatus] = useState('idle');
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  // Status du stream Twitch
  const [twitchIsLive, setTwitchIsLive] = useState(null); // null = checking, true/false
  const [lastTwitchCheck, setLastTwitchCheck] = useState(null);
  const twitchCheckRef = useRef(null);

  const CAPTURE_INTERVAL = 15;
  const TWITCH_CHECK_INTERVAL = 30000; // Vérifier toutes les 30s

  // Vérifier si le stream Twitch est en ligne
  const checkTwitchStatus = async () => {
    if (!streamId) return;

    try {
      const response = await fetch(`${API_URL}/api/live-streams/${streamId}/twitch-status`);
      const data = await response.json();

      setTwitchIsLive(data.isLive);
      setLastTwitchCheck(new Date());

      // Auto-activer l'OCR si le stream vient de passer en ligne
      if (data.isLive && !autoCapture && twitchIsLive === false) {
        setAutoCapture(true);
      }
    } catch (err) {
      console.error('Erreur vérification Twitch:', err);
    }
  };

  // Vérifier le statut Twitch périodiquement
  useEffect(() => {
    if (twitchChannel) {
      // Vérification immédiate
      checkTwitchStatus();

      // Vérification périodique
      twitchCheckRef.current = setInterval(checkTwitchStatus, TWITCH_CHECK_INTERVAL);

      return () => {
        if (twitchCheckRef.current) clearInterval(twitchCheckRef.current);
      };
    }
  }, [twitchChannel, streamId]);

  // Capture automatique depuis Twitch
  const captureFromTwitch = async (isAuto = false) => {
    if (!twitchChannel) {
      setError('Aucun canal Twitch configuré');
      return;
    }

    setCaptureLoading(true);
    setCaptureStatus('capturing');
    setError(null);
    if (!isAuto) setFeedbackSent(false);

    try {
      const response = await fetch(`${API_URL}/api/live-streams/${streamId}/capture-twitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: twitchChannel,
          autoUpdate: isAuto
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
        setOriginalDetected(detected);
        setRawText(data.rawText || '');
        setLastCaptureTime(new Date());
        setCaptureCount(prev => prev + 1);
        setLastConfidence(data.confidence || 0.5);
        setLastScore({ score1: detected.score1, score2: detected.score2 });
        setCaptureStatus('success');
        setTwitchIsLive(true); // Le stream est en ligne si on peut capturer

        if (isAuto && data.confidence && data.confidence > 0.8) {
          if (onScoreDetected) {
            onScoreDetected(detected);
          }
        } else if (!isAuto) {
          setShowConfirm(true);
        } else if (data.confidence && data.confidence <= 0.8) {
          setShowConfirm(true);
          setAutoCapture(false);
        }

        setTimeout(() => setCaptureStatus('idle'), 2000);
      } else {
        setCaptureStatus('error');
        if (!isAuto) {
          throw new Error('Aucun score détecté');
        }
        setTimeout(() => setCaptureStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('Erreur capture Twitch:', err);
      setCaptureStatus('error');

      // Si erreur de capture, le stream est probablement hors ligne
      if (err.message.includes('hors ligne') || err.message.includes('timeout')) {
        setTwitchIsLive(false);
        if (autoCapture) {
          setAutoCapture(false); // Pause l'auto si le stream est hors ligne
        }
      }

      if (!isAuto) {
        setError(err.message);
      }
      setTimeout(() => setCaptureStatus('idle'), 2000);
    } finally {
      setCaptureLoading(false);
    }
  };

  // Gestion de l'auto-capture
  useEffect(() => {
    if (autoCapture && twitchChannel) {
      captureFromTwitch(true);

      countdownRef.current = setInterval(() => {
        setNextCaptureIn(prev => {
          if (prev <= 1) {
            return CAPTURE_INTERVAL;
          }
          return prev - 1;
        });
      }, 1000);

      intervalRef.current = setInterval(() => {
        captureFromTwitch(true);
        setNextCaptureIn(CAPTURE_INTERVAL);
      }, CAPTURE_INTERVAL * 1000);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setNextCaptureIn(CAPTURE_INTERVAL);
    }
  }, [autoCapture, twitchChannel]);

  const confirmScore = async () => {
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

    if (onScoreDetected) {
      onScoreDetected(detectedScores);
    }

    setTimeout(() => {
      setShowConfirm(false);
      setRawText('');
      setOriginalDetected(null);
      setFeedbackSent(false);
    }, 1500);
  };

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

  const hasCorrections = originalDetected && (
    originalDetected.score1 !== detectedScores.score1 ||
    originalDetected.score2 !== detectedScores.score2
  );

  const progressPercent = autoCapture ? ((CAPTURE_INTERVAL - nextCaptureIn) / CAPTURE_INTERVAL) * 100 : 0;

  const getConfidenceColor = (conf) => {
    if (conf >= 0.8) return 'bg-green-500';
    if (conf >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4">
      {/* Header avec statut Twitch */}
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-purple-400 text-sm">
          📺 OCR Twitch
        </h4>
        <div className="flex items-center gap-2">
          {/* Statut du stream Twitch */}
          {twitchChannel && (
            <div className="flex items-center gap-1">
              {twitchIsLive === null ? (
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" title="Vérification..." />
              ) : twitchIsLive ? (
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Stream en ligne" />
              ) : (
                <span className="w-2 h-2 bg-red-400 rounded-full" title="Stream hors ligne" />
              )}
              <span className="text-xs text-gray-500">@{twitchChannel}</span>
            </div>
          )}
          {captureStatus === 'capturing' && (
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          )}
        </div>
      </div>

      {/* Alerte si stream hors ligne */}
      {twitchIsLive === false && (
        <div className="mb-3 p-2 bg-red-900/30 border border-red-600/50 rounded-lg">
          <p className="text-xs text-red-300">
            ⚠️ Stream hors ligne! Le joueur doit lancer son stream Xbox → Twitch
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Xbox: Bouton Xbox → Capturer → Diffusion en direct → Twitch
          </p>
        </div>
      )}

      {/* Notification stream en ligne */}
      {twitchIsLive === true && !autoCapture && lastScore.score1 === null && (
        <div className="mb-3 p-2 bg-green-900/30 border border-green-600/50 rounded-lg">
          <p className="text-xs text-green-300">
            ✅ Stream détecté! Active l'OCR automatique pour lire les scores.
          </p>
        </div>
      )}

      {/* Mode Auto avec barre de progression */}
      <div className="mb-3 p-3 bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${autoCapture ? 'text-green-400' : 'text-gray-400'}`}>
              {autoCapture ? '🔄 OCR actif' : '⏸️ OCR inactif'}
            </span>
            {autoCapture && captureLoading && (
              <span className="text-xs text-yellow-400 animate-pulse">Lecture...</span>
            )}
          </div>
          <div
            onClick={() => setAutoCapture(!autoCapture)}
            className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
              autoCapture ? 'bg-green-600' : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                autoCapture ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </div>
        </div>

        {/* Barre de progression fluide */}
        {autoCapture && (
          <div className="space-y-2">
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Prochaine: {nextCaptureIn}s</span>
              <span>Total: {captureCount}</span>
            </div>
          </div>
        )}

        {/* Dernier score détecté */}
        {lastScore.score1 !== null && !showConfirm && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-mono font-bold text-green-400">
                  {lastScore.score1} - {lastScore.score2}
                </span>
                {lastConfidence && (
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${getConfidenceColor(lastConfidence)}`} />
                    <span className="text-xs text-gray-400">
                      {Math.round(lastConfidence * 100)}%
                    </span>
                  </div>
                )}
              </div>
              {lastCaptureTime && (
                <span className="text-xs text-gray-500">
                  {lastCaptureTime.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bouton capture manuelle */}
      {!showConfirm && !showIncorrectForm && (
        <div className="space-y-2">
          <button
            onClick={() => captureFromTwitch(false)}
            disabled={captureLoading || !twitchChannel}
            className={`w-full py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-all ${
              captureLoading
                ? 'bg-purple-800 text-purple-300'
                : !twitchChannel
                ? 'bg-gray-600 text-gray-400'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {captureLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                Capture...
              </>
            ) : !twitchChannel ? (
              <>❌ Pas de Twitch</>
            ) : (
              <>📸 Capturer</>
            )}
          </button>

          {error && (
            <div className={`${error.includes('Merci') ? 'bg-green-900/50 border-green-600' : 'bg-red-900/50 border-red-600'} border rounded p-2 text-xs`}>
              <p className={error.includes('Merci') ? 'text-green-300' : 'text-red-300'}>{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Formulaire incorrect */}
      {showIncorrectForm && (
        <div className="space-y-2">
          <textarea
            value={incorrectNote}
            onChange={(e) => setIncorrectNote(e.target.value)}
            placeholder="Qu'est-ce qui n'allait pas?"
            className="w-full bg-gray-800 rounded p-2 text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowIncorrectForm(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded text-sm"
            >
              Annuler
            </button>
            <button
              onClick={markAsIncorrect}
              className="flex-1 bg-red-600 hover:bg-red-500 py-2 rounded font-bold text-sm"
            >
              Envoyer
            </button>
          </div>
        </div>
      )}

      {/* Confirmation score */}
      {showConfirm && !showIncorrectForm && (
        <div className="space-y-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">
                Score détecté {hasCorrections && <span className="text-yellow-400">(modifié)</span>}
              </span>
              {lastConfidence && (
                <div className="flex items-center gap-1">
                  <div className={`h-1.5 w-12 bg-gray-700 rounded-full overflow-hidden`}>
                    <div
                      className={`h-full ${getConfidenceColor(lastConfidence)}`}
                      style={{ width: `${lastConfidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{Math.round(lastConfidence * 100)}%</span>
                </div>
              )}
            </div>

            <div className="flex justify-center items-center gap-3">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">{player1Name}</div>
                <input
                  type="number"
                  value={detectedScores.score1}
                  onChange={(e) => setDetectedScores({ ...detectedScores, score1: parseInt(e.target.value) || 0 })}
                  className="w-14 bg-gray-700 rounded p-1.5 text-center text-2xl font-bold"
                  min="0"
                  max="20"
                />
              </div>
              <span className="text-gray-600 text-xl">-</span>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">{player2Name}</div>
                <input
                  type="number"
                  value={detectedScores.score2}
                  onChange={(e) => setDetectedScores({ ...detectedScores, score2: parseInt(e.target.value) || 0 })}
                  className="w-14 bg-gray-700 rounded p-1.5 text-center text-2xl font-bold"
                  min="0"
                  max="20"
                />
              </div>
            </div>
          </div>

          {feedbackSent && (
            <div className="bg-green-900/50 border border-green-600 rounded p-2 text-center text-xs text-green-400">
              ✅ {hasCorrections ? 'Correction enregistrée!' : 'OK!'}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setShowIncorrectForm(true)}
              className="bg-red-900/50 hover:bg-red-900 border border-red-600 px-2 py-1.5 rounded text-sm"
              title="Incorrect"
            >
              ❌
            </button>
            <button
              onClick={() => {
                setShowConfirm(false);
                setRawText('');
                setOriginalDetected(null);
              }}
              className="flex-1 bg-gray-600 hover:bg-gray-500 py-1.5 rounded text-sm"
            >
              Annuler
            </button>
            <button
              onClick={confirmScore}
              disabled={feedbackSent}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 py-1.5 rounded font-bold text-sm"
            >
              {feedbackSent ? '✅' : '✅ OK'}
            </button>
          </div>

          {rawText && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Debug</summary>
              <pre className="mt-1 p-2 bg-gray-800 rounded text-xs overflow-auto max-h-16">
                {rawText}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
