import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GameBadge from '../components/GameBadge';

const statusLabels = {
  REGISTRATION: 'Inscriptions ouvertes',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé'
};

const statusColors = {
  REGISTRATION: 'bg-blue-600',
  IN_PROGRESS: 'bg-green-600',
  COMPLETED: 'bg-gray-600',
  CANCELLED: 'bg-red-600'
};

export default function Tournaments() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      const res = await api.get('/tournaments');
      setTournaments(res.data);
    } catch (error) {
      console.error('Error fetching tournaments:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tournois</h1>
        {user && (
          <Link to="/tournaments/create" className="btn-primary">
            Créer un tournoi
          </Link>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">Aucun tournoi disponible</p>
          {user && (
            <Link to="/tournaments/create" className="btn-primary">
              Créer le premier tournoi
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {tournaments.map(tournament => (
            <Link
              key={tournament.id}
              to={`/tournaments/${tournament.id}`}
              className="card hover:bg-gray-750 transition block"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <GameBadge game={tournament.game} />
                  <h2 className="text-xl font-bold">{tournament.name}</h2>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[tournament.status]}`}>
                  {statusLabels[tournament.status]}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-400">
                <div className="flex gap-6">
                  <span>
                    {tournament.participants.length}/{tournament.size} équipes
                  </span>
                  {tournament.entryFee > 0 && (
                    <span>Entrée: {tournament.entryFee} coins</span>
                  )}
                </div>
                {tournament.winnerId && (
                  <span className="text-xbox-green font-bold">
                    Champion: {tournament.winnerId}
                  </span>
                )}
              </div>

              {tournament.status === 'REGISTRATION' && (
                <div className="mt-4">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-xbox-green transition-all"
                      style={{ width: `${(tournament.participants.length / tournament.size) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
