import { Link } from 'react-router-dom';
import GameBadge from './GameBadge';

const statusLabels = {
  PENDING: 'En attente',
  LIVE: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé'
};

const statusColors = {
  PENDING: 'text-yellow-400',
  LIVE: 'text-green-400',
  COMPLETED: 'text-gray-400',
  CANCELLED: 'text-red-400'
};

export default function MatchCard({ match }) {
  const totalBets = (match.betStats?.player1Total || 0) + (match.betStats?.player2Total || 0);

  return (
    <Link to={`/matches/${match.id}`} className="card hover:bg-gray-750 transition block">
      <div className="flex items-center justify-between mb-4">
        <GameBadge game={match.game} />
        <span className={`text-sm font-medium ${statusColors[match.status]}`}>
          {match.status === 'LIVE' && '🔴 '}{statusLabels[match.status]}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <p className="text-lg font-bold text-white">
            {match.player1Type === 'CPU' ? '🤖 ' : '👤 '}{match.player1Name}
          </p>
          {match.status === 'COMPLETED' && (
            <p className="text-3xl font-bold text-xbox-green mt-2">{match.player1Score}</p>
          )}
          {match.betStats && (
            <p className="text-sm text-gray-400 mt-1">
              {match.betStats.player1Total} coins ({match.betStats.player1Count} paris)
            </p>
          )}
        </div>

        <div className="px-4">
          <span className="text-2xl text-gray-500">VS</span>
        </div>

        <div className="text-center flex-1">
          <p className="text-lg font-bold text-white">
            {match.player2Type === 'CPU' ? '🤖 ' : '👤 '}{match.player2Name}
          </p>
          {match.status === 'COMPLETED' && (
            <p className="text-3xl font-bold text-xbox-green mt-2">{match.player2Score}</p>
          )}
          {match.betStats && (
            <p className="text-sm text-gray-400 mt-1">
              {match.betStats.player2Total} coins ({match.betStats.player2Count} paris)
            </p>
          )}
        </div>
      </div>

      {totalBets > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Pool total</span>
            <span className="text-xbox-green font-bold">{totalBets} coins</span>
          </div>
        </div>
      )}
    </Link>
  );
}
