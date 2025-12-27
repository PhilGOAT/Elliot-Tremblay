import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Home() {
  const { user } = useAuth();
  const [liveStreams, setLiveStreams] = useState([]);
  const [upcomingStreams, setUpcomingStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStreams();
    // Rafraîchir toutes les 15 secondes
    const interval = setInterval(fetchStreams, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchStreams = async () => {
    try {
      const response = await fetch(`${API_URL}/api/live-streams`);
      const data = await response.json();

      setLiveStreams(data.filter(s => s.status === 'LIVE' || s.status === 'INTERMISSION'));
      setUpcomingStreams(data.filter(s => s.status === 'WAITING'));
    } catch (error) {
      console.error('Erreur chargement streams:', error);
    } finally {
      setLoading(false);
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

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold mb-2">
          🎮 Xbox <span className="text-xbox-green">Betting</span>
        </h1>
        <p className="text-gray-400">
          Parie sur les matchs en direct de tes amis!
        </p>
      </div>

      {/* Matchs en direct */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-red-400">
            🔴 Matchs en direct
          </h2>
          <Link to="/live" className="text-blue-400 hover:text-blue-300">
            Voir tout →
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : liveStreams.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">📺</div>
            <p className="text-gray-400 text-lg mb-2">Aucun match en cours</p>
            <p className="text-gray-500 text-sm">
              {user
                ? "Annonce que tu vas jouer pour que tes amis puissent parier!"
                : "Connecte-toi pour annoncer un match"
              }
            </p>
            {user && (
              <Link
                to="/live"
                className="inline-block mt-4 bg-green-600 hover:bg-green-500 px-6 py-3 rounded-lg font-bold"
              >
                + Annoncer un match
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {liveStreams.map(stream => (
              <Link
                key={stream.id}
                to={`/live/${stream.id}`}
                className="bg-gradient-to-r from-red-900/50 to-gray-800 rounded-xl p-4 border border-red-600/50 hover:border-red-400 transition-all transform hover:scale-[1.02]"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getGameIcon(stream.game)}</span>
                    <div>
                      <div className="font-bold">{stream.title}</div>
                      <div className="text-xs text-gray-400">{stream.game}</div>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-red-600 rounded-full text-xs animate-pulse">
                    EN DIRECT
                  </span>
                </div>

                {/* Score */}
                <div className="bg-black/40 rounded-lg p-3 mb-3">
                  <div className="flex justify-between items-center">
                    <div className="text-center flex-1">
                      <div className="text-sm text-gray-400">{stream.player1Name}</div>
                      <div className="text-3xl font-mono font-bold text-green-400">
                        {stream.currentScore1}
                      </div>
                    </div>
                    <div className="text-gray-600 text-lg px-2">-</div>
                    <div className="text-center flex-1">
                      <div className="text-sm text-gray-400">{stream.player2Name}</div>
                      <div className="text-3xl font-mono font-bold text-green-400">
                        {stream.currentScore2}
                      </div>
                    </div>
                  </div>
                  <div className="text-center text-xs text-gray-500 mt-1">
                    P{stream.currentPeriod} • {stream.currentTime}
                  </div>
                </div>

                <div className="flex justify-between text-xs text-gray-400">
                  <span>🎰 {stream._count?.liveBets || 0} paris actifs</span>
                  <span className="text-green-400 font-bold">Parier →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Matchs à venir */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-blue-400">
            ⏳ Matchs à venir
          </h2>
        </div>

        {upcomingStreams.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-6 text-center">
            <p className="text-gray-400">Aucun match annoncé</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {upcomingStreams.slice(0, 6).map(stream => (
              <Link
                key={stream.id}
                to={`/live/${stream.id}`}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500 transition-all"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{getGameIcon(stream.game)}</span>
                  <span className="font-bold text-sm">{stream.title}</span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-300">{stream.player1Name}</span>
                  <span className="text-gray-500">VS</span>
                  <span className="text-gray-300">{stream.player2Name}</span>
                </div>

                <div className="mt-3 text-center">
                  <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-1 rounded">
                    En attente
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Comment ça marche */}
      <div className="bg-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-bold mb-4 text-center">Comment ça marche?</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-10 h-10 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-2 text-xl font-bold">1</div>
            <p className="text-sm text-gray-300">Un joueur annonce son match</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-2 text-xl font-bold">2</div>
            <p className="text-sm text-gray-300">Il stream sur Twitch/YouTube</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-2 text-xl font-bold">3</div>
            <p className="text-sm text-gray-300">Les amis parient en direct</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-2 text-xl font-bold">4</div>
            <p className="text-sm text-gray-300">Les paris sont résolus!</p>
          </div>
        </div>
      </div>

      {/* Call to action */}
      {!user && (
        <div className="bg-gradient-to-r from-green-900 to-blue-900 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Prêt à parier?</h2>
          <p className="text-gray-300 mb-6">
            Crée ton compte et reçois 1000 coins gratuits pour commencer!
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/register" className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-lg font-bold">
              Créer un compte
            </Link>
            <Link to="/login" className="bg-gray-700 hover:bg-gray-600 px-8 py-3 rounded-lg">
              Se connecter
            </Link>
          </div>
        </div>
      )}

      {/* Jeux supportés */}
      <div className="mt-8 text-center">
        <p className="text-gray-500 text-sm mb-3">Jeux supportés</p>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { name: 'NHL', icon: '🏒' },
            { name: 'Madden', icon: '🏈' },
            { name: 'FIFA', icon: '⚽' },
            { name: 'NBA 2K', icon: '🏀' },
            { name: 'MLB', icon: '⚾' },
            { name: 'UFC', icon: '🥊' }
          ].map(game => (
            <span key={game.name} className="bg-gray-800 px-4 py-2 rounded-lg text-gray-400 text-sm">
              {game.icon} {game.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
