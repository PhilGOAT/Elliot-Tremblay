import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import GameBadge from '../components/GameBadge';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const statusLabels = {
  PENDING: 'En attente',
  WON: 'Gagné',
  LOST: 'Perdu',
  REFUNDED: 'Remboursé'
};

const statusColors = {
  PENDING: 'text-yellow-400 bg-yellow-400/20',
  WON: 'text-green-400 bg-green-400/20',
  LOST: 'text-red-400 bg-red-400/20',
  REFUNDED: 'text-blue-400 bg-blue-400/20'
};

export default function MyBets() {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { refreshUser } = useAuth();

  useEffect(() => {
    fetchBets();
  }, []);

  const fetchBets = async () => {
    try {
      const res = await api.get('/bets/my');
      setBets(res.data);
    } catch (error) {
      console.error('Error fetching bets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (betId) => {
    if (!confirm('Annuler ce pari?')) return;

    try {
      await api.delete(`/bets/${betId}`);
      toast.success('Pari annulé et remboursé');
      await Promise.all([fetchBets(), refreshUser()]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    }
  };

  const totalWon = bets.filter(b => b.status === 'WON').reduce((sum, b) => sum + (b.payout || 0), 0);
  const totalLost = bets.filter(b => b.status === 'LOST').reduce((sum, b) => sum + b.amount, 0);
  const pendingAmount = bets.filter(b => b.status === 'PENDING').reduce((sum, b) => sum + b.amount, 0);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Mes Paris</h1>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-gray-400 text-sm">Gains totaux</p>
          <p className="text-2xl font-bold text-green-400">+{totalWon} coins</p>
        </div>
        <div className="card">
          <p className="text-gray-400 text-sm">Pertes totales</p>
          <p className="text-2xl font-bold text-red-400">-{totalLost} coins</p>
        </div>
        <div className="card">
          <p className="text-gray-400 text-sm">En attente</p>
          <p className="text-2xl font-bold text-yellow-400">{pendingAmount} coins</p>
        </div>
      </div>

      {bets.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg mb-4">Vous n'avez pas encore placé de paris</p>
          <Link to="/matches" className="btn-primary inline-block">
            Voir les matchs
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bets.map(bet => (
            <div key={bet.id} className="card">
              <div className="flex items-center justify-between mb-4">
                <GameBadge game={bet.match.game} />
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[bet.status]}`}>
                  {statusLabels[bet.status]}
                </span>
              </div>

              <Link to={`/matches/${bet.match.id}`} className="block hover:opacity-80">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg">
                      <span className={bet.prediction === 'player1' ? 'text-xbox-green font-bold' : ''}>
                        {bet.match.player1Name}
                      </span>
                      {' vs '}
                      <span className={bet.prediction === 'player2' ? 'text-xbox-green font-bold' : ''}>
                        {bet.match.player2Name}
                      </span>
                    </p>
                    <p className="text-sm text-gray-400">
                      Pari sur: {bet.prediction === 'player1' ? bet.match.player1Name : bet.match.player2Name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{bet.amount} coins</p>
                    {bet.status === 'WON' && (
                      <p className="text-green-400 font-bold">+{bet.payout} coins</p>
                    )}
                  </div>
                </div>
              </Link>

              {bet.status === 'PENDING' && bet.match.status === 'PENDING' && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => handleCancel(bet.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Annuler ce pari
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
