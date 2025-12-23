import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function Leaderboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    api.get('/users/leaderboard')
      .then(res => setUsers(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-center">Classement</h1>

      {users.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400">Aucun joueur pour le moment</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user, index) => (
            <div
              key={user.id}
              className={`card flex items-center gap-4 ${
                currentUser?.id === user.id ? 'ring-2 ring-xbox-green' : ''
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${
                index === 0 ? 'bg-yellow-500 text-black' :
                index === 1 ? 'bg-gray-300 text-black' :
                index === 2 ? 'bg-orange-600 text-white' :
                'bg-gray-700 text-white'
              }`}>
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : user.rank}
              </div>

              <div className="flex-1">
                <p className="font-bold text-lg">{user.username}</p>
                <p className="text-sm text-gray-400">
                  {user.wins}W - {user.losses}L ({user.winRate}% win rate)
                </p>
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold text-xbox-green">{user.balance}</p>
                <p className="text-sm text-gray-400">coins</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
