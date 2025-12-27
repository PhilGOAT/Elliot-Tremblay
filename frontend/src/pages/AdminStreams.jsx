import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function AdminStreams() {
  const { user } = useAuth();
  const [streams, setStreams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('streams'); // streams, users

  useEffect(() => {
    if (user?.isAdmin) {
      fetchStreams();
      fetchUsers();
    }
  }, [user]);

  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    if (user?.isAdmin) {
      const interval = setInterval(fetchStreams, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchStreams = async () => {
    try {
      const res = await api.get('/admin/streams');
      setStreams(res.data.streams || []);
    } catch (error) {
      console.error('Erreur chargement streams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setAllUsers(res.data);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const toggleAdmin = async (userId, currentStatus) => {
    try {
      await api.patch(`/admin/users/${userId}`, {
        isAdmin: !currentStatus
      });
      toast.success('Statut admin modifié');
      fetchUsers();
    } catch (error) {
      toast.error('Erreur modification');
    }
  };

  // Rediriger si pas admin
  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!user.isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-gray-400 text-xl">Accès réservé aux administrateurs</p>
        <Link to="/" className="btn-primary mt-4 inline-block">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">🛡️ Admin</h1>
        <span className="text-sm text-gray-400">
          Refresh automatique toutes les 30s
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('streams')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'streams'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📺 Streams en direct ({streams.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'users'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          👥 Utilisateurs ({allUsers.length})
        </button>
      </div>

      {/* Tab: Streams */}
      {activeTab === 'streams' && (
        <div>
          {loading ? (
            <div className="text-center py-8 text-gray-400">Chargement...</div>
          ) : streams.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-xl">
              <p className="text-4xl mb-4">📺</p>
              <p className="text-gray-400 mb-2">Aucun stream en direct</p>
              <p className="text-sm text-gray-500">
                Les streams Twitch des utilisateurs apparaîtront ici
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {streams.map((stream) => (
                <div
                  key={stream.id}
                  className="bg-gray-800 rounded-xl p-4 flex items-center justify-between border-l-4 border-purple-500"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-2xl overflow-hidden">
                        {stream.xboxAvatar ? (
                          <img src={stream.xboxAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          '👤'
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-gray-800 animate-pulse"></div>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{stream.username}</h3>
                      <div className="text-sm text-gray-400 space-x-3">
                        {stream.xboxGamertag && (
                          <span>🎮 {stream.xboxGamertag}</span>
                        )}
                        <span className="text-purple-400">📺 {stream.twitchUsername}</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href={stream.twitchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition"
                  >
                    📺 Regarder
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Users */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {allUsers.map((u) => (
            <div
              key={u.id}
              className={`bg-gray-800 rounded-xl p-4 flex items-center justify-between ${
                u.isAdmin ? 'border-l-4 border-yellow-500' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{u.username}</h3>
                  {u.isAdmin && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400">{u.email}</p>
                <div className="text-xs text-gray-500 mt-1">
                  {u.xboxGamertag && <span className="mr-2">🎮 {u.xboxGamertag}</span>}
                  {u.twitchUsername && <span className="text-purple-400">📺 {u.twitchUsername}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  <p className="text-xbox-green font-bold">{u.balance} coins</p>
                  <p className="text-gray-400">{u.wins}V - {u.losses}D</p>
                </div>
                <button
                  onClick={() => toggleAdmin(u.id, u.isAdmin)}
                  className={`px-3 py-1 rounded text-sm ${
                    u.isAdmin
                      ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40'
                      : 'bg-green-600/20 text-green-400 hover:bg-green-600/40'
                  }`}
                >
                  {u.isAdmin ? 'Retirer admin' : 'Rendre admin'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
