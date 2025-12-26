import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Matches from './pages/Matches';
import MatchDetail from './pages/MatchDetail';
import CreateMatch from './pages/CreateMatch';
import MyBets from './pages/MyBets';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import CreateTournament from './pages/CreateTournament';
import LiveStreams from './pages/LiveStreams';
import LiveStreamDetail from './pages/LiveStreamDetail';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-xbox-green"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/matches/:id" element={<MatchDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route
            path="/matches/create"
            element={<PrivateRoute><CreateMatch /></PrivateRoute>}
          />
          <Route
            path="/my-bets"
            element={<PrivateRoute><MyBets /></PrivateRoute>}
          />
          <Route
            path="/profile"
            element={<PrivateRoute><Profile /></PrivateRoute>}
          />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/:id" element={<TournamentDetail />} />
          <Route
            path="/tournaments/create"
            element={<PrivateRoute><CreateTournament /></PrivateRoute>}
          />
          <Route path="/live" element={<LiveStreams />} />
          <Route path="/live/:id" element={<LiveStreamDetail />} />
        </Routes>
      </main>
    </div>
  );
}
