import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GameBadge from '../components/GameBadge';
import toast from 'react-hot-toast';

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

  useEffect(() => {
    fetchMatch();
  }, [id]);

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

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
      </div>
    );
  }

  if (!match) return null;

  // Vérifier si l'utilisateur peut parier sur ce type de pari
  const hasAlreadyBetThisType = match.bets.some(
    b => b.user?.username === user?.username && (b.betType || 'WINNER') === betType
  );

  const canBet = user && match.status === 'PENDING' && !hasAlreadyBetThisType;

  const isCreator = user && match.createdBy === user.id;
  const canSetResult = isCreator && match.status !== 'COMPLETED' && match.status !== 'CANCELLED';

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
          <button
            onClick={() => canBet && setSelectedPlayer('player1')}
            disabled={!canBet}
            className={`flex-1 p-6 rounded-xl border-2 transition text-center ${
              selectedPlayer === 'player1'
                ? 'border-xbox-green bg-xbox-green/20'
                : canBet
                  ? 'border-gray-600 hover:border-gray-500'
                  : 'border-gray-700 opacity-60'
            } ${match.winnerId === 'player1' ? 'ring-2 ring-xbox-green' : ''}`}
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
          </button>

          <div className="flex items-center">
            <span className="text-3xl text-gray-500 font-bold">VS</span>
          </div>

          <button
            onClick={() => canBet && setSelectedPlayer('player2')}
            disabled={!canBet}
            className={`flex-1 p-6 rounded-xl border-2 transition text-center ${
              selectedPlayer === 'player2'
                ? 'border-xbox-green bg-xbox-green/20'
                : canBet
                  ? 'border-gray-600 hover:border-gray-500'
                  : 'border-gray-700 opacity-60'
            } ${match.winnerId === 'player2' ? 'ring-2 ring-xbox-green' : ''}`}
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
          </button>
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

        {/* Sélecteur de type de pari */}
        {user && match.status === 'PENDING' && (
          <div className="mb-6">
            <h3 className="font-bold mb-3">Type de pari</h3>
            <div className="flex gap-2">
              {['WINNER', 'CLOSE_MATCH', 'HIGH_SCORE'].map(type => {
                const alreadyBet = match.bets.some(
                  b => b.user?.username === user.username && (b.betType || 'WINNER') === type
                );
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setBetType(type);
                      setSelectedPlayer(null);
                      setSpecialBetPrediction(null);
                    }}
                    disabled={alreadyBet}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
                      betType === type
                        ? 'bg-xbox-green text-white'
                        : alreadyBet
                          ? 'bg-gray-600 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {betTypeLabels[type]}
                    {alreadyBet && ' ✓'}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-gray-500 mt-2">{getBetTypeDescription(betType, match.game)}</p>
          </div>
        )}

        {/* Paris spéciaux (Close Match / High Score) */}
        {canBet && betType !== 'WINNER' && (
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <h3 className="font-bold mb-3">
              {getBetTypeDescription(betType, match.game)}
            </h3>
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setSpecialBetPrediction('yes')}
                className={`flex-1 py-4 rounded-lg font-bold text-lg transition ${
                  specialBetPrediction === 'yes'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                ✓ Oui
              </button>
              <button
                onClick={() => setSpecialBetPrediction('no')}
                className={`flex-1 py-4 rounded-lg font-bold text-lg transition ${
                  specialBetPrediction === 'no'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                ✗ Non
              </button>
            </div>
            {specialBetPrediction && (
              <div className="flex gap-4">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 0))}
                  min="10"
                  max={user?.balance || 0}
                  className="input flex-1"
                />
                <button
                  onClick={handleBet}
                  disabled={submitting}
                  className="btn-primary px-8"
                >
                  {submitting ? 'Envoi...' : 'Parier'}
                </button>
              </div>
            )}
            <p className="text-sm text-gray-400 mt-2">
              Solde: {user?.balance || 0} coins | Gain x2 si tu gagnes
            </p>
          </div>
        )}

        {/* Pari sur le gagnant */}
        {canBet && betType === 'WINNER' && selectedPlayer && (
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <h3 className="font-bold mb-3">Parier sur {selectedPlayer === 'player1' ? match.player1Name : match.player2Name}</h3>
            <div className="flex gap-4">
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 0))}
                min="10"
                max={user?.balance || 0}
                className="input flex-1"
              />
              <button
                onClick={handleBet}
                disabled={submitting}
                className="btn-primary px-8"
              >
                {submitting ? 'Envoi...' : 'Parier'}
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Solde: {user?.balance || 0} coins | Gain x2 si tu gagnes
            </p>
          </div>
        )}

        {canBet && betType === 'WINNER' && !selectedPlayer && (
          <div className="bg-gray-700 rounded-lg p-4 mb-6 text-center">
            <p className="text-gray-400">Clique sur une équipe pour parier</p>
          </div>
        )}

        {canSetResult && !showScoreForm && (
          <div className="flex gap-4 mb-6">
            <button onClick={() => setShowScoreForm(true)} className="btn-primary flex-1">
              Entrer le résultat
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
