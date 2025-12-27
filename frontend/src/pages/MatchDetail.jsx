import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GameBadge from '../components/GameBadge';
import toast from 'react-hot-toast';

// Période labels
const periodLabels = {
  1: '1ère',
  2: '2ème',
  3: '3ème',
  4: 'Prol.',
  5: 'TB'
};

const difficultyLabels = {
  ROOKIE: 'Rookie',
  PRO: 'Pro',
  ALL_PRO: 'All-Pro',
  ALL_MADDEN: 'All-Madden'
};

const betTypeLabels = {
  WINNER: 'Gagnant',
  CLOSE_MATCH: 'Match serré',
  HIGH_SCORE: 'Haut score'
};

// Seuils par sport
const GAME_THRESHOLDS = {
  MADDEN: { closeMatch: 7, highScore: 50, unit: 'pts' },
  NHL: { closeMatch: 2, highScore: 8, unit: 'buts' },
  FIFA: { closeMatch: 1, highScore: 5, unit: 'buts' },
  NBA2K: { closeMatch: 10, highScore: 200, unit: 'pts' },
  MLB: { closeMatch: 2, highScore: 12, unit: 'runs' },
  UFC: { closeMatch: 0, highScore: 3, unit: 'rounds' },
  OTHER: { closeMatch: 3, highScore: 20, unit: 'pts' }
};

const getBetTypeDescription = (type, game) => {
  const t = GAME_THRESHOLDS[game] || GAME_THRESHOLDS.OTHER;
  if (type === 'WINNER') return 'Parie sur le gagnant du match';
  if (type === 'CLOSE_MATCH') return `Écart de ${t.closeMatch} ${t.unit} ou moins?`;
  if (type === 'HIGH_SCORE') return `Score total de ${t.highScore}+ ${t.unit}?`;
  return '';
};

export default function MatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [betAmount, setBetAmount] = useState(100);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [betType, setBetType] = useState('WINNER');
  const [specialBetPrediction, setSpecialBetPrediction] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [showSubmitScore, setShowSubmitScore] = useState(false);
  const [submitP1Score, setSubmitP1Score] = useState(0);
  const [submitP2Score, setSubmitP2Score] = useState(0);

  // OCR State
  const [ocrData, setOcrData] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [enablingOcr, setEnablingOcr] = useState(false);
  const [twitchChannel, setTwitchChannel] = useState('');

  useEffect(() => {
    fetchMatch();
  }, [id]);

  // Auto-refresh OCR data every 15 seconds if enabled
  useEffect(() => {
    if (!match?.ocrEnabled) return;

    const fetchOcr = async () => {
      try {
        const res = await api.get(`/matches/${id}/ocr`);
        setOcrData(res.data);
      } catch (error) {
        console.error('OCR fetch error:', error);
      }
    };

    fetchOcr();
    const interval = setInterval(fetchOcr, 15000);
    return () => clearInterval(interval);
  }, [match?.ocrEnabled, id]);

  const fetchMatch = async () => {
    try {
      const res = await api.get(`/matches/${id}`);
      setMatch(res.data);
    } catch (error) {
      toast.error('Match non trouvé');
      navigate('/matches');
    } finally {
      setLoading(false);
    }
  };

  const handleBet = async () => {
    if (!user) {
      toast.error('Connectez-vous pour parier');
      return;
    }

    // Vérifier la prédiction selon le type de pari
    let prediction;
    if (betType === 'WINNER') {
      if (!selectedPlayer) {
        toast.error('Sélectionnez un joueur');
        return;
      }
      prediction = selectedPlayer;
    } else {
      if (!specialBetPrediction) {
        toast.error('Sélectionnez Oui ou Non');
        return;
      }
      prediction = specialBetPrediction;
    }

    if (betAmount < 10) {
      toast.error('Mise minimum: 10 coins');
      return;
    }

    if (betAmount > user.balance) {
      toast.error('Solde insuffisant');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/bets', {
        matchId: id,
        amount: betAmount,
        prediction,
        betType
      });
      toast.success('Pari placé!');
      await Promise.all([fetchMatch(), refreshUser()]);
      setSelectedPlayer(null);
      setSpecialBetPrediction(null);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors du pari');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetResult = async () => {
    setSubmitting(true);
    try {
      await api.patch(`/matches/${id}/result`, {
        player1Score: parseInt(player1Score),
        player2Score: parseInt(player2Score)
      });
      toast.success('Résultat enregistré!');
      fetchMatch();
      refreshUser();
      setShowScoreForm(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Annuler ce match et rembourser tous les paris?')) return;

    try {
      await api.patch(`/matches/${id}/cancel`);
      toast.success('Match annulé');
      fetchMatch();
      refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    }
  };

  const handleSubmitScore = async () => {
    setSubmitting(true);
    try {
      const res = await api.post(`/matches/${id}/submit-score`, {
        player1Score: parseInt(submitP1Score),
        player2Score: parseInt(submitP2Score)
      });

      if (res.data.validated) {
        toast.success('Match validé! Les scores correspondent.');
      } else if (res.data.dispute) {
        toast.error('Conflit de scores! Les résultats ne correspondent pas.');
      } else {
        toast.success(res.data.message);
      }

      fetchMatch();
      refreshUser();
      setShowSubmitScore(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  // OCR Handlers
  const handleEnableOcr = async () => {
    if (!twitchChannel.trim()) {
      toast.error('Entre le nom du channel Twitch');
      return;
    }

    setEnablingOcr(true);
    try {
      await api.post(`/matches/${id}/ocr/enable`, { twitchChannel: twitchChannel.trim() });
      toast.success('OCR activé! Le score sera détecté automatiquement.');
      fetchMatch();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur activation OCR');
    } finally {
      setEnablingOcr(false);
    }
  };

  const handleDisableOcr = async () => {
    try {
      await api.post(`/matches/${id}/ocr/disable`);
      toast.success('OCR désactivé');
      setOcrData(null);
      fetchMatch();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    }
  };

  const handleApplyOcrScore = async () => {
    try {
      await api.post(`/matches/${id}/ocr/apply`);
      toast.success('Score OCR appliqué comme score soumis!');
      fetchMatch();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    }
  };

  const handleFinalizeWithOcr = async () => {
    if (!confirm('Finaliser le match avec le score OCR? Cette action est définitive.')) return;

    try {
      await api.post(`/matches/${id}/ocr/finalize`);
      toast.success('Match finalisé avec le score OCR!');
      fetchMatch();
      refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
      </div>
    );
  }

  if (!match) return null;

  const isCreator = user && match.createdBy === user.id;
  const canSetResult = isCreator && match.status !== 'COMPLETED' && match.status !== 'CANCELLED';

  // Vérifier si l'utilisateur est un joueur du match
  const isPlayer1 = user && (match.player1HumanName === user.username || match.createdBy === user.id);
  const isPlayer2 = user && match.player2HumanName === user.username;
  const isPlayer = isPlayer1 || isPlayer2;

  // Vérifier l'état des soumissions
  const player1HasSubmitted = !!match.player1SubmittedAt;
  const player2HasSubmitted = !!match.player2SubmittedAt;
  const userHasSubmitted = (isPlayer1 && player1HasSubmitted) || (isPlayer2 && player2HasSubmitted);
  const canSubmitScore = isPlayer && !userHasSubmitted && match.status !== 'COMPLETED' && match.status !== 'CANCELLED';

  // Filtrer les paris par type
  const winnerBets = match.bets.filter(b => (b.betType || 'WINNER') === 'WINNER');
  const closeMatchBets = match.bets.filter(b => b.betType === 'CLOSE_MATCH');
  const highScoreBets = match.bets.filter(b => b.betType === 'HIGH_SCORE');

  const player1Bets = winnerBets.filter(b => b.prediction === 'player1');
  const player2Bets = winnerBets.filter(b => b.prediction === 'player2');
  const player1Total = player1Bets.reduce((sum, b) => sum + b.amount, 0);
  const player2Total = player2Bets.reduce((sum, b) => sum + b.amount, 0);
  const totalPool = player1Total + player2Total;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <GameBadge game={match.game} />
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            match.status === 'PENDING' ? 'bg-yellow-600' :
            match.status === 'LIVE' ? 'bg-green-600' :
            match.status === 'COMPLETED' ? 'bg-gray-600' : 'bg-red-600'
          }`}>
            {match.status === 'PENDING' && 'En attente'}
            {match.status === 'LIVE' && '🔴 En cours'}
            {match.status === 'COMPLETED' && 'Terminé'}
            {match.status === 'CANCELLED' && 'Annulé'}
          </span>
        </div>

        <div className="flex items-stretch gap-4 mb-8">
          <div
            className={`flex-1 p-6 rounded-xl border-2 text-center ${
              match.winnerId === 'player1' ? 'border-xbox-green ring-2 ring-xbox-green' : 'border-gray-600'
            }`}
          >
            <p className="text-sm text-gray-400 mb-1">
              {match.player1Type === 'CPU'
                ? `🤖 CPU (${difficultyLabels[match.player1Difficulty] || 'Pro'})`
                : `👤 ${match.player1HumanName || 'Humain'}`}
            </p>
            <p className="text-2xl font-bold mb-2">{match.player1Name}</p>
            {match.status === 'COMPLETED' && (
              <p className="text-4xl font-bold text-xbox-green mt-4">{match.player1Score}</p>
            )}
            <div className="mt-4 pt-4 border-t border-gray-600">
              <p className="text-xbox-green font-bold">{player1Total} coins</p>
              <p className="text-sm text-gray-500">{player1Bets.length} paris</p>
            </div>
          </div>

          <div className="flex items-center">
            <span className="text-3xl text-gray-500 font-bold">VS</span>
          </div>

          <div
            className={`flex-1 p-6 rounded-xl border-2 text-center ${
              match.winnerId === 'player2' ? 'border-xbox-green ring-2 ring-xbox-green' : 'border-gray-600'
            }`}
          >
            <p className="text-sm text-gray-400 mb-1">
              {match.player2Type === 'CPU'
                ? `🤖 CPU (${difficultyLabels[match.player2Difficulty] || 'Pro'})`
                : `👤 ${match.player2HumanName || 'Humain'}`}
            </p>
            <p className="text-2xl font-bold mb-2">{match.player2Name}</p>
            {match.status === 'COMPLETED' && (
              <p className="text-4xl font-bold text-xbox-green mt-4">{match.player2Score}</p>
            )}
            <div className="mt-4 pt-4 border-t border-gray-600">
              <p className="text-xbox-green font-bold">{player2Total} coins</p>
              <p className="text-sm text-gray-500">{player2Bets.length} paris</p>
            </div>
          </div>
        </div>

        {totalPool > 0 && (
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Pool total</span>
              <span className="text-2xl font-bold text-xbox-green">{totalPool} coins</span>
            </div>
            <div className="mt-2 h-2 bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-xbox-green"
                style={{ width: `${totalPool > 0 ? (player1Total / totalPool) * 100 : 50}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{player1Total > 0 ? Math.round((player1Total / totalPool) * 100) : 0}%</span>
              <span>{player2Total > 0 ? Math.round((player2Total / totalPool) * 100) : 0}%</span>
            </div>
          </div>
        )}

        {/* Section des 3 types de paris */}
        {user && match.status === 'PENDING' && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Tes paris</h3>
              <p className="text-sm text-gray-400">Solde: {user.balance} coins</p>
            </div>

            {/* PARI 1: Gagnant */}
            {(() => {
              const myBet = match.bets.find(b => b.user?.username === user.username && (b.betType || 'WINNER') === 'WINNER');
              if (myBet) {
                return (
                  <div className="bg-green-900/30 border border-green-600 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">🏆 Gagnant</span>
                      <span className="text-green-400">✓ Parié</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">
                      {myBet.prediction === 'player1' ? match.player1Name : match.player2Name} - {myBet.amount} coins
                    </p>
                  </div>
                );
              }
              return (
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium">🏆 Gagnant</span>
                    <span className="text-xs text-gray-400">Qui va gagner?</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => { setBetType('WINNER'); setSelectedPlayer('player1'); }}
                      className={`flex-1 py-2 px-3 rounded-lg transition text-sm ${
                        betType === 'WINNER' && selectedPlayer === 'player1'
                          ? 'bg-xbox-green text-white'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      {match.player1Name}
                    </button>
                    <button
                      onClick={() => { setBetType('WINNER'); setSelectedPlayer('player2'); }}
                      className={`flex-1 py-2 px-3 rounded-lg transition text-sm ${
                        betType === 'WINNER' && selectedPlayer === 'player2'
                          ? 'bg-xbox-green text-white'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      {match.player2Name}
                    </button>
                  </div>
                  {betType === 'WINNER' && selectedPlayer && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 0))}
                        min="10"
                        max={user.balance}
                        className="input flex-1 text-sm"
                        placeholder="Mise"
                      />
                      <button onClick={handleBet} disabled={submitting} className="btn-primary px-4 text-sm">
                        {submitting ? '...' : 'Parier'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* PARI 2: Match serré */}
            {(() => {
              const myBet = match.bets.find(b => b.user?.username === user.username && b.betType === 'CLOSE_MATCH');
              const threshold = GAME_THRESHOLDS[match.game] || GAME_THRESHOLDS.OTHER;
              if (myBet) {
                return (
                  <div className="bg-green-900/30 border border-green-600 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">🤝 Match serré</span>
                      <span className="text-green-400">✓ Parié</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">
                      {myBet.prediction === 'yes' ? 'Oui' : 'Non'} - {myBet.amount} coins
                    </p>
                  </div>
                );
              }
              return (
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium">🤝 Match serré</span>
                    <span className="text-xs text-gray-400">Écart ≤ {threshold.closeMatch} {threshold.unit}?</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => { setBetType('CLOSE_MATCH'); setSpecialBetPrediction('yes'); setSelectedPlayer(null); }}
                      className={`flex-1 py-2 px-3 rounded-lg transition text-sm ${
                        betType === 'CLOSE_MATCH' && specialBetPrediction === 'yes'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      ✓ Oui
                    </button>
                    <button
                      onClick={() => { setBetType('CLOSE_MATCH'); setSpecialBetPrediction('no'); setSelectedPlayer(null); }}
                      className={`flex-1 py-2 px-3 rounded-lg transition text-sm ${
                        betType === 'CLOSE_MATCH' && specialBetPrediction === 'no'
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      ✗ Non
                    </button>
                  </div>
                  {betType === 'CLOSE_MATCH' && specialBetPrediction && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 0))}
                        min="10"
                        max={user.balance}
                        className="input flex-1 text-sm"
                        placeholder="Mise"
                      />
                      <button onClick={handleBet} disabled={submitting} className="btn-primary px-4 text-sm">
                        {submitting ? '...' : 'Parier'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* PARI 3: Haut score */}
            {(() => {
              const myBet = match.bets.find(b => b.user?.username === user.username && b.betType === 'HIGH_SCORE');
              const threshold = GAME_THRESHOLDS[match.game] || GAME_THRESHOLDS.OTHER;
              if (myBet) {
                return (
                  <div className="bg-green-900/30 border border-green-600 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">🔥 Haut score</span>
                      <span className="text-green-400">✓ Parié</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">
                      {myBet.prediction === 'yes' ? 'Oui' : 'Non'} - {myBet.amount} coins
                    </p>
                  </div>
                );
              }
              return (
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium">🔥 Haut score</span>
                    <span className="text-xs text-gray-400">Total ≥ {threshold.highScore} {threshold.unit}?</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => { setBetType('HIGH_SCORE'); setSpecialBetPrediction('yes'); setSelectedPlayer(null); }}
                      className={`flex-1 py-2 px-3 rounded-lg transition text-sm ${
                        betType === 'HIGH_SCORE' && specialBetPrediction === 'yes'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      ✓ Oui
                    </button>
                    <button
                      onClick={() => { setBetType('HIGH_SCORE'); setSpecialBetPrediction('no'); setSelectedPlayer(null); }}
                      className={`flex-1 py-2 px-3 rounded-lg transition text-sm ${
                        betType === 'HIGH_SCORE' && specialBetPrediction === 'no'
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      ✗ Non
                    </button>
                  </div>
                  {betType === 'HIGH_SCORE' && specialBetPrediction && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 0))}
                        min="10"
                        max={user.balance}
                        className="input flex-1 text-sm"
                        placeholder="Mise"
                      />
                      <button onClick={handleBet} disabled={submitting} className="btn-primary px-4 text-sm">
                        {submitting ? '...' : 'Parier'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            <p className="text-xs text-gray-500 text-center">Tu peux parier sur les 3 types! Gain x2 sur chaque pari gagné</p>
          </div>
        )}

        {/* Section de soumission de score (double confirmation) */}
        {isPlayer && match.status !== 'COMPLETED' && match.status !== 'CANCELLED' && (
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              📊 Soumettre le résultat
              <span className="text-xs bg-blue-600 px-2 py-1 rounded">Double confirmation</span>
            </h3>

            {match.scoreDispute && (
              <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 mb-4">
                <p className="text-red-400 font-medium">⚠️ Conflit de scores!</p>
                <p className="text-sm text-gray-300 mt-1">
                  Les scores soumis ne correspondent pas. Un administrateur doit vérifier.
                </p>
                {match.player1SubmittedP1Score !== undefined && (
                  <p className="text-xs text-gray-400 mt-2">
                    {match.player1HumanName || 'Joueur 1'}: {match.player1SubmittedP1Score} - {match.player1SubmittedP2Score}
                  </p>
                )}
                {match.player2SubmittedP1Score !== undefined && (
                  <p className="text-xs text-gray-400">
                    {match.player2HumanName || 'Joueur 2'}: {match.player2SubmittedP1Score} - {match.player2SubmittedP2Score}
                  </p>
                )}
              </div>
            )}

            {!match.scoreDispute && (
              <>
                <div className="flex gap-4 mb-4">
                  <div className={`flex-1 p-3 rounded-lg border-2 ${player1HasSubmitted ? 'border-green-500 bg-green-900/30' : 'border-gray-600'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{match.player1HumanName || 'Joueur 1'}</span>
                      {player1HasSubmitted ? (
                        <span className="text-green-400 text-xs">✓ Soumis</span>
                      ) : (
                        <span className="text-yellow-400 text-xs">En attente</span>
                      )}
                    </div>
                  </div>
                  <div className={`flex-1 p-3 rounded-lg border-2 ${player2HasSubmitted ? 'border-green-500 bg-green-900/30' : 'border-gray-600'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{match.player2HumanName || 'Joueur 2'}</span>
                      {player2HasSubmitted ? (
                        <span className="text-green-400 text-xs">✓ Soumis</span>
                      ) : (
                        <span className="text-yellow-400 text-xs">En attente</span>
                      )}
                    </div>
                  </div>
                </div>

                {canSubmitScore && !showSubmitScore && (
                  <button
                    onClick={() => setShowSubmitScore(true)}
                    className="btn-primary w-full"
                  >
                    Soumettre mon score
                  </button>
                )}

                {userHasSubmitted && !player1HasSubmitted && !player2HasSubmitted && (
                  <p className="text-sm text-gray-400 text-center">
                    Tu as soumis ton score. En attente de l'adversaire...
                  </p>
                )}

                {userHasSubmitted && (
                  <p className="text-sm text-green-400 text-center">
                    ✓ Tu as déjà soumis ton score
                  </p>
                )}

                {showSubmitScore && (
                  <div className="mt-4 p-4 bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-300 mb-3">
                      Entre le score final du match. Si l'autre joueur entre le même score, le match sera validé automatiquement.
                    </p>
                    <div className="flex gap-4 items-center mb-4">
                      <div className="flex-1 text-center">
                        <p className="text-sm text-gray-400 mb-2">{match.player1Name}</p>
                        <input
                          type="number"
                          value={submitP1Score}
                          onChange={(e) => setSubmitP1Score(e.target.value)}
                          min="0"
                          className="input text-center text-2xl"
                        />
                      </div>
                      <span className="text-xl text-gray-500">-</span>
                      <div className="flex-1 text-center">
                        <p className="text-sm text-gray-400 mb-2">{match.player2Name}</p>
                        <input
                          type="number"
                          value={submitP2Score}
                          onChange={(e) => setSubmitP2Score(e.target.value)}
                          min="0"
                          className="input text-center text-2xl"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={handleSubmitScore}
                        disabled={submitting}
                        className="btn-primary flex-1"
                      >
                        {submitting ? 'Envoi...' : 'Confirmer le score'}
                      </button>
                      <button
                        onClick={() => setShowSubmitScore(false)}
                        className="btn-secondary"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-gray-500 mt-3 text-center">
              Les deux joueurs doivent soumettre le même score pour valider le match
            </p>
          </div>
        )}

        {/* Section OCR - Détection automatique du score */}
        {isCreator && match.status !== 'COMPLETED' && match.status !== 'CANCELLED' && (
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/50 rounded-lg p-4 mb-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <span className="text-xl">📺</span>
              Détection automatique du score
              {match.ocrEnabled && (
                <span className="text-xs bg-green-600 px-2 py-1 rounded animate-pulse">EN DIRECT</span>
              )}
            </h3>

            {!match.ocrEnabled ? (
              // Formulaire pour activer l'OCR
              <div>
                <p className="text-sm text-gray-300 mb-3">
                  Active la détection OCR pour suivre le score automatiquement depuis ton stream Twitch.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={twitchChannel}
                    onChange={(e) => setTwitchChannel(e.target.value)}
                    placeholder="Nom du channel Twitch"
                    className="input flex-1"
                  />
                  <button
                    onClick={handleEnableOcr}
                    disabled={enablingOcr}
                    className="btn-primary"
                  >
                    {enablingOcr ? 'Activation...' : 'Activer OCR'}
                  </button>
                </div>
                {user?.twitchUsername && (
                  <button
                    onClick={() => setTwitchChannel(user.twitchUsername)}
                    className="text-xs text-purple-400 hover:text-purple-300 mt-2"
                  >
                    Utiliser mon compte: {user.twitchUsername}
                  </button>
                )}
              </div>
            ) : (
              // Affichage du score OCR en temps réel
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-400">Channel:</span>
                  <a
                    href={`https://twitch.tv/${match.twitchChannel}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 font-medium"
                  >
                    {match.twitchChannel}
                  </a>
                  <button
                    onClick={handleDisableOcr}
                    className="ml-auto text-xs text-red-400 hover:text-red-300"
                  >
                    Désactiver OCR
                  </button>
                </div>

                {/* Score détecté */}
                <div className="bg-gray-800/80 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Score détecté par OCR</span>
                    {ocrData?.confidence && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        ocrData.confidence > 0.8 ? 'bg-green-600' :
                        ocrData.confidence > 0.5 ? 'bg-yellow-600' : 'bg-red-600'
                      }`}>
                        {Math.round(ocrData.confidence * 100)}% confiance
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-6 py-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-400 mb-1">{match.player1Name}</p>
                      <p className="text-5xl font-bold text-xbox-green">
                        {match.ocrScore1 ?? '-'}
                      </p>
                    </div>
                    <div className="text-2xl text-gray-500">-</div>
                    <div className="text-center">
                      <p className="text-sm text-gray-400 mb-1">{match.player2Name}</p>
                      <p className="text-5xl font-bold text-xbox-green">
                        {match.ocrScore2 ?? '-'}
                      </p>
                    </div>
                  </div>

                  {/* Période et temps */}
                  {(match.ocrPeriod || match.ocrTime) && (
                    <div className="flex items-center justify-center gap-4 text-gray-300">
                      {match.ocrPeriod && (
                        <span className="bg-gray-700 px-3 py-1 rounded">
                          {periodLabels[match.ocrPeriod] || `P${match.ocrPeriod}`} période
                        </span>
                      )}
                      {match.ocrTime && (
                        <span className="font-mono text-lg">{match.ocrTime}</span>
                      )}
                    </div>
                  )}

                  {match.ocrLastUpdate && (
                    <p className="text-xs text-gray-500 text-center mt-3">
                      Dernière mise à jour: {new Date(match.ocrLastUpdate).toLocaleTimeString()}
                    </p>
                  )}
                </div>

                {/* Actions OCR */}
                {match.ocrScore1 !== null && match.ocrScore2 !== null && (
                  <div className="flex gap-3">
                    <button
                      onClick={handleApplyOcrScore}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition"
                    >
                      Soumettre ce score
                    </button>
                    <button
                      onClick={handleFinalizeWithOcr}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition"
                    >
                      Finaliser le match
                    </button>
                  </div>
                )}

                <p className="text-xs text-gray-500 text-center mt-3">
                  Le score est détecté automatiquement toutes les 30 secondes depuis le stream
                </p>
              </div>
            )}
          </div>
        )}

        {canSetResult && !showScoreForm && (
          <div className="flex gap-4 mb-6">
            <button onClick={() => setShowScoreForm(true)} className="btn-primary flex-1">
              Entrer le résultat (admin)
            </button>
            <button onClick={handleCancel} className="btn-secondary">
              Annuler le match
            </button>
          </div>
        )}

        {showScoreForm && (
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <h3 className="font-bold mb-4">Entrer le score final</h3>
            <div className="flex gap-4 items-center mb-4">
              <div className="flex-1 text-center">
                <p className="text-sm text-gray-400 mb-2">{match.player1Name}</p>
                <input
                  type="number"
                  value={player1Score}
                  onChange={(e) => setPlayer1Score(e.target.value)}
                  min="0"
                  className="input text-center text-2xl"
                />
              </div>
              <span className="text-xl text-gray-500">-</span>
              <div className="flex-1 text-center">
                <p className="text-sm text-gray-400 mb-2">{match.player2Name}</p>
                <input
                  type="number"
                  value={player2Score}
                  onChange={(e) => setPlayer2Score(e.target.value)}
                  min="0"
                  className="input text-center text-2xl"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={handleSetResult} disabled={submitting} className="btn-primary flex-1">
                Valider le résultat
              </button>
              <button onClick={() => setShowScoreForm(false)} className="btn-secondary">
                Annuler
              </button>
            </div>
          </div>
        )}

        {match.bets.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold mb-4">Paris ({match.bets.length})</h3>
            <div className="space-y-2">
              {match.bets.map(bet => {
                const type = bet.betType || 'WINNER';
                let predictionLabel;
                if (type === 'WINNER') {
                  predictionLabel = bet.prediction === 'player1' ? match.player1Name : match.player2Name;
                } else {
                  predictionLabel = bet.prediction === 'yes' ? 'Oui' : 'Non';
                }
                return (
                  <div key={bet.id} className="flex justify-between items-center bg-gray-700 rounded-lg p-3">
                    <span>{bet.user?.username}</span>
                    <span className="text-xs px-2 py-1 rounded bg-gray-600">{betTypeLabels[type]}</span>
                    <span className={
                      type === 'WINNER'
                        ? (bet.prediction === 'player1' ? 'text-blue-400' : 'text-orange-400')
                        : (bet.prediction === 'yes' ? 'text-green-400' : 'text-red-400')
                    }>
                      {predictionLabel}
                    </span>
                    <span className="text-xbox-green font-bold">{bet.amount} coins</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
