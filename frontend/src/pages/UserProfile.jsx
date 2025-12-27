import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function UserProfile() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [friendStatus, setFriendStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const getToken = () => localStorage.getItem('token');

  useEffect(() => {
    fetchProfile();
    if (currentUser) {
      checkFriendStatus();
    }
  }, [id, currentUser]);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users/${id}`);
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkFriendStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/friends/status/${id}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFriendStatus(data);
      }
    } catch (error) {
      console.error('Erreur statut ami:', error);
    }
  };

  const sendFriendRequest = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/friends/request/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();

      if (response.ok) {
        toast.success('Demande d\'ami envoyée!');
        checkFriendStatus();
      } else {
        toast.error(data.error || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur réseau');
    } finally {
      setActionLoading(false);
    }
  };

  const acceptRequest = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/friends/accept/${friendStatus.friendshipId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        toast.success('Ami ajouté!');
        checkFriendStatus();
      }
    } catch (error) {
      toast.error('Erreur réseau');
    } finally {
      setActionLoading(false);
    }
  };

  const removeFriend = async () => {
    if (!confirm(`Supprimer ${profile.username} de tes amis?`)) return;

    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/friends/${friendStatus.friendshipId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        toast.success('Ami supprimé');
        checkFriendStatus();
      }
    } catch (error) {
      toast.error('Erreur réseau');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">😢</p>
        <p className="text-gray-400">Utilisateur non trouvé</p>
        <Link to="/friends" className="btn-primary mt-4 inline-block">
          Retour aux amis
        </Link>
      </div>
    );
  }

  const winRate = profile.wins + profile.losses > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
    : 0;

  const isOwnProfile = currentUser?.id === id;

  const renderFriendButton = () => {
    if (!currentUser || isOwnProfile) return null;

    if (!friendStatus || friendStatus.status === 'none') {
      return (
        <button
          onClick={sendFriendRequest}
          disabled={actionLoading}
          className="btn-primary"
        >
          {actionLoading ? 'Envoi...' : '+ Ajouter en ami'}
        </button>
      );
    }

    if (friendStatus.status === 'pending') {
      if (friendStatus.isSender) {
        return (
          <span className="px-4 py-2 bg-yellow-600/20 text-yellow-400 rounded-lg">
            Demande envoyée
          </span>
        );
      } else {
        return (
          <button
            onClick={acceptRequest}
            disabled={actionLoading}
            className="btn-primary"
          >
            {actionLoading ? '...' : 'Accepter la demande'}
          </button>
        );
      }
    }

    if (friendStatus.status === 'accepted') {
      return (
        <div className="flex items-center gap-3">
          <span className="px-4 py-2 bg-green-600/20 text-green-400 rounded-lg">
            Ami
          </span>
          <button
            onClick={removeFriend}
            disabled={actionLoading}
            className="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm"
          >
            Supprimer
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="card text-center">
        <div className="w-24 h-24 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden">
          {profile.xboxAvatar ? (
            <img src={profile.xboxAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl font-bold text-white">
              {profile.username.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold mb-2">{profile.username}</h1>

        {/* Gamertags */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {profile.xboxGamertag && (
            <span className="px-3 py-1 bg-green-900/30 text-green-400 rounded-full text-sm">
              🎮 {profile.xboxGamertag}
            </span>
          )}
          {profile.twitchUsername && (
            <span className="px-3 py-1 bg-purple-900/30 text-purple-400 rounded-full text-sm">
              📺 {profile.twitchUsername}
            </span>
          )}
        </div>

        {/* Friend button */}
        <div className="mb-6">
          {renderFriendButton()}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-2xl font-bold text-xbox-green">{profile.balance}</p>
            <p className="text-sm text-gray-400">Coins</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-2xl font-bold text-green-400">{profile.wins}</p>
            <p className="text-sm text-gray-400">Victoires</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-2xl font-bold text-red-400">{profile.losses}</p>
            <p className="text-sm text-gray-400">Défaites</p>
          </div>
        </div>

        {/* Win rate */}
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

        {/* Member since */}
        <p className="text-sm text-gray-500">
          Membre depuis {new Date(profile.createdAt).toLocaleDateString('fr-FR')}
        </p>

        {/* Actions */}
        <div className="mt-6 flex justify-center gap-4">
          <Link to="/friends" className="text-gray-400 hover:text-white">
            ← Retour aux amis
          </Link>
          {isOwnProfile && (
            <Link to="/profile" className="text-xbox-green hover:underline">
              Modifier mon profil
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
