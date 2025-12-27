import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Friends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('friends'); // friends, requests, search
  const [onlineStatus, setOnlineStatus] = useState({}); // {friendId: {isOnline, currentGame, isOnlineXbox, isStreamingTwitch}}

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchRequests();
      fetchSentRequests();
    }
  }, [user]);

  // Vérifier le statut en ligne des amis
  useEffect(() => {
    if (friends.length > 0) {
      checkOnlineStatus();
      // Revérifier toutes les 30 secondes
      const interval = setInterval(checkOnlineStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [friends]);

  const checkOnlineStatus = async () => {
    const statuses = {};
    for (const friend of friends) {
      try {
        const response = await fetch(`${API_URL}/api/users/${friend.id}/online`);
        if (response.ok) {
          const data = await response.json();
          statuses[friend.id] = {
            isOnline: data.isOnline,
            isOnlineXbox: data.isOnlineXbox,
            isStreamingTwitch: data.isStreamingTwitch,
            currentGame: data.currentGame,
            xboxPresence: data.xboxPresence
          };
        }
      } catch (error) {
        console.error('Erreur check online:', error);
      }
    }
    setOnlineStatus(statuses);
  };

  const getToken = () => localStorage.getItem('token');

  const fetchFriends = async () => {
    try {
      const response = await fetch(`${API_URL}/api/friends`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      setFriends(data);
    } catch (error) {
      console.error('Erreur chargement amis:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const response = await fetch(`${API_URL}/api/friends/requests`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
    }
  };

  const fetchSentRequests = async () => {
    try {
      const response = await fetch(`${API_URL}/api/friends/sent`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      setSentRequests(data);
    } catch (error) {
      console.error('Erreur chargement demandes envoyées:', error);
    }
  };

  const searchUsers = async (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/friends/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Erreur recherche:', error);
    }
  };

  const sendFriendRequest = async (userId) => {
    try {
      const response = await fetch(`${API_URL}/api/friends/request/${userId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();

      if (response.ok) {
        toast.success('Demande d\'ami envoyée!');
        fetchSentRequests();
        // Mettre à jour les résultats de recherche
        setSearchResults(prev => prev.filter(u => u.id !== userId));
      } else {
        toast.error(data.error || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur réseau');
    }
  };

  const acceptRequest = async (friendshipId) => {
    try {
      const response = await fetch(`${API_URL}/api/friends/accept/${friendshipId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        toast.success('Ami ajouté!');
        fetchFriends();
        fetchRequests();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur réseau');
    }
  };

  const declineRequest = async (friendshipId) => {
    try {
      const response = await fetch(`${API_URL}/api/friends/decline/${friendshipId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        toast.success('Demande refusée');
        fetchRequests();
      }
    } catch (error) {
      toast.error('Erreur réseau');
    }
  };

  const removeFriend = async (friendshipId, friendName) => {
    if (!confirm(`Supprimer ${friendName} de tes amis?`)) return;

    try {
      const response = await fetch(`${API_URL}/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        toast.success('Ami supprimé');
        fetchFriends();
      }
    } catch (error) {
      toast.error('Erreur réseau');
    }
  };

  const cancelRequest = async (friendshipId) => {
    try {
      const response = await fetch(`${API_URL}/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        toast.success('Demande annulée');
        fetchSentRequests();
      }
    } catch (error) {
      toast.error('Erreur réseau');
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Connecte-toi pour voir tes amis</p>
        <Link to="/login" className="btn-primary mt-4 inline-block">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Amis</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('friends')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'friends'
              ? 'bg-xbox-green text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Mes amis ({friends.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-lg font-medium transition relative ${
            activeTab === 'requests'
              ? 'bg-xbox-green text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Demandes
          {requests.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {requests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'search'
              ? 'bg-xbox-green text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Ajouter
        </button>
      </div>

      {/* Tab: Mes amis */}
      {activeTab === 'friends' && (
        <div>
          {loading ? (
            <div className="text-center py-8 text-gray-400">Chargement...</div>
          ) : friends.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-xl">
              <p className="text-4xl mb-4">👥</p>
              <p className="text-gray-400 mb-4">Tu n'as pas encore d'amis</p>
              <button
                onClick={() => setActiveTab('search')}
                className="btn-primary"
              >
                Ajouter des amis
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {friends.map((friend) => {
                const status = onlineStatus[friend.id];
                const isOnline = status?.isOnline;
                const currentGame = status?.currentGame;
                const isOnlineXbox = status?.isOnlineXbox;
                const isStreamingTwitch = status?.isStreamingTwitch;

                return (
                <div
                  key={friend.id}
                  className={`bg-gray-800 rounded-xl p-4 flex items-center justify-between ${
                    isOnline ? 'border-l-4 border-green-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-2xl overflow-hidden">
                        {friend.xboxAvatar ? (
                          <img src={friend.xboxAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          '👤'
                        )}
                      </div>
                      {/* Point vert si en ligne */}
                      {isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-800 animate-pulse" title="En train de jouer!"></div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-lg">{friend.username}</h3>
                        {isOnlineXbox && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                            🎮 {currentGame || 'En ligne Xbox'}
                          </span>
                        )}
                        {isStreamingTwitch && (
                          <a
                            href={`https://twitch.tv/${friend.twitchUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full hover:bg-purple-500/40 transition"
                          >
                            📺 En stream - Regarder
                          </a>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 space-x-3">
                        {friend.xboxGamertag && (
                          <span>🎮 {friend.xboxGamertag}</span>
                        )}
                        {friend.twitchUsername && (
                          <span className="text-purple-400">📺 {friend.twitchUsername}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {friend.wins}V - {friend.losses}D
                        {friend.wins + friend.losses > 0 && (
                          <span className="ml-2">
                            ({Math.round((friend.wins / (friend.wins + friend.losses)) * 100)}% victoires)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/profile/${friend.id}`}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                    >
                      Profil
                    </Link>
                    <button
                      onClick={() => removeFriend(friend.friendshipId, friend.username)}
                      className="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Demandes */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          {/* Demandes reçues */}
          <div>
            <h2 className="text-xl font-bold mb-4">Demandes reçues</h2>
            {requests.length === 0 ? (
              <p className="text-gray-400 bg-gray-800 rounded-lg p-4">
                Aucune demande en attente
              </p>
            ) : (
              <div className="grid gap-4">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-2xl">
                        {request.sender.xboxAvatar ? (
                          <img src={request.sender.xboxAvatar} alt="" className="w-full h-full rounded-full" />
                        ) : (
                          '👤'
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold">{request.sender.username}</h3>
                        <p className="text-sm text-gray-400">
                          {request.sender.xboxGamertag && `🎮 ${request.sender.xboxGamertag}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptRequest(request.id)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium"
                      >
                        Accepter
                      </button>
                      <button
                        onClick={() => declineRequest(request.id)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Demandes envoyées */}
          <div>
            <h2 className="text-xl font-bold mb-4">Demandes envoyées</h2>
            {sentRequests.length === 0 ? (
              <p className="text-gray-400 bg-gray-800 rounded-lg p-4">
                Aucune demande envoyée
              </p>
            ) : (
              <div className="grid gap-4">
                {sentRequests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                        👤
                      </div>
                      <div>
                        <h3 className="font-medium">{request.receiver.username}</h3>
                        <p className="text-xs text-yellow-500">En attente...</p>
                      </div>
                    </div>
                    <button
                      onClick={() => cancelRequest(request.id)}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                    >
                      Annuler
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Recherche */}
      {activeTab === 'search' && (
        <div>
          <div className="mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                searchUsers(e.target.value);
              }}
              placeholder="Rechercher par pseudo, gamertag Xbox ou Twitch..."
              className="w-full bg-gray-800 rounded-xl p-4 text-lg"
            />
          </div>

          {searchQuery.length < 2 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-4">🔍</p>
              <p>Entre au moins 2 caractères pour rechercher</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>Aucun utilisateur trouvé pour "{searchQuery}"</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {searchResults.map((result) => {
                const isPending = sentRequests.some(r => r.receiver.id === result.id);
                const isFriend = friends.some(f => f.id === result.id);

                return (
                  <div
                    key={result.id}
                    className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-2xl">
                        {result.xboxAvatar ? (
                          <img src={result.xboxAvatar} alt="" className="w-full h-full rounded-full" />
                        ) : (
                          '👤'
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold">{result.username}</h3>
                        <div className="text-sm text-gray-400">
                          {result.xboxGamertag && (
                            <span className="mr-3">🎮 {result.xboxGamertag}</span>
                          )}
                          {result.twitchUsername && (
                            <span className="text-purple-400">📺 {result.twitchUsername}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {result.wins}V - {result.losses}D
                        </p>
                      </div>
                    </div>
                    <div>
                      {isFriend ? (
                        <span className="px-4 py-2 bg-green-600/20 text-green-400 rounded-lg">
                          Déjà ami
                        </span>
                      ) : isPending ? (
                        <span className="px-4 py-2 bg-yellow-600/20 text-yellow-400 rounded-lg">
                          En attente
                        </span>
                      ) : (
                        <button
                          onClick={() => sendFriendRequest(result.id)}
                          className="px-4 py-2 bg-xbox-green hover:bg-green-600 rounded-lg font-medium"
                        >
                          + Ajouter
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
