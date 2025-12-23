import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GameBadge from '../components/GameBadge';
import toast from 'react-hot-toast';

const roundNames = {
  1: 'Finale',
  2: 'Demi-finales',
  3: 'Quarts de finale',
  4: 'Huitièmes de finale'
};

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerType, setPlayerType] = useState('HUMAN');
  const [submitting, setSubmitting] = useState(false);
  const [scoreModal, setScoreModal] = useState(null);
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);

  useEffect(() => {
    fetchTournament();
  }, [id]);

  const fetchTournament = async () => {
    try {
      const res = await api.get(`/tournaments/${id}`);
      setTournament(res.data);
    } catch (error) {
      toast.error('Tournoi non trouvé');
      navigate('/tournaments');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!teamName.trim()) {
      toast.error('Entrez un nom d\'équipe');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/tournaments/${id}/participants`, {
        teamName: teamName.trim(),
        playerName: playerType === 'HUMAN' ? playerName.trim() : null,
        playerType
      });
      toast.success('Inscription réussie!');
      setTeamName('');
      setPlayerName('');
      fetchTournament();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = async () => {
    try {
      await api.post(`/tournaments/${id}/start`);
      toast.success('Tournoi démarré!');
      fetchTournament();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    }
  };

  const handleSetResult = async () => {
    setSubmitting(true);
    try {
      await api.patch(`/tournaments/${id}/matches/${scoreModal.id}/result`, {
        team1Score: parseInt(team1Score),
        team2Score: parseInt(team2Score)
      });
      toast.success('Résultat enregistré!');
      setScoreModal(null);
      fetchTournament();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
      </div>
    );
  }

  if (!tournament) return null;

  const isCreator = user && tournament.createdBy === user.id;
  const canJoin = user && tournament.status === 'REGISTRATION' && tournament.participants.length < tournament.size;
  const canStart = isCreator && tournament.status === 'REGISTRATION' && tournament.participants.length === tournament.size;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <GameBadge game={tournament.game} />
            <h1 className="text-2xl font-bold">{tournament.name}</h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            tournament.status === 'REGISTRATION' ? 'bg-blue-600' :
            tournament.status === 'IN_PROGRESS' ? 'bg-green-600' :
            tournament.status === 'COMPLETED' ? 'bg-gray-600' : 'bg-red-600'
          }`}>
            {tournament.status === 'REGISTRATION' && 'Inscriptions ouvertes'}
            {tournament.status === 'IN_PROGRESS' && 'En cours'}
            {tournament.status === 'COMPLETED' && 'Terminé'}
            {tournament.status === 'CANCELLED' && 'Annulé'}
          </span>
        </div>

        <div className="flex gap-6 text-gray-400 mb-4">
          <span>{tournament.size} équipes</span>
          {tournament.entryFee > 0 && <span>Entrée: {tournament.entryFee} coins</span>}
        </div>

        {tournament.winnerId && (
          <div className="bg-xbox-green/20 border border-xbox-green rounded-lg p-4 text-center">
            <p className="text-sm text-gray-400">Champion</p>
            <p className="text-2xl font-bold text-xbox-green">{tournament.winnerId}</p>
          </div>
        )}
      </div>

      {/* Participants */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">
          Participants ({tournament.participants.length}/{tournament.size})
        </h2>

        {tournament.participants.length === 0 ? (
          <p className="text-gray-400">Aucun participant pour le moment</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {tournament.participants.map((p, i) => (
              <div
                key={p.id}
                className={`p-3 rounded-lg border ${
                  p.eliminated
                    ? 'border-red-600/50 bg-red-900/20 opacity-60'
                    : tournament.winnerId === p.teamName
                      ? 'border-xbox-green bg-xbox-green/20'
                      : 'border-gray-600 bg-gray-700'
                }`}
              >
                <p className="font-bold text-sm">
                  {p.playerType === 'CPU' ? '🤖' : '👤'} {p.teamName}
                </p>
                {p.playerName && (
                  <p className="text-xs text-gray-400">{p.playerName}</p>
                )}
                <p className="text-xs text-gray-500">Seed #{p.seed}</p>
              </div>
            ))}
          </div>
        )}

        {canJoin && (
          <form onSubmit={handleJoin} className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="font-bold mb-3">Rejoindre le tournoi</h3>
            <div className="grid gap-3">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="input"
                placeholder="Nom de l'équipe (ex: Patriots)"
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPlayerType('HUMAN')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                    playerType === 'HUMAN'
                      ? 'bg-xbox-green text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  👤 Humain
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerType('CPU')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                    playerType === 'CPU'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  🤖 CPU
                </button>
              </div>
              {playerType === 'HUMAN' && (
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="input"
                  placeholder="Nom du joueur (ex: Phil)"
                />
              )}
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Inscription...' : 'S\'inscrire'}
              </button>
            </div>
          </form>
        )}

        {canStart && (
          <div className="mt-6 pt-6 border-t border-gray-700">
            <button onClick={handleStart} className="btn-primary w-full">
              Démarrer le tournoi
            </button>
          </div>
        )}
      </div>

      {/* Bracket */}
      {tournament.rounds.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Bracket</h2>

          <div className="space-y-6">
            {tournament.rounds.map(round => (
              <div key={round.id}>
                <h3 className="text-lg font-bold text-xbox-green mb-3">
                  {roundNames[round.roundNumber] || `Tour ${round.roundNumber}`}
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {round.matches.map(match => (
                    <div
                      key={match.id}
                      className={`bg-gray-700 rounded-lg p-4 ${
                        match.status === 'COMPLETED' ? 'opacity-80' : ''
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={match.winnerId === match.team1Name ? 'text-xbox-green font-bold' : ''}>
                          {match.team1Name || 'TBD'}
                        </span>
                        <span className="text-xl font-bold">
                          {match.team1Score ?? '-'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={match.winnerId === match.team2Name ? 'text-xbox-green font-bold' : ''}>
                          {match.team2Name || 'TBD'}
                        </span>
                        <span className="text-xl font-bold">
                          {match.team2Score ?? '-'}
                        </span>
                      </div>
                      {isCreator && match.team1Name && match.team2Name && match.status !== 'COMPLETED' && (
                        <button
                          onClick={() => {
                            setScoreModal(match);
                            setTeam1Score(0);
                            setTeam2Score(0);
                          }}
                          className="btn-primary w-full mt-3 text-sm"
                        >
                          Entrer le score
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score Modal */}
      {scoreModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Entrer le score</h3>
            <div className="flex gap-4 items-center mb-4">
              <div className="flex-1 text-center">
                <p className="text-sm text-gray-400 mb-2">{scoreModal.team1Name}</p>
                <input
                  type="number"
                  value={team1Score}
                  onChange={(e) => setTeam1Score(e.target.value)}
                  min="0"
                  className="input text-center text-2xl"
                />
              </div>
              <span className="text-xl text-gray-500">-</span>
              <div className="flex-1 text-center">
                <p className="text-sm text-gray-400 mb-2">{scoreModal.team2Name}</p>
                <input
                  type="number"
                  value={team2Score}
                  onChange={(e) => setTeam2Score(e.target.value)}
                  min="0"
                  className="input text-center text-2xl"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSetResult} disabled={submitting} className="btn-primary flex-1">
                Valider
              </button>
              <button onClick={() => setScoreModal(null)} className="btn-secondary">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
