import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import MatchCard from '../components/MatchCard';
import { useAuth } from '../context/AuthContext';

const games = [
  { value: '', label: 'Tous les jeux' },
  { value: 'MADDEN', label: 'Madden NFL' },
  { value: 'NHL', label: 'NHL' },
  { value: 'FIFA', label: 'EA FC' },
  { value: 'NBA2K', label: 'NBA 2K' },
  { value: 'MLB', label: 'MLB The Show' },
  { value: 'UFC', label: 'UFC' }
];

const statuses = [
  { value: '', label: 'Tous les statuts' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'LIVE', label: 'En cours' },
  { value: 'COMPLETED', label: 'Terminés' }
];

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gameFilter, setGameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    fetchMatches();
  }, [gameFilter, statusFilter]);

  const fetchMatches = async () => {
    try {
      const params = new URLSearchParams();
      if (gameFilter) params.append('game', gameFilter);
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get(`/matches?${params}`);
      setMatches(res.data);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Matchs</h1>
        {user && (
          <Link to="/matches/create" className="btn-primary">
            + Créer un match
          </Link>
        )}
      </div>

      <div className="flex gap-4 mb-6">
        <select
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          className="input max-w-xs"
        >
          {games.map(game => (
            <option key={game.value} value={game.value}>{game.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input max-w-xs"
        >
          {statuses.map(status => (
            <option key={status.value} value={status.value}>{status.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
        </div>
      ) : matches.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg">Aucun match trouvé</p>
          {user && (
            <Link to="/matches/create" className="btn-primary mt-4 inline-block">
              Créer le premier match
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {matches.map(match => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
