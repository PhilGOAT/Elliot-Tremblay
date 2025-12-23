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

const difficulties = [
  { value: 'ROOKIE', label: 'Rookie' },
  { value: 'PRO', label: 'Pro' },
  { value: 'ALL_PRO', label: 'All-Pro' },
  { value: 'ALL_MADDEN', label: 'All-Madden' }
];

export default function CreateMatch() {
  const navigate = useNavigate();
  const [game, setGame] = useState('MADDEN');
  const [player1Name, setPlayer1Name] = useState('');
  const [player2Name, setPlayer2Name] = useState('');
  const [player1Type, setPlayer1Type] = useState('HUMAN');
  const [player2Type, setPlayer2Type] = useState('CPU');
  const [player1Difficulty, setPlayer1Difficulty] = useState('PRO');
  const [player2Difficulty, setPlayer2Difficulty] = useState('PRO');
  const [player1HumanName, setPlayer1HumanName] = useState('');
  const [player2HumanName, setPlayer2HumanName] = useState('');
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
        player2Name: player2Name.trim(),
        player1Type,
        player2Type,
        player1Difficulty: player1Type === 'CPU' ? player1Difficulty : null,
        player2Difficulty: player2Type === 'CPU' ? player2Difficulty : null,
        player1HumanName: player1Type === 'HUMAN' ? player1HumanName.trim() : null,
        player2HumanName: player2Type === 'HUMAN' ? player2HumanName.trim() : null
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

          {/* Joueur 1 */}
          <div className="bg-gray-700 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Joueur / Équipe 1
            </label>
            <input
              type="text"
              value={player1Name}
              onChange={(e) => setPlayer1Name(e.target.value)}
              className="input mb-3"
              placeholder="Ex: Patriots, Chiefs..."
              required
            />
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setPlayer1Type('HUMAN')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  player1Type === 'HUMAN'
                    ? 'bg-xbox-green text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                👤 Humain
              </button>
              <button
                type="button"
                onClick={() => setPlayer1Type('CPU')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  player1Type === 'CPU'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                🤖 CPU
              </button>
            </div>
            {player1Type === 'HUMAN' && (
              <input
                type="text"
                value={player1HumanName}
                onChange={(e) => setPlayer1HumanName(e.target.value)}
                className="input"
                placeholder="Nom du joueur (ex: Phil, Alex...)"
              />
            )}
            {player1Type === 'CPU' && (
              <select
                value={player1Difficulty}
                onChange={(e) => setPlayer1Difficulty(e.target.value)}
                className="input"
              >
                {difficulties.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Joueur 2 */}
          <div className="bg-gray-700 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Joueur / Équipe 2
            </label>
            <input
              type="text"
              value={player2Name}
              onChange={(e) => setPlayer2Name(e.target.value)}
              className="input mb-3"
              placeholder="Ex: Chiefs, Cowboys..."
              required
            />
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setPlayer2Type('HUMAN')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  player2Type === 'HUMAN'
                    ? 'bg-xbox-green text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                👤 Humain
              </button>
              <button
                type="button"
                onClick={() => setPlayer2Type('CPU')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                  player2Type === 'CPU'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                🤖 CPU
              </button>
            </div>
            {player2Type === 'HUMAN' && (
              <input
                type="text"
                value={player2HumanName}
                onChange={(e) => setPlayer2HumanName(e.target.value)}
                className="input"
                placeholder="Nom du joueur (ex: Phil, Alex...)"
              />
            )}
            {player2Type === 'CPU' && (
              <select
                value={player2Difficulty}
                onChange={(e) => setPlayer2Difficulty(e.target.value)}
                className="input"
              >
                {difficulties.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            )}
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
