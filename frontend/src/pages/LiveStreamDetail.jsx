import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import ScoreOCR from '../components/ScoreOCR';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function LiveStreamDetail() {
  const { id } = useParams();
  const [stream, setStream] = useState(null);
  const [odds, setOdds] = useState(null);
  const [events, setEvents] = useState([]);
  const [myBets, setMyBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [betAmount, setBetAmount] = useState(100);
  const [selectedBet, setSelectedBet] = useState(null);
  const [showBetModal, setShowBetModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [manualScore, setManualScore] = useState({ score1: 0, score2: 0, period: 1, time: '20:00' });

  const socketRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchStream();
    fetchOdds();
    fetchMyBets();
    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-stream', id);
        socketRef.current.disconnect();
      }
    };
  }, [id]);

  const connectSocket = () => {
    socketRef.current = io(API_URL);

    socketRef.current.on('connect', () => {
      console.log('WebSocket connecté');
      socketRef.current.emit('join-stream', id);
    });

    socketRef.current.on('stream-update', (update) => {
      setStream(prev => ({ ...prev, ...update }));
      fetchOdds(); // Les cotes changent avec le score
    });

    socketRef.current.on('stream-event', (event) => {
      setEvents(prev => [event, ...prev.slice(0, 19)]);

      // Notification sonore pour les buts
      if (event.eventType === 'GOAL') {
        playGoalSound();
      }
    });

    socketRef.current.on('bet-settled', (data) => {
      fetchMyBets();
      if (data.won) {
        alert(`🎉 Pari gagné! +${data.payout} coins`);
      }
    });

    socketRef.current.on('new-bet', (data) => {
      console.log('Nouveau pari placé:', data);
    });
  };

  const playGoalSound = () => {
    // TODO: Ajouter un son de but
    console.log('🚨 BUT!');
  };

  const fetchStream = async () => {
    try {
      const response = await fetch(`${API_URL}/api/live-streams/${id}`);
      const data = await response.json();
      setStream(data);
      setEvents(data.events || []);
      setManualScore({
        score1: data.currentScore1,
        score2: data.currentScore2,
        period: data.currentPeriod,
        time: data.currentTime
      });
      // Vérifier si l'utilisateur est le créateur du stream
      setIsAdmin(data.streamerId === user.id);
    } catch (error) {
      console.error('Erreur chargement stream:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOdds = async () => {
    try {
      const response = await fetch(`${API_URL}/api/live-streams/${id}/odds`);
      const data = await response.json();
      setOdds(data);
    } catch (error) {
      console.error('Erreur chargement cotes:', error);
    }
  };

  const fetchMyBets = async () => {
    if (!user.id) return;
    try {
      const response = await fetch(`${API_URL}/api/live-streams/${id}/my-bets?userId=${user.id}`);
      const data = await response.json();
      setMyBets(data);
    } catch (error) {
      console.error('Erreur chargement paris:', error);
    }
  };

  const placeBet = async () => {
    if (!selectedBet || !user.id) return;

    try {
      const response = await fetch(`${API_URL}/api/live-streams/${id}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          betType: selectedBet.type,
          prediction: selectedBet.prediction,
          amount: betAmount,
          spreadValue: selectedBet.spreadValue,
          totalValue: selectedBet.totalValue
        })
      });

      if (response.ok) {
        setShowBetModal(false);
        setSelectedBet(null);
        fetchMyBets();
        alert('Pari placé!');
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur');
      }
    } catch (error) {
      console.error('Erreur placement pari:', error);
      alert('Erreur réseau');
    }
  };

  const startStream = async () => {
    try {
      await fetch(`${API_URL}/api/live-streams/${id}/start`, { method: 'POST' });
      fetchStream();
    } catch (error) {
      console.error('Erreur démarrage stream:', error);
    }
  };

  const stopStream = async () => {
    if (confirm('Arrêter le stream et résoudre tous les paris?')) {
      try {
        await fetch(`${API_URL}/api/live-streams/${id}/stop`, { method: 'POST' });
        fetchStream();
      } catch (error) {
        console.error('Erreur arrêt stream:', error);
      }
    }
  };

  const updateScoreManually = async () => {
    try {
      await fetch(`${API_URL}/api/live-streams/${id}/manual-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualScore)
      });
      fetchStream();
    } catch (error) {
      console.error('Erreur mise à jour:', error);
    }
  };

  const recordGoal = async (team) => {
    const newScore = team === 1 ?
      { score1: stream.currentScore1 + 1, score2: stream.currentScore2 } :
      { score1: stream.currentScore1, score2: stream.currentScore2 + 1 };

    try {
      await fetch(`${API_URL}/api/live-streams/${id}/manual-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newScore,
          period: stream.currentPeriod,
          time: stream.currentTime,
          eventDescription: `But! ${team === 1 ? stream.player1Name : stream.player2Name}`
        })
      });
      fetchStream();
    } catch (error) {
      console.error('Erreur enregistrement but:', error);
    }
  };

  const openBetModal = (type, prediction, oddsValue, spreadValue = null, totalValue = null) => {
    setSelectedBet({ type, prediction, odds: oddsValue, spreadValue, totalValue });
    setShowBetModal(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'LIVE': return 'text-red-400';
      case 'INTERMISSION': return 'text-yellow-400';
      case 'ENDED': return 'text-gray-400';
      default: return 'text-blue-400';
    }
  };

  // Extraire le nom du channel Twitch depuis l'URL
  const getTwitchChannel = (url) => {
    if (!url) return null;
    // Formats supportés: twitch.tv/channel, www.twitch.tv/channel, https://twitch.tv/channel
    const match = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
  };

  // Extraire l'ID de vidéo YouTube depuis l'URL
  const getYouTubeVideoId = (url) => {
    if (!url) return null;
    // Formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/live/ID
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
      /youtu\.be\/([a-zA-Z0-9_-]+)/,
      /youtube\.com\/live\/([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const twitchChannel = getTwitchChannel(stream?.streamUrl);
  const youtubeVideoId = getYouTubeVideoId(stream?.streamUrl);

  if (loading || !stream) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-2xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <Link to="/live" className="text-blue-400 hover:text-blue-300">
            ← Retour aux streams
          </Link>
          <span className={`font-bold ${getStatusColor(stream.status)}`}>
            {stream.status === 'LIVE' ? '🔴 EN DIRECT' :
             stream.status === 'INTERMISSION' ? '⏸️ ENTRACTE' :
             stream.status === 'ENDED' ? '✅ TERMINÉ' : '⏳ EN ATTENTE'}
          </span>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne principale */}
          <div className="lg:col-span-2 space-y-4">
            {/* Scoreboard */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
              <h1 className="text-xl font-bold text-center mb-4">{stream.title}</h1>

              <div className="flex justify-center items-center gap-8">
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold mb-2">{stream.player1Name}</div>
                  <div className="text-7xl font-mono text-green-400 font-bold">{stream.currentScore1}</div>
                </div>

                <div className="text-center">
                  <div className="text-gray-500 text-xl">VS</div>
                  <div className="text-3xl font-bold text-yellow-400 mt-2">{stream.currentTime}</div>
                  <div className="text-gray-400">Période {stream.currentPeriod}</div>
                </div>

                <div className="text-center flex-1">
                  <div className="text-2xl font-bold mb-2">{stream.player2Name}</div>
                  <div className="text-7xl font-mono text-green-400 font-bold">{stream.currentScore2}</div>
                </div>
              </div>

              {/* Lecteur Stream Twitch/YouTube */}
              {(twitchChannel || youtubeVideoId) && (
                <div className="mt-4">
                  <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    {twitchChannel && (
                      <iframe
                        src={`https://player.twitch.tv/?channel=${twitchChannel}&parent=${window.location.hostname}&muted=false`}
                        height="100%"
                        width="100%"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    )}
                    {youtubeVideoId && !twitchChannel && (
                      <iframe
                        src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1`}
                        height="100%"
                        width="100%"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        className="w-full h-full"
                      />
                    )}
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">
                    📺 Stream en direct {twitchChannel ? `sur Twitch (@${twitchChannel})` : 'sur YouTube'}
                  </p>
                </div>
              )}

              {/* Stats */}
              {(stream.shots1 > 0 || stream.shots2 > 0) && (
                <div className="mt-6 grid grid-cols-3 gap-4 text-center text-sm">
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className="text-gray-400">Tirs</div>
                    <div className="font-bold">{stream.shots1} - {stream.shots2}</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className="text-gray-400">Mises en échec</div>
                    <div className="font-bold">{stream.hits1} - {stream.hits2}</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className="text-gray-400">Mises en jeu</div>
                    <div className="font-bold">{stream.faceoffsWon1} - {stream.faceoffsWon2}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Contrôles admin */}
            {isAdmin && (
              <div className="bg-gray-800 rounded-xl p-4 border border-yellow-600">
                <h3 className="font-bold text-yellow-400 mb-3">🎛️ Contrôles Admin</h3>

                <div className="flex gap-4 mb-4">
                  {stream.status === 'WAITING' && (
                    <button onClick={startStream} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg">
                      ▶️ Démarrer le stream
                    </button>
                  )}
                  {(stream.status === 'LIVE' || stream.status === 'INTERMISSION') && (
                    <button onClick={stopStream} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg">
                      ⏹️ Terminer le match
                    </button>
                  )}
                </div>

                {stream.status === 'LIVE' && (
                  <>
                    <div className="flex gap-4 mb-4">
                      <button
                        onClick={() => recordGoal(1)}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold"
                      >
                        🚨 But {stream.player1Name}
                      </button>
                      <button
                        onClick={() => recordGoal(2)}
                        className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-lg font-bold"
                      >
                        🚨 But {stream.player2Name}
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-xs text-gray-400">Score 1</label>
                        <input
                          type="number"
                          value={manualScore.score1}
                          onChange={(e) => setManualScore({ ...manualScore, score1: parseInt(e.target.value) || 0 })}
                          className="w-full bg-gray-700 rounded p-2"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Score 2</label>
                        <input
                          type="number"
                          value={manualScore.score2}
                          onChange={(e) => setManualScore({ ...manualScore, score2: parseInt(e.target.value) || 0 })}
                          className="w-full bg-gray-700 rounded p-2"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Période</label>
                        <input
                          type="number"
                          value={manualScore.period}
                          onChange={(e) => setManualScore({ ...manualScore, period: parseInt(e.target.value) || 1 })}
                          className="w-full bg-gray-700 rounded p-2"
                          min="1"
                          max="5"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Temps</label>
                        <input
                          type="text"
                          value={manualScore.time}
                          onChange={(e) => setManualScore({ ...manualScore, time: e.target.value })}
                          className="w-full bg-gray-700 rounded p-2"
                          placeholder="20:00"
                        />
                      </div>
                    </div>
                    <button
                      onClick={updateScoreManually}
                      className="w-full mt-2 bg-yellow-600 hover:bg-yellow-500 py-2 rounded-lg"
                    >
                      Mettre à jour manuellement
                    </button>

                    {/* OCR Score Detection */}
                    <div className="mt-4 pt-4 border-t border-gray-600">
                      <ScoreOCR
                        player1Name={stream.player1Name}
                        player2Name={stream.player2Name}
                        onScoreDetected={(scores) => {
                          setManualScore({
                            ...manualScore,
                            score1: scores.score1,
                            score2: scores.score2
                          });
                          // Mettre à jour automatiquement
                          fetch(`${API_URL}/api/live-streams/${id}/manual-update`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              score1: scores.score1,
                              score2: scores.score2,
                              period: manualScore.period,
                              time: manualScore.time
                            })
                          }).then(() => fetchStream());
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Événements */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-bold mb-3">📋 Événements du match</h3>
              {events.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Aucun événement encore</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {events.map((event, idx) => (
                    <div
                      key={event.id || idx}
                      className={`flex justify-between items-center p-2 rounded ${
                        event.eventType === 'GOAL' ? 'bg-green-900/30 border-l-4 border-green-500' : 'bg-gray-700/50'
                      }`}
                    >
                      <div>
                        <span className="text-gray-400 text-sm mr-2">
                          P{event.period} {event.gameTime}
                        </span>
                        <span>{event.description}</span>
                      </div>
                      {event.player1Score !== null && (
                        <span className="font-mono font-bold">
                          {event.player1Score} - {event.player2Score}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Colonne paris */}
          <div className="space-y-4">
            {/* Paris disponibles */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-bold mb-4">🎰 Paris en direct</h3>

              {stream.status !== 'LIVE' && stream.status !== 'INTERMISSION' ? (
                <p className="text-gray-400 text-center py-4">
                  Les paris seront disponibles quand le match commencera
                </p>
              ) : odds ? (
                <div className="space-y-4">
                  {/* Gagnant du match */}
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Gagnant du match</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openBetModal('MATCH_WINNER', 'player1', odds.matchWinner.player1)}
                        className="bg-blue-600 hover:bg-blue-500 p-3 rounded-lg text-center"
                      >
                        <div className="font-bold">{stream.player1Name}</div>
                        <div className="text-xl">{odds.matchWinner.player1}x</div>
                      </button>
                      <button
                        onClick={() => openBetModal('MATCH_WINNER', 'player2', odds.matchWinner.player2)}
                        className="bg-red-600 hover:bg-red-500 p-3 rounded-lg text-center"
                      >
                        <div className="font-bold">{stream.player2Name}</div>
                        <div className="text-xl">{odds.matchWinner.player2}x</div>
                      </button>
                    </div>
                  </div>

                  {/* Spread */}
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Spread</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openBetModal('SPREAD', 'player1', odds.spread.player1_minus_1_5, -1.5)}
                        className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg text-center text-sm"
                      >
                        {stream.player1Name} -1.5
                        <div className="text-green-400">{odds.spread.player1_minus_1_5}x</div>
                      </button>
                      <button
                        onClick={() => openBetModal('SPREAD', 'player2', odds.spread.player2_minus_1_5, -1.5)}
                        className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg text-center text-sm"
                      >
                        {stream.player2Name} -1.5
                        <div className="text-green-400">{odds.spread.player2_minus_1_5}x</div>
                      </button>
                      <button
                        onClick={() => openBetModal('SPREAD', 'player1', odds.spread.player1_plus_1_5, 1.5)}
                        className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg text-center text-sm"
                      >
                        {stream.player1Name} +1.5
                        <div className="text-green-400">{odds.spread.player1_plus_1_5}x</div>
                      </button>
                      <button
                        onClick={() => openBetModal('SPREAD', 'player2', odds.spread.player2_plus_1_5, 1.5)}
                        className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg text-center text-sm"
                      >
                        {stream.player2Name} +1.5
                        <div className="text-green-400">{odds.spread.player2_plus_1_5}x</div>
                      </button>
                    </div>
                  </div>

                  {/* Total buts */}
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Total des buts</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openBetModal('TOTAL_GOALS', 'over', odds.totalGoals.over_5_5, null, 5.5)}
                        className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg text-center text-sm"
                      >
                        Plus de 5.5
                        <div className="text-green-400">{odds.totalGoals.over_5_5}x</div>
                      </button>
                      <button
                        onClick={() => openBetModal('TOTAL_GOALS', 'under', odds.totalGoals.under_5_5, null, 5.5)}
                        className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg text-center text-sm"
                      >
                        Moins de 5.5
                        <div className="text-green-400">{odds.totalGoals.under_5_5}x</div>
                      </button>
                    </div>
                  </div>

                  {/* Prochain but */}
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Prochain but</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openBetModal('NEXT_GOAL', 'player1', odds.nextGoal.player1)}
                        className="bg-blue-700 hover:bg-blue-600 p-2 rounded-lg text-center text-sm"
                      >
                        {stream.player1Name}
                        <div className="text-green-400">{odds.nextGoal.player1}x</div>
                      </button>
                      <button
                        onClick={() => openBetModal('NEXT_GOAL', 'player2', odds.nextGoal.player2)}
                        className="bg-red-700 hover:bg-red-600 p-2 rounded-lg text-center text-sm"
                      >
                        {stream.player2Name}
                        <div className="text-green-400">{odds.nextGoal.player2}x</div>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-center">Chargement des cotes...</p>
              )}
            </div>

            {/* Mes paris */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-bold mb-3">📝 Mes paris</h3>
              {myBets.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Aucun pari placé</p>
              ) : (
                <div className="space-y-2">
                  {myBets.map(bet => (
                    <div
                      key={bet.id}
                      className={`p-2 rounded ${
                        bet.status === 'WON' ? 'bg-green-900/30 border border-green-600' :
                        bet.status === 'LOST' ? 'bg-red-900/30 border border-red-600' :
                        'bg-gray-700'
                      }`}
                    >
                      <div className="flex justify-between text-sm">
                        <span>{bet.betType}</span>
                        <span className="font-bold">{bet.amount} coins</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{bet.prediction}</span>
                        <span>{bet.odds}x</span>
                      </div>
                      {bet.status !== 'PENDING' && (
                        <div className={`text-sm mt-1 ${bet.status === 'WON' ? 'text-green-400' : 'text-red-400'}`}>
                          {bet.status === 'WON' ? `Gagné: +${bet.payout}` : 'Perdu'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal de pari */}
        {showBetModal && selectedBet && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
              <h2 className="text-2xl font-bold mb-4">Placer un pari</h2>

              <div className="bg-gray-700 rounded-lg p-4 mb-4">
                <div className="text-sm text-gray-400 mb-1">{selectedBet.type}</div>
                <div className="text-xl font-bold">{selectedBet.prediction}</div>
                <div className="text-green-400 text-2xl">{selectedBet.odds}x</div>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Montant du pari</label>
                <div className="flex gap-2 mb-2">
                  {[50, 100, 250, 500].map(amount => (
                    <button
                      key={amount}
                      onClick={() => setBetAmount(amount)}
                      className={`flex-1 py-2 rounded ${
                        betAmount === amount ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(parseInt(e.target.value) || 0)}
                  className="w-full bg-gray-700 rounded-lg p-3"
                  min="10"
                />
              </div>

              <div className="bg-gray-700 rounded-lg p-3 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Gains potentiels:</span>
                  <span className="text-green-400 font-bold text-xl">
                    {Math.round(betAmount * selectedBet.odds)} coins
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowBetModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-500 py-3 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={placeBet}
                  className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded-lg font-bold"
                >
                  Parier {betAmount} coins
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
