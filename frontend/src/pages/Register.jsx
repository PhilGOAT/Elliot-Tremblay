import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const platforms = [
  { key: 'xboxGamertag', label: 'Xbox Live', icon: '🎮', placeholder: 'Gamertag Xbox' },
  { key: 'psnId', label: 'PlayStation', icon: '🎯', placeholder: 'PSN ID' },
  { key: 'eaId', label: 'EA Sports', icon: '⚽', placeholder: 'EA ID (Madden, NHL, FIFA)' },
  { key: 'nintendoId', label: 'Nintendo', icon: '🍄', placeholder: 'Nintendo ID' },
  { key: 'steamName', label: 'Steam', icon: '💻', placeholder: 'Nom Steam' },
  { key: 'twitchUsername', label: 'Twitch', icon: '📺', placeholder: 'Nom Twitch (pour stream)' }
];

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gamertags, setGamertags] = useState({
    xboxGamertag: '',
    psnId: '',
    eaId: '',
    nintendoId: '',
    steamName: '',
    twitchUsername: ''
  });
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const hasAtLeastOneGamertag = Object.values(gamertags).some(v => v.trim() !== '');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('Le mot de passe doit faire au moins 6 caractères');
      return;
    }

    if (!hasAtLeastOneGamertag) {
      toast.error('Entre au moins un gamertag!');
      return;
    }

    if (!consent) {
      toast.error('Tu dois accepter les conditions pour continuer');
      return;
    }

    setLoading(true);

    try {
      await register(username, email, password, {
        ...gamertags,
        streamingConsent: consent,
        streamVisibility: 'private' // Toujours privé - seul l'admin voit
      });
      toast.success('Compte créé! Tu as reçu 1000 coins de départ.');
      navigate('/live');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de l\'inscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="card">
        <h1 className="text-2xl font-bold text-center mb-6">Créer un compte</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nom d'utilisateur
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="TonPseudo"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="ton@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
              minLength={6}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 6 caractères</p>
          </div>

          {/* Section Gamertags */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              🎮 Tes plateformes
              <span className="text-xs text-gray-400 font-normal">(au moins une)</span>
            </h3>
            <div className="space-y-3">
              {platforms.map(platform => (
                <div key={platform.key} className="flex items-center gap-3">
                  <span className="text-xl w-8">{platform.icon}</span>
                  <input
                    type="text"
                    value={gamertags[platform.key]}
                    onChange={(e) => setGamertags({ ...gamertags, [platform.key]: e.target.value })}
                    placeholder={platform.placeholder}
                    className="input flex-1 text-sm"
                  />
                </div>
              ))}
            </div>
            {!hasAtLeastOneGamertag && (
              <p className="text-yellow-500 text-xs mt-2">⚠️ Entre au moins un gamertag</p>
            )}
          </div>

          {/* Consentement streaming automatique */}
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-4 border border-purple-600/30">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-xbox-green focus:ring-xbox-green"
              />
              <div>
                <span className="text-sm text-gray-200 font-medium">
                  📺 Activer le streaming automatique quand je joue
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  À chaque fois que tu joues sur Xbox, ton Twitch sera connecté automatiquement pour les paris.
                </p>
              </div>
            </label>

            {consent && (
              <div className="mt-3 pt-3 border-t border-purple-600/20 space-y-3">
                <div className="bg-green-900/30 border border-green-600/30 rounded-lg p-3">
                  <p className="text-sm text-green-400 font-medium">
                    ✅ Configuration une seule fois:
                  </p>
                  <ol className="text-xs text-gray-300 mt-2 space-y-1 list-decimal list-inside">
                    <li>Lie ton compte Twitch à ta Xbox (une seule fois)</li>
                    <li>Active "Diffusion auto" dans les paramètres Xbox</li>
                    <li>C'est tout! Ton stream démarre automatiquement quand tu joues</li>
                  </ol>
                </div>

                <div className="text-xs text-gray-400">
                  <p className="mb-1"><strong className="text-purple-400">Comment activer la diffusion auto:</strong></p>
                  <p className="text-gray-500">
                    Xbox: Paramètres → Préférences → Diffusion et capture → "Diffuser automatiquement avec Twitch" → Activé
                  </p>
                </div>

                <p className="text-xs text-gray-500">
                  🎮 Une fois configuré, tu n'as plus rien à faire - le système détecte ton stream automatiquement!
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || !hasAtLeastOneGamertag || !consent}
          >
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-300 text-center">
            🎁 Bonus de bienvenue: <span className="text-xbox-green font-bold">1000 coins</span>
          </p>
        </div>

        <p className="text-center text-gray-400 mt-4">
          Déjà un compte?{' '}
          <Link to="/login" className="text-xbox-green hover:underline">
            Connecte-toi
          </Link>
        </p>
      </div>
    </div>
  );
}
