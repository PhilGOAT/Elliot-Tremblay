import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function LiveStreams() {
  const { user } = useAuth();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStreamGuide, setShowStreamGuide] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [newStream, setNewStream] = useState({
    title: '',
    game: 'NHL',
    twitchUsername: '',
    player1Name: '',
    player2Name: ''
  });

  useEffect(() => {
    if (user?.id) {
      fetchUserProfile();
    }
  }, [user?.id]);

  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUserProfile(data);
      // Pré-remplir avec le gamertag Xbox et Twitch si disponibles
      setNewStream(prev => ({
        ...prev,
        player1Name: data.xboxGamertag || prev.player1Name,
        twitchUsername: data.twitchUsername || prev.twitchUsername
      }));
    } catch (error) {
      console.error('Erreur profil:', error);
    }
  };

  useEffect(() => {
    fetchStreams();
    // Rafraîchir toutes les 10 secondes
    const interval = setInterval(fetchStreams, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchStreams = async () => {
    try {
      const response = await fetch(`${API_URL}/api/live-streams`);
      const data = await response.json();
      setStreams(data);
    } catch (error) {
      console.error('Erreur chargement streams:', error);
    } finally {
      setLoading(false);
    }
  };

  const createStream = async (e) => {
    e.preventDefault();
    try {
      // Générer le titre automatiquement si vide
      const title = newStream.title || `${newStream.player1Name} vs ${newStream.player2Name}`;
      // Construire l'URL Twitch depuis le username
      const streamUrl = newStream.twitchUsername
        ? `https://twitch.tv/${newStream.twitchUsername.replace('@', '').trim()}`
        : '';

      const response = await fetch(`${API_URL}/api/live-streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newStream,
          title,
          streamUrl,
          userId: user?.id
        })
      });

      if (response.ok) {
        setShowCreateModal(false);
        setNewStream({
          title: '',
          game: 'NHL',
          twitchUsername: userProfile?.twitchUsername || '',
          player1Name: userProfile?.xboxGamertag || '',
          player2Name: ''
        });
        fetchStreams();
        alert('Match annoncé! Lance ton stream Twitch et démarre le match quand tu es prêt.');
      } else {
        const error = await response.json();
        alert('Erreur: ' + (error.error || 'Impossible de créer le match'));
      }
    } catch (error) {
      console.error('Erreur création stream:', error);
      alert('Erreur réseau. Vérifie ta connexion.');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'LIVE':
        return <span className="px-2 py-1 bg-red-600 rounded-full text-xs animate-pulse">🔴 EN DIRECT</span>;
      case 'INTERMISSION':
        return <span className="px-2 py-1 bg-yellow-600 rounded-full text-xs">⏸️ ENTRACTE</span>;
      case 'WAITING':
        return <span className="px-2 py-1 bg-blue-600 rounded-full text-xs">⏳ EN ATTENTE</span>;
      default:
        return <span className="px-2 py-1 bg-gray-600 rounded-full text-xs">{status}</span>;
    }
  };

  const getGameIcon = (game) => {
    const icons = {
      NHL: '🏒',
      MADDEN: '🏈',
      FIFA: '⚽',
      NBA2K: '🏀',
      MLB: '⚾',
      UFC: '🥊'
    };
    return icons[game] || '🎮';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-2xl">Chargement des streams...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">🎮 Matchs en Direct</h1>
            <p className="text-gray-400">Parie sur les matchs de tes amis en temps réel</p>
          </div>
          <div className="flex gap-4">
            <Link to="/" className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg">
              ← Accueil
            </Link>
            {user?.id && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg font-bold"
              >
                + Annoncer un match
              </button>
            )}
          </div>
        </div>

        {/* Aucun stream */}
        {streams.filter(s => s.status === 'WAITING').length === 0 &&
         streams.filter(s => s.status === 'LIVE' || s.status === 'INTERMISSION').length === 0 && (
          <div className="bg-gray-800 rounded-xl p-12 text-center mb-8">
            <div className="text-6xl mb-4">🎮</div>
            <h2 className="text-2xl font-bold mb-2">Aucun match en cours</h2>
            <p className="text-gray-400 mb-6">
              Sois le premier à annoncer un match!
            </p>
            {user?.id ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-600 hover:bg-green-500 px-8 py-4 rounded-lg font-bold text-xl"
              >
                🎮 Annoncer mon match
              </button>
            ) : (
              <Link
                to="/login"
                className="inline-block bg-blue-600 hover:bg-blue-500 px-8 py-4 rounded-lg font-bold text-xl"
              >
                Se connecter pour annoncer un match
              </Link>
            )}
          </div>
        )}

        {/* Streams actifs */}
        {streams.filter(s => s.status === 'LIVE' || s.status === 'INTERMISSION').length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 text-red-400">🔴 En cours maintenant</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {streams.filter(s => s.status === 'LIVE' || s.status === 'INTERMISSION').map(stream => (
                <Link
                  key={stream.id}
                  to={`/live/${stream.id}`}
                  className="bg-gradient-to-r from-red-900/50 to-gray-800 rounded-xl p-4 border border-red-600/50 hover:border-red-500 transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getGameIcon(stream.game)}</span>
                      <span className="font-bold">{stream.title}</span>
                    </div>
                    {getStatusBadge(stream.status)}
                  </div>

                  {/* Score en direct */}
                  <div className="bg-black/40 rounded-lg p-4 mb-3">
                    <div className="flex justify-between items-center text-xl">
                      <div className="text-center flex-1">
                        <div className="font-bold">{stream.player1Name}</div>
                        <div className="text-4xl font-mono text-green-400">{stream.currentScore1}</div>
                      </div>
                      <div className="text-gray-500 text-2xl px-4">VS</div>
                      <div className="text-center flex-1">
                        <div className="font-bold">{stream.player2Name}</div>
                        <div className="text-4xl font-mono text-green-400">{stream.currentScore2}</div>
                      </div>
                    </div>
                    <div className="text-center text-gray-400 mt-2">
                      P{stream.currentPeriod} - {stream.currentTime}
                    </div>
                  </div>

                  <div className="flex justify-between text-sm text-gray-400">
                    {stream.streamUrl && stream.streamUrl.includes('twitch.tv') ? (
                      <span className="text-purple-400">📺 Stream en direct</span>
                    ) : (
                      <span>👁️ {stream.viewerCount || 0} spectateurs</span>
                    )}
                    <span>🎰 {stream._count?.liveBets || 0} paris</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Streams en attente */}
        <div>
          <h2 className="text-xl font-bold mb-4 text-blue-400">⏳ À venir</h2>
          {streams.filter(s => s.status === 'WAITING').length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-400">
              <p className="text-xl mb-2">Aucun stream en attente</p>
              <p>Crée un nouveau stream pour commencer!</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {streams.filter(s => s.status === 'WAITING').map(stream => (
                <Link
                  key={stream.id}
                  to={`/live/${stream.id}`}
                  className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500 transition-all"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{getGameIcon(stream.game)}</span>
                    <span className="font-bold">{stream.title}</span>
                  </div>

                  <div className="flex justify-between items-center text-lg mb-3">
                    <span>{stream.player1Name}</span>
                    <span className="text-gray-500">VS</span>
                    <span>{stream.player2Name}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    {getStatusBadge(stream.status)}
                    {stream.streamUrl && stream.streamUrl.includes('twitch.tv') && (
                      <span className="text-xs text-purple-400">📺 Stream prêt</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Modal création stream */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg my-8">
              <h2 className="text-2xl font-bold mb-2">🎮 Annoncer un match</h2>
              <p className="text-gray-400 text-sm mb-4">
                Stream ton match Xbox sur Twitch pour que tes amis puissent regarder et parier!
              </p>

              <form onSubmit={createStream} className="space-y-4">
                {/* Section Twitch - Mise en avant */}
                <div className="bg-purple-900/30 border border-purple-600/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-bold text-purple-400">
                      📺 Ton nom Twitch (requis pour le stream)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowStreamGuide(!showStreamGuide)}
                      className="text-xs text-purple-300 hover:text-purple-200 underline"
                    >
                      {showStreamGuide ? 'Masquer le guide' : 'Comment streamer?'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newStream.twitchUsername}
                    onChange={(e) => setNewStream({ ...newStream, twitchUsername: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg p-3 border border-purple-600/30"
                    placeholder="ton_nom_twitch"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Entre ton nom d'utilisateur Twitch (sans le @). Les autres verront ton stream en direct!
                  </p>

                  {/* Guide de streaming Xbox */}
                  {showStreamGuide && (
                    <div className="mt-4 pt-4 border-t border-purple-600/30 space-y-3">
                      <h4 className="font-bold text-purple-300">🎮 Comment streamer depuis Xbox:</h4>
                      <ol className="text-xs text-gray-300 space-y-2 list-decimal list-inside">
                        <li>
                          <strong>Lie ton compte Twitch à Xbox:</strong>
                          <br />
                          <span className="text-gray-400 ml-4">Paramètres → Compte → Comptes liés → Twitch</span>
                        </li>
                        <li>
                          <strong>Lance ton jeu (NHL, Madden, etc.)</strong>
                        </li>
                        <li>
                          <strong>Appuie sur le bouton Xbox → Capturer et partager</strong>
                        </li>
                        <li>
                          <strong>Sélectionne "Diffusion en direct"</strong>
                        </li>
                        <li>
                          <strong>Choisis Twitch et commence à streamer!</strong>
                        </li>
                      </ol>
                      <div className="bg-gray-700/50 rounded p-2 mt-2">
                        <p className="text-xs text-green-400">
                          💡 Ton stream sera visible sur twitch.tv/{newStream.twitchUsername || 'ton_nom'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Jeu</label>
                  <select
                    value={newStream.game}
                    onChange={(e) => setNewStream({ ...newStream, game: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg p-3"
                  >
                    <option value="NHL">🏒 NHL</option>
                    <option value="MADDEN">🏈 Madden</option>
                    <option value="FIFA">⚽ FIFA</option>
                    <option value="NBA2K">🏀 NBA 2K</option>
                    <option value="MLB">⚾ MLB</option>
                    <option value="UFC">🥊 UFC</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Ton gamertag Xbox
                      {userProfile?.xboxGamertag && (
                        <span className="text-green-400 ml-1">✓</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={newStream.player1Name}
                      onChange={(e) => setNewStream({ ...newStream, player1Name: e.target.value })}
                      className="w-full bg-gray-700 rounded-lg p-3"
                      placeholder="Ton gamertag"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Adversaire</label>
                    <input
                      type="text"
                      value={newStream.player2Name}
                      onChange={(e) => setNewStream({ ...newStream, player2Name: e.target.value })}
                      className="w-full bg-gray-700 rounded-lg p-3"
                      placeholder="Gamertag adversaire"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Titre du match (optionnel)</label>
                  <input
                    type="text"
                    value={newStream.title}
                    onChange={(e) => setNewStream({ ...newStream, title: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg p-3"
                    placeholder={`${newStream.player1Name || 'Toi'} vs ${newStream.player2Name || 'Adversaire'}`}
                  />
                </div>

                {/* Résumé */}
                <div className="bg-gray-700/50 rounded-lg p-3 text-sm">
                  <p className="text-gray-300">
                    📺 Stream: <span className="text-purple-400">twitch.tv/{newStream.twitchUsername || '...'}</span>
                  </p>
                  <p className="text-gray-300">
                    🎮 Match: <span className="text-green-400">{newStream.player1Name || '?'} vs {newStream.player2Name || '?'}</span>
                  </p>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 py-3 rounded-lg"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded-lg font-bold"
                    disabled={!newStream.twitchUsername}
                  >
                    🎮 Créer le match
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
