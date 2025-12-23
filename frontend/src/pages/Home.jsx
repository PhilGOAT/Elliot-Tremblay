import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center py-16">
        <div className="w-24 h-24 bg-xbox-green rounded-full flex items-center justify-center mx-auto mb-8">
          <span className="text-5xl font-bold text-white">X</span>
        </div>

        <h1 className="text-5xl font-bold mb-4">
          Xbox <span className="text-xbox-green">Betting</span>
        </h1>

        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
          Pariez sur les matchs Xbox de vos amis! Madden, NHL, FIFA, NBA 2K...
          Gagnez des coins virtuels et grimpez dans le classement.
        </p>

        <div className="flex justify-center gap-4">
          <Link to="/matches" className="btn-primary text-lg px-8 py-3">
            Voir les matchs
          </Link>
          {!user && (
            <Link to="/register" className="btn-secondary text-lg px-8 py-3">
              Créer un compte
            </Link>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <div className="card text-center">
          <div className="text-4xl mb-4">🎮</div>
          <h3 className="text-xl font-bold mb-2">Créez des matchs</h3>
          <p className="text-gray-400">
            Ajoutez vos matchs Xbox et laissez vos amis parier sur le résultat.
          </p>
        </div>

        <div className="card text-center">
          <div className="text-4xl mb-4">💰</div>
          <h3 className="text-xl font-bold mb-2">Pariez vos coins</h3>
          <p className="text-gray-400">
            Commencez avec 1000 coins et multipliez vos gains avec des paris intelligents.
          </p>
        </div>

        <div className="card text-center">
          <div className="text-4xl mb-4">🏆</div>
          <h3 className="text-xl font-bold mb-2">Grimpez le classement</h3>
          <p className="text-gray-400">
            Devenez le meilleur parieur de votre groupe d'amis!
          </p>
        </div>
      </div>

      <div className="card mt-12">
        <h2 className="text-2xl font-bold mb-6 text-center">Jeux supportés</h2>
        <div className="flex flex-wrap justify-center gap-4">
          {['Madden NFL', 'NHL', 'EA FC (FIFA)', 'NBA 2K', 'MLB The Show', 'UFC'].map(game => (
            <span key={game} className="bg-gray-700 px-4 py-2 rounded-lg text-gray-300">
              {game}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
