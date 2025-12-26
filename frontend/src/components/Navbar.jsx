import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [claimingBonus, setClaimingBonus] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleClaimBonus = async () => {
    setClaimingBonus(true);
    try {
      const res = await api.post('/users/daily-bonus');
      toast.success(res.data.message);
      refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur');
    } finally {
      setClaimingBonus(false);
    }
  };

  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-xbox-green rounded-full flex items-center justify-center">
              <span className="text-white font-bold">X</span>
            </div>
            <span className="text-xl font-bold text-white">Xbox Betting</span>
          </Link>

          <div className="hidden md:flex items-center space-x-6">
            <Link to="/live" className="text-red-400 hover:text-red-300 transition font-bold">
              🔴 Live
            </Link>
            <Link to="/matches" className="text-gray-300 hover:text-white transition">
              Matchs
            </Link>
            <Link to="/tournaments" className="text-gray-300 hover:text-white transition">
              Tournois
            </Link>
            <Link to="/leaderboard" className="text-gray-300 hover:text-white transition">
              Classement
            </Link>
            {user && (
              <>
                <Link to="/matches/create" className="text-gray-300 hover:text-white transition">
                  Créer un match
                </Link>
                <Link to="/my-bets" className="text-gray-300 hover:text-white transition">
                  Mes Paris
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                {user.canClaimDailyBonus && (
                  <button
                    onClick={handleClaimBonus}
                    disabled={claimingBonus}
                    className="bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1 rounded-lg text-sm font-bold animate-pulse"
                  >
                    {claimingBonus ? '...' : '🎁 +100'}
                  </button>
                )}
                <NotificationBell />
                <Link to="/profile" className="flex items-center space-x-2 text-gray-300 hover:text-white">
                  <span className="text-xbox-green font-bold">{user.balance} coins</span>
                  <span>|</span>
                  <span>{user.username}</span>
                </Link>
                <button onClick={handleLogout} className="btn-secondary text-sm">
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-300 hover:text-white">
                  Connexion
                </Link>
                <Link to="/register" className="btn-primary text-sm">
                  Inscription
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
