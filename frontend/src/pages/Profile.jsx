import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import toast from 'react-hot-toast';

const platforms = [
  { key: 'xboxGamertag', label: 'Xbox Live', icon: '🎮', placeholder: 'Gamertag Xbox' },
  { key: 'psnId', label: 'PlayStation', icon: '🎯', placeholder: 'PSN ID' },
  { key: 'eaId', label: 'EA Sports', icon: '⚽', placeholder: 'EA ID (Madden, NHL, FIFA)' },
  { key: 'nintendoId', label: 'Nintendo', icon: '🍄', placeholder: 'Nintendo ID' },
  { key: 'steamName', label: 'Steam', icon: '💻', placeholder: 'Nom Steam' }
];

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    xboxGamertag: '',
    psnId: '',
    eaId: '',
    nintendoId: '',
    steamName: ''
  });

  // Mettre à jour le formulaire quand les données user changent
  useEffect(() => {
    if (user) {
      setFormData({
        xboxGamertag: user.xboxGamertag || '',
        psnId: user.psnId || '',
        eaId: user.eaId || '',
        nintendoId: user.nintendoId || '',
        steamName: user.steamName || ''
      });
    }
  }, [user]);

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

  const hasAnyGamertag = platforms.some(p => user[p.key]);

  return (
    <div className="max-w-md mx-auto">
      <div className="card text-center">
        <div className="w-24 h-24 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl font-bold text-white">
            {user.username.charAt(0).toUpperCase()}
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-2">{user.username}</h1>
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

        {/* Section Gamertags */}
        <div className="bg-gray-700 rounded-lg p-4 mb-6 text-left">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Mes plateformes</h3>
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
              {platforms.map(platform => (
                <div key={platform.key} className="flex items-center gap-3">
                  <span className="text-xl w-8">{platform.icon}</span>
                  <input
                    type="text"
                    value={formData[platform.key]}
                    onChange={(e) => setFormData({ ...formData, [platform.key]: e.target.value })}
                    placeholder={platform.placeholder}
                    className="input flex-1 text-sm"
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
              {hasAnyGamertag ? (
                platforms.map(platform => (
                  user[platform.key] && (
                    <div key={platform.key} className="flex items-center gap-3">
                      <span className="text-xl w-8">{platform.icon}</span>
                      <span className="text-gray-300">{platform.label}:</span>
                      <span className="text-white font-medium">{user[platform.key]}</span>
                    </div>
                  )
                ))
              ) : (
                <p className="text-gray-500 text-center py-2">
                  Aucune plateforme liée. Clique sur "Modifier" pour ajouter tes gamertags!
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
