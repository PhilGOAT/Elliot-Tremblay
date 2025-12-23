const gameColors = {
  MADDEN: 'bg-red-600',
  NHL: 'bg-blue-600',
  FIFA: 'bg-green-600',
  NBA2K: 'bg-orange-600',
  MLB: 'bg-yellow-600',
  UFC: 'bg-purple-600',
  OTHER: 'bg-gray-600'
};

const gameNames = {
  MADDEN: 'Madden NFL',
  NHL: 'NHL',
  FIFA: 'EA FC',
  NBA2K: 'NBA 2K',
  MLB: 'MLB The Show',
  UFC: 'UFC',
  OTHER: 'Autre'
};

export default function GameBadge({ game }) {
  return (
    <span className={`game-badge ${gameColors[game] || gameColors.OTHER}`}>
      {gameNames[game] || game}
    </span>
  );
}
