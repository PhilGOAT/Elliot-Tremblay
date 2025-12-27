import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const platforms = [
  { key: 'xboxGamertag', label: 'Xbox Live', icon: '🎮', placeholder: 'Gamertag Xbox' },
  { key: 'psnId', label: 'PlayStation', icon: '🎯', placeholder: 'PSN ID' },
  { key: 'eaId', label: 'EA Sports', icon: '⚽', placeholder: 'EA ID (Madden, NHL, FIFA)' },
  { key: 'nintendoId', label: 'Nintendo', icon: '🍄', placeholder: 'Nintendo ID' },
  { key: 'steamName', label: 'Steam', icon: '💻', placeholder: 'Nom Steam' }
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
    steamName: ''
  });
  const [twitchUsername, setTwitchUsername] = useState('');
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

    if (!twitchUsername.trim()) {
      toast.error('Entre ton pseudo Twitch pour le streaming!');
      return;
    }

    setLoading(true);

    try {
      await register(username, email, password, {
        ...gamertags,
        twitchUsername: twitchUsername.trim(),
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

          {/* Section Twitch obligatoire */}
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-4 border border-purple-600/30">
            <h3 className="font-bold mb-3 flex items-center gap-2 text-purple-400">
              📺 Ton compte Twitch
              <span className="text-xs text-red-400 font-normal">(obligatoire)</span>
            </h3>

            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-2">
                Pseudo Twitch
              </label>
              <input
                type="text"
                value={twitchUsername}
                onChange={(e) => setTwitchUsername(e.target.value)}
                className="input w-full border-purple-600/50"
                placeholder="ton_pseudo_twitch"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Ton stream sera visible sur twitch.tv/{twitchUsername || '...'}
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-xbox-green focus:ring-xbox-green"
              />
              <div>
                <span className="text-sm text-gray-200 font-medium">
                  J'accepte que mon stream soit utilisé pour les paris
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  Quand tu joues sur Xbox, ton Twitch sera détecté automatiquement pour lire les scores.
                </p>
              </div>
            </label>

            {consent && (
              <div className="mt-3 pt-3 border-t border-purple-600/20 space-y-3">
                <div className="bg-green-900/30 border border-green-600/30 rounded-lg p-3">
                  <p className="text-sm text-green-400 font-medium">
                    ✅ Configuration une seule fois sur ta Xbox:
                  </p>
                  <ol className="text-xs text-gray-300 mt-2 space-y-1 list-decimal list-inside">
                    <li>Paramètres → Compte → Comptes liés → Twitch</li>
                    <li>Paramètres → Préférences → Diffusion auto → Activé</li>
                    <li>C'est tout! Le stream démarre quand tu joues</li>
                  </ol>
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
            disabled={loading || !hasAtLeastOneGamertag || !consent || !twitchUsername.trim()}
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
