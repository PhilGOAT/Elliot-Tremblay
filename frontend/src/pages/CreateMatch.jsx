import { useState } from 'react';
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
  const [game, setGame] = useState('MADDEN');
  const [player1Name, setPlayer1Name] = useState('');
  const [player2Name, setPlayer2Name] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!player1Name.trim() || !player2Name.trim()) {
      toast.error('Entrez les noms des deux équipes/joueurs');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/matches', {
        game,
        player1Name: player1Name.trim(),
        player2Name: player2Name.trim()
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
              Équipe / Joueur 1
            </label>
            <input
              type="text"
              value={player1Name}
              onChange={(e) => setPlayer1Name(e.target.value)}
              className="input"
              placeholder="Ex: Patriots, MonÉquipe, Moi..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Équipe / Joueur 2
            </label>
            <input
              type="text"
              value={player2Name}
              onChange={(e) => setPlayer2Name(e.target.value)}
              className="input"
              placeholder="Ex: Chiefs, Adversaire, CPU..."
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Création...' : 'Créer le match'}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-4">
          Tu pourras parier et entrer le résultat après
        </p>
      </div>
    </div>
  );
}
