import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import toast from 'react-hot-toast';

const platforms = [
  { key: 'xboxGamertag', verifiedKey: 'xboxVerified', label: 'Xbox Live', icon: '🎮', placeholder: 'Gamertag Xbox', hasOAuth: true },
  { key: 'psnId', verifiedKey: 'psnVerified', label: 'PlayStation', icon: '🎯', placeholder: 'PSN ID' },
  { key: 'eaId', verifiedKey: 'eaVerified', label: 'EA Sports', icon: '⚽', placeholder: 'EA ID (Madden, NHL, FIFA)' },
  { key: 'nintendoId', verifiedKey: 'nintendoVerified', label: 'Nintendo', icon: '🍄', placeholder: 'Nintendo ID' },
  { key: 'steamName', verifiedKey: 'steamVerified', label: 'Steam', icon: '💻', placeholder: 'Nom Steam' }
];

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [xboxConnecting, setXboxConnecting] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    xboxGamertag: '',
    psnId: '',
    eaId: '',
    nintendoId: '',
    steamName: ''
  });
  const [editingUsername, setEditingUsername] = useState(false);

  // Mettre à jour le formulaire quand les données user changent
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        xboxGamertag: user.xboxGamertag || '',
        psnId: user.psnId || '',
        eaId: user.eaId || '',
        nintendoId: user.nintendoId || '',
        steamName: user.steamName || ''
      });
    }
  }, [user]);

  // Gérer le callback OAuth Xbox
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      handleXboxCallback(code, state);
      // Nettoyer l'URL
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  const handleXboxConnect = async () => {
    setXboxConnecting(true);
    try {
      const res = await api.get('/xbox/auth');

      if (res.data.setup) {
        toast.error('Xbox API non configurée. Contacte l\'admin.');
        return;
      }

      // Sauvegarder le state dans localStorage
      localStorage.setItem('xbox_oauth_state', res.data.state);

      // Rediriger vers Microsoft
      window.location.href = res.data.authUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur connexion Xbox');
      setXboxConnecting(false);
    }
  };

  const handleXboxCallback = async (code, state) => {
    const savedState = localStorage.getItem('xbox_oauth_state');

    if (state !== savedState) {
      toast.error('Erreur de sécurité OAuth');
      return;
    }

    localStorage.removeItem('xbox_oauth_state');

    try {
      const res = await api.post('/xbox/callback', { code, state });
      toast.success(res.data.message);
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur liaison Xbox');
    }
  };

  const handleXboxDisconnect = async () => {
    if (!confirm('Délier ton compte Xbox?')) return;

    try {
      await api.delete('/xbox/unlink');
      toast.success('Compte Xbox délié');
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    }
  };

  if (!user) return null;

  const winRate = user.wins + user.losses > 0
    ? Math.round((user.wins / (user.wins + user.losses)) * 100)
    : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/users/me', formData);
      toast.success('Profil mis à jour!');
      await refreshUser();
      setEditing(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUsername = async () => {
    if (formData.username.trim().length < 3) {
      toast.error('Le pseudo doit avoir au moins 3 caractères');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/users/me', { username: formData.username });
      toast.success('Pseudo mis à jour!');
      await refreshUser();
      setEditingUsername(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const hasAnyGamertag = platforms.some(p => user[p.key]);

  // Indicateur de statut de vérification
  const VerificationBadge = ({ verified, hasGamertag }) => {
    if (!hasGamertag) return null;
    return verified ? (
      <span className="w-3 h-3 bg-green-500 rounded-full" title="Vérifié"></span>
    ) : (
      <span className="w-3 h-3 bg-red-500 rounded-full" title="Non vérifié"></span>
    );
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="card text-center">
        <div className="w-24 h-24 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl font-bold text-white">
            {user.username.charAt(0).toUpperCase()}
          </span>
        </div>

        {editingUsername ? (
          <div className="flex items-center justify-center gap-2 mb-2">
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="input text-xl font-bold text-center w-48"
              placeholder="Ton pseudo"
              maxLength={20}
            />
            <button
              onClick={handleSaveUsername}
              disabled={saving}
              className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm"
            >
              {saving ? '...' : '✓'}
            </button>
            <button
              onClick={() => {
                setEditingUsername(false);
                setFormData({ ...formData, username: user.username });
              }}
              className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-2xl font-bold">{user.username}</h1>
            <button
              onClick={() => setEditingUsername(true)}
              className="text-gray-400 hover:text-white text-sm"
              title="Modifier le pseudo"
            >
              ✏️
            </button>
          </div>
        )}
        <p className="text-gray-400 mb-6">{user.email}</p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-2xl font-bold text-xbox-green">{user.balance}</p>
            <p className="text-sm text-gray-400">Coins</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-2xl font-bold text-green-400">{user.wins}</p>
            <p className="text-sm text-gray-400">Victoires</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-2xl font-bold text-red-400">{user.losses}</p>
            <p className="text-sm text-gray-400">Défaites</p>
          </div>
        </div>

        <div className="bg-gray-700 rounded-lg p-4 mb-6">
          <p className="text-gray-400 mb-2">Taux de réussite</p>
          <div className="h-4 bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-xbox-green transition-all"
              style={{ width: `${winRate}%` }}
            />
          </div>
          <p className="text-xl font-bold mt-2">{winRate}%</p>
        </div>

        {/* Section Xbox Live Connection */}
        <div className="bg-gradient-to-r from-green-900 to-gray-700 rounded-lg p-4 mb-6 text-left border border-green-600">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🎮</span>
            <div>
              <h3 className="font-bold text-green-400">Compte Microsoft / Xbox</h3>
              <p className="text-xs text-gray-400">Vérifie que tu as un vrai compte Microsoft</p>
            </div>
          </div>

          {user.xboxVerified ? (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {user.xboxAvatar && (
                    <img src={user.xboxAvatar} alt="Avatar Xbox" className="w-10 h-10 rounded-full" />
                  )}
                  <div>
                    <p className="font-bold text-white">{user.xboxGamertag}</p>
                    <p className="text-xs text-gray-400">Gamerscore: {user.xboxGamerscore?.toLocaleString() || 0}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Vérifié
                </span>
              </div>
              <button
                onClick={handleXboxDisconnect}
                className="text-red-400 text-sm hover:underline"
              >
                Délier le compte
              </button>
            </div>
          ) : (
            <button
              onClick={handleXboxConnect}
              disabled={xboxConnecting}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
            >
              {xboxConnecting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Connexion...
                </>
              ) : (
                <>
                  <span>🔗</span>
                  Connecter mon compte Microsoft
                </>
              )}
            </button>
          )}

          <p className="text-xs text-gray-500 mt-2 text-center">
            Connecte-toi avec ton compte Microsoft pour prouver ton identité
          </p>
        </div>

        {/* Section Gamertags */}
        <div className="bg-gray-700 rounded-lg p-4 mb-6 text-left">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">Autres plateformes</h3>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Vérifié</span>
                <span className="w-2 h-2 bg-red-500 rounded-full ml-2"></span>
                <span>Non vérifié</span>
              </div>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-xbox-green text-sm hover:underline"
              >
                Modifier
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              {platforms.filter(p => !p.hasOAuth).map(platform => (
                <div key={platform.key} className="flex items-center gap-3">
                  <span className="text-xl w-8">{platform.icon}</span>
                  <input
                    type="text"
                    value={formData[platform.key]}
                    onChange={(e) => setFormData({ ...formData, [platform.key]: e.target.value })}
                    placeholder={platform.placeholder}
                    className="input flex-1 text-sm"
                  />
                  <VerificationBadge
                    verified={user[platform.verifiedKey]}
                    hasGamertag={!!user[platform.key]}
                  />
                </div>
              ))}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex-1 text-sm"
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="btn-secondary text-sm"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {platforms.filter(p => !p.hasOAuth).some(p => user[p.key]) ? (
                platforms.filter(p => !p.hasOAuth).map(platform => (
                  user[platform.key] && (
                    <div key={platform.key} className="flex items-center gap-3">
                      <span className="text-xl w-8">{platform.icon}</span>
                      <span className="text-gray-300">{platform.label}:</span>
                      <span className="text-white font-medium flex-1">{user[platform.key]}</span>
                      <VerificationBadge
                        verified={user[platform.verifiedKey]}
                        hasGamertag={true}
                      />
                    </div>
                  )
                ))
              ) : (
                <p className="text-gray-500 text-center py-2">
                  Aucune autre plateforme liée. Clique sur "Modifier" pour ajouter tes gamertags!
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-500">
          Membre depuis {new Date(user.createdAt).toLocaleDateString('fr-FR')}
        </p>
      </div>
    </div>
  );
}
