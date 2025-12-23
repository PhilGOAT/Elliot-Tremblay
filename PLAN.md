# Xbox Betting - Plan de Fonctionnalites

## Resume du Projet
Site de paris sportifs amical pour les matchs Xbox (Madden, NHL, FIFA, etc.) deploye sur Railway Pro.

---

## Fonctionnalites Implementees

### 1. Authentification et Utilisateurs
- [x] Inscription avec email, username et mot de passe
- [x] Connexion avec JWT
- [x] Profil utilisateur avec solde de coins
- [x] 1000 coins de depart pour chaque nouveau joueur
- [x] Classement des joueurs (wins/losses)

### 2. Systeme de Matchs
- [x] Creation de matchs avec noms d'equipes libres
- [x] Support de 7 jeux: Madden, NHL, FIFA, NBA2K, MLB, UFC, Autre
- [x] Choix Humain ou CPU pour chaque joueur
- [x] Niveaux de difficulte CPU: Rookie, Pro, All-Pro, All-Madden
- [x] Champ nom du joueur humain (ex: "Phil", "Alex")
- [x] Entree des scores par le createur du match
- [x] Annulation de match avec remboursement

### 3. Systeme de Paris
- [x] Paris sur les matchs en attente
- [x] Mise minimum: 10 coins
- [x] Un seul pari par type par match par utilisateur
- [x] Paiement x2 sur les paris gagnes (mise 100 = gain 200)
- [x] Remboursement en cas de match nul
- [x] Historique des paris (Mes Paris)
- [x] **3 types de paris:**
  - Gagnant: Parier sur qui va gagner
  - Match serre: Parier si l'ecart sera <= 7 points (Oui/Non)
  - Haut score: Parier si le score total sera >= 50 points (Oui/Non)

### 4. Notifications
- [x] Cloche de notifications dans la navbar
- [x] Badge avec compteur non lus
- [x] Types de notifications:
  - Pari gagne (avec montant)
  - Pari perdu (avec montant)
  - Pari rembourse (match nul)
- [x] Marquer comme lu / Tout marquer lu
- [x] Lien direct vers le match concerne

### 5. Mode Tournoi
- [x] Creation de tournois (4, 8 ou 16 equipes)
- [x] Phase d'inscription ouverte
- [x] Support Humain/CPU pour chaque participant
- [x] Bracket automatique avec seeds
- [x] Progression automatique des gagnants
- [x] Affichage des tours: Finale, Demi-finales, Quarts, etc.
- [x] Marquage des elimines
- [x] Affichage du champion

---

## Architecture Technique

### Backend (Node.js + Express)
- **Port**: 3001 (ou variable PORT)
- **Base de donnees**: PostgreSQL via Prisma ORM
- **Auth**: JWT tokens
- **Routes API**:
  - `/api/auth` - Authentification
  - `/api/users` - Utilisateurs et classement
  - `/api/matches` - Gestion des matchs
  - `/api/bets` - Gestion des paris
  - `/api/notifications` - Notifications
  - `/api/tournaments` - Tournois

### Frontend (React + Vite)
- **Framework CSS**: TailwindCSS
- **Theme**: Xbox Green (#107C10)
- **Notifications**: react-hot-toast
- **Routing**: react-router-dom

### Deploiement Railway
- Backend: elliot-backend-production.up.railway.app
- Frontend: elliot-frontend-production.up.railway.app
- Database: PostgreSQL Railway
- Auto-migration avec `prisma db push` au demarrage

---

## Modeles de Donnees

### User
- id, username, email, password
- balance (coins), wins, losses

### Match
- id, game, status
- player1Name, player2Name
- player1Type, player2Type (HUMAN/CPU)
- player1Difficulty, player2Difficulty (si CPU)
- player1HumanName, player2HumanName (si HUMAN)
- player1Score, player2Score, winnerId
- createdBy

### Bet
- id, userId, matchId
- amount, betType (WINNER/CLOSE_MATCH/HIGH_SCORE)
- prediction (player1/player2 ou yes/no)
- status (PENDING/WON/LOST/REFUNDED), payout

### Notification
- id, userId, type, title, message
- matchId (optionnel), read

### Tournament
- id, name, game, size (4/8/16)
- status, createdBy, winnerId, prizePool, entryFee

### TournamentParticipant
- id, tournamentId, teamName, playerName, playerType, seed, eliminated

### TournamentRound
- id, tournamentId, roundNumber

### TournamentMatch
- id, roundId, matchNumber
- team1Name, team2Name, team1Score, team2Score
- winnerId, status

---

## Idees Futures (Non Implementees)

- [ ] Chat en direct pendant les matchs
- [ ] Statistiques detaillees par joueur
- [ ] Historique des confrontations
- [ ] Cotes dynamiques basees sur l'historique
- [ ] Frais d'entree pour les tournois avec prize pool
- [ ] Systeme de niveaux/XP
- [ ] Badges et achievements
- [ ] Mode spectateur
- [ ] Notifications push (mobile)
- [ ] Application mobile native

---

## Changelog

### v1.0.0 - Initial Release
- Systeme de base: auth, matchs, paris, classement

### v1.1.0 - Parier Seul
- Noms d'equipes libres (plus besoin de selectionner un autre joueur)
- Choix Humain/CPU pour chaque equipe

### v1.2.0 - Paiement x2
- Correction du systeme de gains: pari gagne = double de la mise

### v1.3.0 - Ameliorations Majeures
- Niveaux de difficulte CPU (Rookie, Pro, All-Pro, All-Madden)
- Champ nom du joueur humain
- Systeme de notifications complet
- Mode tournoi avec bracket

### v1.4.0 - Types de Paris
- 3 types de paris: Gagnant, Match serre, Haut score
- Pari "Match serre": ecart <= 7 points
- Pari "Haut score": score total >= 50 points
- Possibilite de parier sur chaque type pour un meme match

---

*Derniere mise a jour: Decembre 2024*
