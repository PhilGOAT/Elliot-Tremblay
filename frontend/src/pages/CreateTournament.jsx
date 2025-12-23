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

const sizes = [
  { value: 4, label: '4 équipes' },
  { value: 8, label: '8 équipes' },
  { value: 16, label: '16 équipes' }
];

export default function CreateTournament() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [game, setGame] = useState('MADDEN');
  const [size, setSize] = useState(8);
  const [entryFee, setEntryFee] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Entrez un nom de tournoi');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/tournaments', {
        name: name.trim(),
        game,
        size,
        entryFee
      });
      toast.success('Tournoi créé!');
      navigate(`/tournaments/${res.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="card">
        <h1 className="text-2xl font-bold text-center mb-6">Créer un tournoi</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nom du tournoi
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Ex: Super Bowl Tournament"
              required
            />
          </div>

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
              Nombre d'équipes
            </label>
            <div className="flex gap-2">
              {sizes.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSize(s.value)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                    size === s.value
                      ? 'bg-xbox-green text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Frais d'entrée (optionnel)
            </label>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(Math.max(0, parseInt(e.target.value) || 0))}
              min="0"
              className="input"
              placeholder="0 coins"
            />
            <p className="text-xs text-gray-500 mt-1">
              0 = gratuit
            </p>
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Création...' : 'Créer le tournoi'}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-4">
          Les joueurs pourront s'inscrire après la création
        </p>
      </div>
    </div>
  );
}
