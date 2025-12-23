import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

const games = [
  { value: 'MADDEN', label: 'Madden NFL' },
  { value: 'NHL', label: 'NHL' },
  { value: 'FIFA', label: 'EA FC (FIFA)' },
  { value: 'NBA2K', label: 'NBA 2K' },
  { value: 'MLB', label: 'MLB The Show' },
  { value: 'UFC', label: 'UFC' },
  { value: 'OTHER', label: 'Autre jeu' }
];

export default function CreateMatch() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [game, setGame] = useState('MADDEN');
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/users').then(res => setUsers(res.data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!player1Id || !player2Id) {
      toast.error('Sélectionnez les deux joueurs');
      return;
    }

    if (player1Id === player2Id) {
      toast.error('Les joueurs doivent être différents');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/matches', {
        game,
        player1Id,
        player2Id
      });
      toast.success('Match créé!');
      navigate(`/matches/${res.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="card">
        <h1 className="text-2xl font-bold text-center mb-6">Créer un match</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Jeu
            </label>
            <select
              value={game}
              onChange={(e) => setGame(e.target.value)}
              className="input"
            >
              {games.map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Joueur 1
            </label>
            <select
              value={player1Id}
              onChange={(e) => setPlayer1Id(e.target.value)}
              className="input"
              required
            >
              <option value="">Sélectionner un joueur</option>
              {users.filter(u => u.id !== player2Id).map(user => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Joueur 2
            </label>
            <select
              value={player2Id}
              onChange={(e) => setPlayer2Id(e.target.value)}
              className="input"
              required
            >
              <option value="">Sélectionner un joueur</option>
              {users.filter(u => u.id !== player1Id).map(user => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Création...' : 'Créer le match'}
          </button>
        </form>
      </div>
    </div>
  );
}
