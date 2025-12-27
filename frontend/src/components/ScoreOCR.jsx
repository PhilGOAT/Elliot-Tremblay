import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';

export default function ScoreOCR({ onScoreDetected, player1Name, player2Name }) {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detectedText, setDetectedText] = useState('');
  const [detectedScores, setDetectedScores] = useState({ score1: 0, score2: 0 });
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
      setDetectedText('');
      setShowConfirm(false);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;

    setLoading(true);
    setProgress(0);

    try {
      const result = await Tesseract.recognize(
        image,
        'eng', // On utilise l'anglais car les chiffres sont universels
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100));
            }
          }
        }
      );

      const text = result.data.text;
      setDetectedText(text);

      // Essayer de trouver les scores dans le texte
      const scores = extractScores(text);
      setDetectedScores(scores);
      setShowConfirm(true);

    } catch (error) {
      console.error('Erreur OCR:', error);
      alert('Erreur lors de l\'analyse. Essaie avec une image plus claire.');
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour extraire les scores du texte OCR
  const extractScores = (text) => {
    // Nettoyer le texte
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

    // Patterns communs pour les scores
    // Format: "3 - 2", "3-2", "3 2", etc.
    const patterns = [
      /(\d{1,2})\s*[-:]\s*(\d{1,2})/,  // 3-2, 3:2, 3 - 2
      /(\d{1,2})\s+(\d{1,2})/,          // 3 2
    ];

    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match) {
        const score1 = parseInt(match[1]);
        const score2 = parseInt(match[2]);
        // Vérifier que les scores sont raisonnables (0-20)
        if (score1 >= 0 && score1 <= 20 && score2 >= 0 && score2 <= 20) {
          return { score1, score2 };
        }
      }
    }

    // Si aucun pattern trouvé, chercher juste des chiffres isolés
    const numbers = cleanText.match(/\b(\d{1,2})\b/g);
    if (numbers && numbers.length >= 2) {
      const score1 = parseInt(numbers[0]);
      const score2 = parseInt(numbers[1]);
      if (score1 >= 0 && score1 <= 20 && score2 >= 0 && score2 <= 20) {
        return { score1, score2 };
      }
    }

    return { score1: 0, score2: 0 };
  };

  const confirmScore = () => {
    if (onScoreDetected) {
      onScoreDetected(detectedScores);
    }
    // Reset
    setImage(null);
    setImagePreview(null);
    setShowConfirm(false);
    setDetectedText('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4">
      <h4 className="font-bold text-purple-400 mb-3">
        📸 Lire le score depuis une image
      </h4>

      {/* Upload zone */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          id="score-image-upload"
        />
        <label
          htmlFor="score-image-upload"
          className="block w-full p-4 border-2 border-dashed border-gray-500 rounded-lg text-center cursor-pointer hover:border-purple-500 transition-colors"
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Screenshot"
              className="max-h-48 mx-auto rounded"
            />
          ) : (
            <div>
              <div className="text-3xl mb-2">📷</div>
              <p className="text-gray-400">
                Clique ou glisse une capture d'écran du score
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Prends un screenshot du score à l'écran
              </p>
            </div>
          )}
        </label>
      </div>

      {/* Bouton analyser */}
      {imagePreview && !showConfirm && (
        <button
          onClick={analyzeImage}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-3 rounded-lg font-bold mb-3"
        >
          {loading ? (
            <span>
              Analyse en cours... {progress}%
            </span>
          ) : (
            '🔍 Analyser l\'image'
          )}
        </button>
      )}

      {/* Barre de progression */}
      {loading && (
        <div className="w-full bg-gray-600 rounded-full h-2 mb-3">
          <div
            className="bg-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Résultat et confirmation */}
      {showConfirm && (
        <div className="space-y-3">
          {/* Texte détecté (debug) */}
          {detectedText && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Texte détecté (debug)</summary>
              <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-auto max-h-20">
                {detectedText}
              </pre>
            </details>
          )}

          {/* Score détecté */}
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400 text-center mb-2">Score détecté:</p>
            <div className="flex justify-center items-center gap-4 text-2xl font-bold">
              <div className="text-center">
                <div className="text-sm text-gray-400">{player1Name}</div>
                <input
                  type="number"
                  value={detectedScores.score1}
                  onChange={(e) => setDetectedScores({ ...detectedScores, score1: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-gray-700 rounded p-2 text-center text-3xl"
                  min="0"
                  max="20"
                />
              </div>
              <span className="text-gray-500">-</span>
              <div className="text-center">
                <div className="text-sm text-gray-400">{player2Name}</div>
                <input
                  type="number"
                  value={detectedScores.score2}
                  onChange={(e) => setDetectedScores({ ...detectedScores, score2: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-gray-700 rounded p-2 text-center text-3xl"
                  min="0"
                  max="20"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              Corrige si nécessaire avant de confirmer
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowConfirm(false);
                setImagePreview(null);
                setImage(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded-lg"
            >
              Annuler
            </button>
            <button
              onClick={confirmScore}
              className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded-lg font-bold"
            >
              ✅ Confirmer le score
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
