import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  const winRate = user.wins + user.losses > 0
    ? Math.round((user.wins / (user.wins + user.losses)) * 100)
    : 0;

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

        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 mb-2">Taux de réussite</p>
          <div className="h-4 bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-xbox-green transition-all"
              style={{ width: `${winRate}%` }}
            />
          </div>
          <p className="text-xl font-bold mt-2">{winRate}%</p>
        </div>

        <p className="text-sm text-gray-500 mt-6">
          Membre depuis {new Date(user.createdAt).toLocaleDateString('fr-FR')}
        </p>
      </div>
    </div>
  );
}
