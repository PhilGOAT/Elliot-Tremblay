import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// List tournaments
router.get('/', async (req, res) => {
  try {
    const { status, game } = req.query;
    const where = {};
    if (status) where.status = status;
    if (game) where.game = game;

    const tournaments = await req.prisma.tournament.findMany({
      where,
      include: {
        participants: true,
        rounds: {
          include: { matches: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tournaments);
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get tournament detail
router.get('/:id', async (req, res) => {
  try {
    const tournament = await req.prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: { orderBy: { seed: 'asc' } },
        rounds: {
          include: { matches: { orderBy: { matchNumber: 'asc' } } },
          orderBy: { roundNumber: 'desc' }
        }
      }
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }

    res.json(tournament);
  } catch (error) {
    console.error('Get tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create tournament
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, game, size, entryFee } = req.body;

    if (!name || !game) {
      return res.status(400).json({ error: 'Nom et jeu requis' });
    }

    const validSizes = [4, 8, 16];
    if (!validSizes.includes(size)) {
      return res.status(400).json({ error: 'Taille invalide (4, 8, ou 16)' });
    }

    const tournament = await req.prisma.tournament.create({
      data: {
        name,
        game,
        size,
        entryFee: entryFee || 0,
        createdBy: req.userId
      }
    });

    res.status(201).json(tournament);
  } catch (error) {
    console.error('Create tournament error:', error);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// Add participant
router.post('/:id/participants', authenticate, async (req, res) => {
  try {
    const { teamName, playerName, playerType } = req.body;

    if (!teamName) {
      return res.status(400).json({ error: 'Nom d\'équipe requis' });
    }

    const tournament = await req.prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { participants: true }
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }

    if (tournament.status !== 'REGISTRATION') {
      return res.status(400).json({ error: 'Inscriptions fermées' });
    }

    if (tournament.participants.length >= tournament.size) {
      return res.status(400).json({ error: 'Tournoi complet' });
    }

    const participant = await req.prisma.tournamentParticipant.create({
      data: {
        tournamentId: tournament.id,
        teamName,
        playerName: playerType === 'HUMAN' ? playerName : null,
        playerType: playerType || 'HUMAN',
        seed: tournament.participants.length + 1
      }
    });

    res.status(201).json(participant);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ce nom d\'équipe est déjà pris' });
    }
    console.error('Add participant error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Start tournament
router.post('/:id/start', authenticate, async (req, res) => {
  try {
    const tournament = await req.prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { participants: { orderBy: { seed: 'asc' } } }
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }

    if (tournament.createdBy !== req.userId) {
      return res.status(403).json({ error: 'Seul le créateur peut démarrer le tournoi' });
    }

    if (tournament.status !== 'REGISTRATION') {
      return res.status(400).json({ error: 'Tournoi déjà démarré' });
    }

    if (tournament.participants.length !== tournament.size) {
      return res.status(400).json({ error: `Il faut ${tournament.size} participants` });
    }

    // Calculate number of rounds needed
    const numRounds = Math.log2(tournament.size);

    // Create bracket
    await req.prisma.$transaction(async (tx) => {
      // Update tournament status
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { status: 'IN_PROGRESS' }
      });

      // Create first round
      const firstRound = await tx.tournamentRound.create({
        data: {
          tournamentId: tournament.id,
          roundNumber: numRounds
        }
      });

      // Create first round matches
      const participants = tournament.participants;
      for (let i = 0; i < participants.length / 2; i++) {
        await tx.tournamentMatch.create({
          data: {
            roundId: firstRound.id,
            matchNumber: i + 1,
            team1Name: participants[i].teamName,
            team2Name: participants[participants.length - 1 - i].teamName
          }
        });
      }

      // Create empty subsequent rounds
      for (let r = numRounds - 1; r >= 1; r--) {
        const round = await tx.tournamentRound.create({
          data: {
            tournamentId: tournament.id,
            roundNumber: r
          }
        });

        const numMatches = Math.pow(2, r - 1);
        for (let i = 0; i < numMatches; i++) {
          await tx.tournamentMatch.create({
            data: {
              roundId: round.id,
              matchNumber: i + 1
            }
          });
        }
      }
    });

    const updatedTournament = await req.prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: true,
        rounds: {
          include: { matches: { orderBy: { matchNumber: 'asc' } } },
          orderBy: { roundNumber: 'desc' }
        }
      }
    });

    res.json(updatedTournament);
  } catch (error) {
    console.error('Start tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update match result
router.patch('/:id/matches/:matchId/result', authenticate, async (req, res) => {
  try {
    const { team1Score, team2Score } = req.body;

    if (team1Score === undefined || team2Score === undefined) {
      return res.status(400).json({ error: 'Scores requis' });
    }

    const tournament = await req.prisma.tournament.findUnique({
      where: { id: req.params.id }
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }

    if (tournament.createdBy !== req.userId) {
      return res.status(403).json({ error: 'Seul le créateur peut entrer les résultats' });
    }

    const match = await req.prisma.tournamentMatch.findUnique({
      where: { id: req.params.matchId },
      include: { round: true }
    });

    if (!match || match.round.tournamentId !== tournament.id) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    if (match.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Match déjà terminé' });
    }

    // Determine winner
    const winnerId = team1Score > team2Score ? match.team1Name : match.team2Name;
    const loserId = team1Score > team2Score ? match.team2Name : match.team1Name;

    await req.prisma.$transaction(async (tx) => {
      // Update match
      await tx.tournamentMatch.update({
        where: { id: match.id },
        data: {
          team1Score,
          team2Score,
          winnerId,
          status: 'COMPLETED'
        }
      });

      // Mark loser as eliminated
      await tx.tournamentParticipant.updateMany({
        where: { tournamentId: tournament.id, teamName: loserId },
        data: { eliminated: true }
      });

      // Advance winner to next round
      if (match.round.roundNumber > 1) {
        const nextRound = await tx.tournamentRound.findUnique({
          where: {
            tournamentId_roundNumber: {
              tournamentId: tournament.id,
              roundNumber: match.round.roundNumber - 1
            }
          },
          include: { matches: { orderBy: { matchNumber: 'asc' } } }
        });

        if (nextRound) {
          const nextMatchIndex = Math.floor((match.matchNumber - 1) / 2);
          const nextMatch = nextRound.matches[nextMatchIndex];
          const isTeam1 = (match.matchNumber - 1) % 2 === 0;

          await tx.tournamentMatch.update({
            where: { id: nextMatch.id },
            data: isTeam1 ? { team1Name: winnerId } : { team2Name: winnerId }
          });
        }
      } else {
        // Final match completed - set tournament winner
        await tx.tournament.update({
          where: { id: tournament.id },
          data: { winnerId, status: 'COMPLETED' }
        });
      }
    });

    const updatedTournament = await req.prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: true,
        rounds: {
          include: { matches: { orderBy: { matchNumber: 'asc' } } },
          orderBy: { roundNumber: 'desc' }
        }
      }
    });

    res.json(updatedTournament);
  } catch (error) {
    console.error('Update match result error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
