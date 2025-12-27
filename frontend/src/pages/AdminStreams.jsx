import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function AdminStreams() {
  const { user } = useAuth();
  const [streams, setStreams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('streams'); // streams, users, ocr

  // États OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [twitchChannel, setTwitchChannel] = useState('');
  const [ocrStats, setOcrStats] = useState(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctedScore, setCorrectedScore] = useState({ score1: '', score2: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user?.isAdmin) {
      fetchStreams();
      fetchUsers();
    }
  }, [user]);

  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    if (user?.isAdmin) {
      const interval = setInterval(fetchStreams, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchStreams = async () => {
    try {
      const res = await api.get('/admin/streams');
      setStreams(res.data.streams || []);
    } catch (error) {
      console.error('Erreur chargement streams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setAllUsers(res.data);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const fetchOcrStats = async () => {
    try {
      const res = await api.get('/admin/ocr/stats');
      setOcrStats(res.data);
    } catch (error) {
      console.error('Erreur chargement stats OCR:', error);
    }
  };

  // Analyser un stream Twitch
  const analyzeTwitchStream = async () => {
    if (!twitchChannel.trim()) {
      toast.error('Entrez un nom de channel Twitch');
      return;
    }

    setOcrLoading(true);
    setOcrResult(null);
    setCorrectionMode(false);

    try {
      const res = await api.post('/admin/ocr/analyze-twitch', {
        channelName: twitchChannel.trim()
      });

      setOcrResult(res.data);
      if (res.data.success) {
        toast.success('Stream analysé avec succès');
      } else {
        toast.error(res.data.error || 'Erreur analyse');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur analyse stream');
      setOcrResult({ success: false, error: error.message });
    } finally {
      setOcrLoading(false);
    }
  };

  // Analyser une image uploadée
  const analyzeImage = async (file) => {
    if (!file) return;

    setOcrLoading(true);
    setOcrResult(null);
    setCorrectionMode(false);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.post('/admin/ocr/analyze-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setOcrResult(res.data);
      if (res.data.success) {
        toast.success('Image analysée avec succès');
      } else {
        toast.error(res.data.error || 'Erreur analyse');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur analyse image');
      setOcrResult({ success: false, error: error.message });
    } finally {
      setOcrLoading(false);
    }
  };

  // Soumettre une correction
  const submitCorrection = async () => {
    if (!ocrResult) return;

    try {
      await api.post('/admin/ocr/correct', {
        detected: {
          score1: ocrResult.score1,
          score2: ocrResult.score2,
          period: ocrResult.period,
          time: ocrResult.time
        },
        corrected: {
          score1: parseInt(correctedScore.score1) || ocrResult.score1,
          score2: parseInt(correctedScore.score2) || ocrResult.score2,
          period: ocrResult.period,
          time: ocrResult.time
        },
        rawText: ocrResult.rawText,
        twitchChannel: twitchChannel || null
      });

      toast.success('Correction enregistrée - merci!');
      setCorrectionMode(false);
      fetchOcrStats(); // Rafraîchir les stats
    } catch (error) {
      toast.error('Erreur enregistrement correction');
    }
  };

  const toggleAdmin = async (userId, currentStatus) => {
    try {
      await api.patch(`/admin/users/${userId}`, {
        isAdmin: !currentStatus
      });
      toast.success('Statut admin modifié');
      fetchUsers();
    } catch (error) {
      toast.error('Erreur modification');
    }
  };

  // Rediriger si pas admin
  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!user.isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-gray-400 text-xl">Accès réservé aux administrateurs</p>
        <Link to="/" className="btn-primary mt-4 inline-block">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">🛡️ Admin</h1>
        <span className="text-sm text-gray-400">
          Refresh automatique toutes les 30s
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('streams')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'streams'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📺 Streams en direct ({streams.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'users'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          👥 Utilisateurs ({allUsers.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('ocr');
            fetchOcrStats();
          }}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'ocr'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🔍 Détection Score (OCR)
        </button>
      </div>

      {/* Tab: Streams */}
      {activeTab === 'streams' && (
        <div>
          {loading ? (
            <div className="text-center py-8 text-gray-400">Chargement...</div>
          ) : streams.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-xl">
              <p className="text-4xl mb-4">📺</p>
              <p className="text-gray-400 mb-2">Aucun stream en direct</p>
              <p className="text-sm text-gray-500">
                Les streams Twitch des utilisateurs apparaîtront ici
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {streams.map((stream) => (
                <div
                  key={stream.id}
                  className="bg-gray-800 rounded-xl p-4 flex items-center justify-between border-l-4 border-purple-500"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-2xl overflow-hidden">
                        {stream.xboxAvatar ? (
                          <img src={stream.xboxAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          '👤'
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-gray-800 animate-pulse"></div>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{stream.username}</h3>
                      <div className="text-sm text-gray-400 space-x-3">
                        {stream.xboxGamertag && (
                          <span>🎮 {stream.xboxGamertag}</span>
                        )}
                        <span className="text-purple-400">📺 {stream.twitchUsername}</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href={stream.twitchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition"
                  >
                    📺 Regarder
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Users */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {allUsers.map((u) => (
            <div
              key={u.id}
              className={`bg-gray-800 rounded-xl p-4 flex items-center justify-between ${
                u.isAdmin ? 'border-l-4 border-yellow-500' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{u.username}</h3>
                  {u.isAdmin && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400">{u.email}</p>
                <div className="text-xs text-gray-500 mt-1">
                  {u.xboxGamertag && <span className="mr-2">🎮 {u.xboxGamertag}</span>}
                  {u.twitchUsername && <span className="text-purple-400">📺 {u.twitchUsername}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  <p className="text-xbox-green font-bold">{u.balance} coins</p>
                  <p className="text-gray-400">{u.wins}V - {u.losses}D</p>
                </div>
                <button
                  onClick={() => toggleAdmin(u.id, u.isAdmin)}
                  className={`px-3 py-1 rounded text-sm ${
                    u.isAdmin
                      ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40'
                      : 'bg-green-600/20 text-green-400 hover:bg-green-600/40'
                  }`}
                >
                  {u.isAdmin ? 'Retirer admin' : 'Rendre admin'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: OCR */}
      {activeTab === 'ocr' && (
        <div className="space-y-6">
          {/* Statistiques OCR */}
          {ocrStats && (
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-bold text-lg mb-3">📊 Statistiques d'apprentissage</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-xbox-green">{ocrStats.accuracy}%</p>
                  <p className="text-sm text-gray-400">Précision</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">{ocrStats.totalCorrections}</p>
                  <p className="text-sm text-gray-400">Total analyses</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{ocrStats.correctCount}</p>
                  <p className="text-sm text-gray-400">Corrects</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{ocrStats.incorrectCount}</p>
                  <p className="text-sm text-gray-400">Erreurs</p>
                </div>
              </div>
            </div>
          )}

          {/* Analyser un stream Twitch */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-bold text-lg mb-3">📺 Analyser un stream Twitch</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={twitchChannel}
                onChange={(e) => setTwitchChannel(e.target.value)}
                placeholder="Nom du channel Twitch"
                className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={analyzeTwitchStream}
                disabled={ocrLoading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {ocrLoading ? '⏳ Analyse...' : '🔍 Analyser'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Capture une frame du stream et détecte le score automatiquement
            </p>
          </div>

          {/* Analyser une image */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-bold text-lg mb-3">📷 Analyser une capture d'écran</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => analyzeImage(e.target.files[0])}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrLoading}
              className="w-full py-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-purple-500 hover:text-purple-400 transition"
            >
              {ocrLoading ? '⏳ Analyse en cours...' : '📁 Cliquer pour uploader une image'}
            </button>
          </div>

          {/* Résultats OCR */}
          {ocrResult && (
            <div className={`bg-gray-800 rounded-xl p-4 border-l-4 ${ocrResult.success ? 'border-green-500' : 'border-red-500'}`}>
              <h3 className="font-bold text-lg mb-3">
                {ocrResult.success ? '✅ Résultat de l\'analyse' : '❌ Erreur'}
              </h3>

              {ocrResult.success ? (
                <div className="space-y-4">
                  {/* Score détecté */}
                  <div className="flex items-center justify-center gap-8 py-4 bg-gray-700 rounded-lg">
                    <div className="text-center">
                      <p className="text-4xl font-bold">{ocrResult.score1 ?? '?'}</p>
                      <p className="text-sm text-gray-400">Équipe 1</p>
                    </div>
                    <span className="text-2xl text-gray-500">-</span>
                    <div className="text-center">
                      <p className="text-4xl font-bold">{ocrResult.score2 ?? '?'}</p>
                      <p className="text-sm text-gray-400">Équipe 2</p>
                    </div>
                  </div>

                  {/* Détails */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-gray-700 rounded-lg p-3">
                      <p className="text-lg font-bold">{ocrResult.period ?? '-'}</p>
                      <p className="text-xs text-gray-400">Période</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3">
                      <p className="text-lg font-bold">{ocrResult.time ?? '--:--'}</p>
                      <p className="text-xs text-gray-400">Temps</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3">
                      <p className="text-lg font-bold">{ocrResult.powerPlay ? '⚡ Oui' : 'Non'}</p>
                      <p className="text-xs text-gray-400">Power Play</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3">
                      <p className="text-lg font-bold">{ocrResult.screenType || 'GAMEPLAY'}</p>
                      <p className="text-xs text-gray-400">Type écran</p>
                    </div>
                  </div>

                  {/* Confiance et amélioration */}
                  {ocrResult.confidence && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-xbox-green h-2 rounded-full"
                          style={{ width: `${(ocrResult.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-400">
                        {Math.round(ocrResult.confidence * 100)}% confiance
                      </span>
                      {ocrResult.enhancedByLearning && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                          🧠 Amélioré par IA
                        </span>
                      )}
                    </div>
                  )}

                  {/* Mode correction */}
                  {!correctionMode ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setCorrectionMode(true);
                          setCorrectedScore({
                            score1: ocrResult.score1?.toString() || '',
                            score2: ocrResult.score2?.toString() || ''
                          });
                        }}
                        className="flex-1 px-4 py-2 bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/40"
                      >
                        ✏️ Corriger le score
                      </button>
                      <button
                        onClick={() => submitCorrection()}
                        className="flex-1 px-4 py-2 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/40"
                      >
                        ✅ Score correct
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400">Entrez le score correct:</p>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={correctedScore.score1}
                          onChange={(e) => setCorrectedScore({ ...correctedScore, score1: e.target.value })}
                          className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-center text-xl"
                          placeholder="0"
                        />
                        <span className="text-xl">-</span>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={correctedScore.score2}
                          onChange={(e) => setCorrectedScore({ ...correctedScore, score2: e.target.value })}
                          className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-center text-xl"
                          placeholder="0"
                        />
                        <button
                          onClick={submitCorrection}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg"
                        >
                          💾 Enregistrer
                        </button>
                        <button
                          onClick={() => setCorrectionMode(false)}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg"
                        >
                          ❌ Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Texte brut détecté */}
                  {ocrResult.rawText && (
                    <details className="mt-4">
                      <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                        🔤 Voir le texte brut détecté
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-900 rounded-lg text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
                        {ocrResult.rawText}
                      </pre>
                    </details>
                  )}
                </div>
              ) : (
                <p className="text-red-400">{ocrResult.error}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
