# Xbox Betting - Paris Sportifs Amicaux

Site de paris sportifs amicaux pour les matchs Xbox entre amis (Madden, NHL, FIFA, NBA 2K, etc.)

## Fonctionnalités

- **Inscription/Connexion** avec 1000 coins de départ
- **Création de matchs** entre joueurs (Madden, NHL, FIFA, NBA 2K, MLB, UFC)
- **Système de paris** avec monnaie virtuelle
- **Classement** des meilleurs parieurs
- **Historique** de vos paris

## Stack Technique

- **Backend**: Node.js, Express, Prisma ORM
- **Frontend**: React, Vite, TailwindCSS
- **Base de données**: PostgreSQL
- **Déploiement**: Railway

---

## Déploiement sur Railway

### Étape 1: Créer un nouveau projet sur Railway

1. Allez sur [railway.app](https://railway.app)
2. Connectez-vous avec GitHub
3. Cliquez sur **"New Project"**

### Étape 2: Ajouter PostgreSQL

1. Dans votre projet Railway, cliquez sur **"+ New"**
2. Sélectionnez **"Database"** → **"PostgreSQL"**
3. Railway crée automatiquement la base de données

### Étape 3: Déployer le Backend

1. Cliquez sur **"+ New"** → **"GitHub Repo"**
2. Sélectionnez ce repository
3. Railway détecte automatiquement le Dockerfile
4. **Configurer le service:**
   - Cliquez sur le service créé
   - Allez dans **"Settings"**
   - **Root Directory**: `backend`
   - Allez dans **"Variables"**
   - Ajoutez ces variables:
     ```
     DATABASE_URL = (copier depuis PostgreSQL → Connect → DATABASE_URL)
     JWT_SECRET = votre-secret-super-securise-changez-ceci
     PORT = 3001
     FRONTEND_URL = (sera ajouté après déploiement frontend)
     ```
5. Railway déploie automatiquement

### Étape 4: Déployer le Frontend

1. Cliquez sur **"+ New"** → **"GitHub Repo"**
2. Sélectionnez le même repository
3. **Configurer le service:**
   - Cliquez sur le service créé
   - Allez dans **"Settings"**
   - **Root Directory**: `frontend`
   - Allez dans **"Variables"**
   - Ajoutez:
     ```
     VITE_API_URL = https://votre-backend.railway.app/api
     ```
     (Remplacez par l'URL de votre backend, visible dans Settings → Domains)

### Étape 5: Configurer les domaines

1. Pour chaque service, allez dans **"Settings"** → **"Networking"**
2. Cliquez sur **"Generate Domain"** pour obtenir une URL publique
3. **Important**: Mettez à jour `FRONTEND_URL` dans le backend avec l'URL du frontend

### Étape 6: Vérifier le déploiement

1. Ouvrez l'URL du frontend
2. Créez un compte
3. Créez un match et testez les paris!

---

## Développement Local

### Prérequis

- Node.js 20+
- PostgreSQL local ou Docker

### Installation

```bash
# Cloner le repo
git clone <repo-url>
cd xbox-betting

# Backend
cd backend
npm install
cp .env.example .env
# Modifier .env avec votre DATABASE_URL locale
npx prisma db push
npm run dev

# Frontend (dans un autre terminal)
cd frontend
npm install
npm run dev
```

### URLs locales

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

---

## Structure du Projet

```
├── backend/
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   ├── middleware/    # Auth middleware
│   │   └── index.js       # Entry point
│   ├── prisma/
│   │   └── schema.prisma  # Database schema
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── context/       # Auth context
│   │   └── lib/           # API client
│   └── Dockerfile
└── README.md
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion

### Users
- `GET /api/users/me` - Profil utilisateur
- `GET /api/users/leaderboard` - Classement
- `GET /api/users` - Liste des utilisateurs

### Matches
- `GET /api/matches` - Liste des matchs
- `GET /api/matches/:id` - Détail d'un match
- `POST /api/matches` - Créer un match
- `PATCH /api/matches/:id/result` - Entrer le résultat
- `PATCH /api/matches/:id/cancel` - Annuler un match

### Bets
- `POST /api/bets` - Placer un pari
- `GET /api/bets/my` - Mes paris
- `DELETE /api/bets/:id` - Annuler un pari

---

## Jeux Supportés

- 🏈 Madden NFL
- 🏒 NHL
- ⚽ EA FC (FIFA)
- 🏀 NBA 2K
- ⚾ MLB The Show
- 🥊 UFC

---

Fait avec ❤️ pour les gamers
