import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Middleware pour vérifier l'authentification
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'xbox-betting-secret-key');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// GET /api/friends - Liste des amis
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    // Récupérer toutes les amitiés acceptées
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            xboxGamertag: true,
            twitchUsername: true,
            wins: true,
            losses: true,
            xboxAvatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            xboxGamertag: true,
            twitchUsername: true,
            wins: true,
            losses: true,
            xboxAvatar: true
          }
        }
      }
    });

    // Extraire les amis (l'autre personne dans la relation)
    const friends = friendships.map(f => {
      const friend = f.senderId === userId ? f.receiver : f.sender;
      return {
        ...friend,
        friendshipId: f.id,
        friendsSince: f.updatedAt
      };
    });

    res.json(friends);
  } catch (error) {
    console.error('Erreur liste amis:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/friends/requests - Demandes d'amis reçues
router.get('/requests', authMiddleware, async (req, res) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: {
        receiverId: req.userId,
        status: 'PENDING'
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            xboxGamertag: true,
            twitchUsername: true,
            wins: true,
            losses: true,
            xboxAvatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    console.error('Erreur demandes amis:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/friends/sent - Demandes envoyées en attente
router.get('/sent', authMiddleware, async (req, res) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: {
        senderId: req.userId,
        status: 'PENDING'
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            xboxGamertag: true,
            xboxAvatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    console.error('Erreur demandes envoyées:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/friends/request/:userId - Envoyer une demande d'ami
router.post('/request/:userId', authMiddleware, async (req, res) => {
  try {
    const senderId = req.userId;
    const receiverId = req.params.userId;

    if (senderId === receiverId) {
      return res.status(400).json({ error: 'Tu ne peux pas t\'ajouter toi-même!' });
    }

    // Vérifier que le destinataire existe
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier si une relation existe déjà (dans les deux sens)
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId }
        ]
      }
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') {
        return res.status(400).json({ error: 'Vous êtes déjà amis!' });
      }
      if (existingFriendship.status === 'PENDING') {
        return res.status(400).json({ error: 'Une demande est déjà en attente' });
      }
      if (existingFriendship.status === 'BLOCKED') {
        return res.status(400).json({ error: 'Impossible d\'envoyer une demande' });
      }
    }

    // Créer la demande d'ami
    const friendship = await prisma.friendship.create({
      data: {
        senderId,
        receiverId,
        status: 'PENDING'
      }
    });

    // Créer une notification pour le destinataire
    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    await prisma.notification.create({
      data: {
        userId: receiverId,
        type: 'FRIEND_REQUEST',
        title: 'Nouvelle demande d\'ami',
        message: `${sender.username} veut être ton ami!`
      }
    });

    res.json({ success: true, message: 'Demande d\'ami envoyée!' });
  } catch (error) {
    console.error('Erreur envoi demande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/friends/accept/:friendshipId - Accepter une demande
router.post('/accept/:friendshipId', authMiddleware, async (req, res) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: req.params.friendshipId },
      include: { sender: true, receiver: true }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    if (friendship.receiverId !== req.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Demande déjà traitée' });
    }

    // Accepter la demande
    await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: 'ACCEPTED' }
    });

    // Notifier l'expéditeur
    await prisma.notification.create({
      data: {
        userId: friendship.senderId,
        type: 'FRIEND_ACCEPTED',
        title: 'Demande acceptée!',
        message: `${friendship.receiver.username} a accepté ta demande d'ami!`
      }
    });

    res.json({ success: true, message: 'Ami ajouté!' });
  } catch (error) {
    console.error('Erreur acceptation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/friends/decline/:friendshipId - Refuser une demande
router.post('/decline/:friendshipId', authMiddleware, async (req, res) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: req.params.friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    if (friendship.receiverId !== req.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Supprimer la demande (ou mettre DECLINED)
    await prisma.friendship.delete({
      where: { id: friendship.id }
    });

    res.json({ success: true, message: 'Demande refusée' });
  } catch (error) {
    console.error('Erreur refus:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/friends/:friendshipId - Supprimer un ami
router.delete('/:friendshipId', authMiddleware, async (req, res) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: req.params.friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Ami non trouvé' });
    }

    // Vérifier que l'utilisateur fait partie de cette amitié
    if (friendship.senderId !== req.userId && friendship.receiverId !== req.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    await prisma.friendship.delete({
      where: { id: friendship.id }
    });

    res.json({ success: true, message: 'Ami supprimé' });
  } catch (error) {
    console.error('Erreur suppression ami:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/friends/status/:userId - Vérifier le statut d'amitié avec un user
router.get('/status/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.userId;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      return res.json({ status: 'self' });
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: currentUserId }
        ]
      }
    });

    if (!friendship) {
      return res.json({ status: 'none' });
    }

    // Déterminer qui a envoyé la demande
    const isSender = friendship.senderId === currentUserId;

    res.json({
      status: friendship.status.toLowerCase(),
      friendshipId: friendship.id,
      isSender
    });
  } catch (error) {
    console.error('Erreur statut ami:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/friends/search?q=username - Rechercher des utilisateurs
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.userId } },
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { xboxGamertag: { contains: query, mode: 'insensitive' } },
              { twitchUsername: { contains: query, mode: 'insensitive' } }
            ]
          }
        ]
      },
      select: {
        id: true,
        username: true,
        xboxGamertag: true,
        twitchUsername: true,
        wins: true,
        losses: true,
        xboxAvatar: true
      },
      take: 10
    });

    res.json(users);
  } catch (error) {
    console.error('Erreur recherche:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/friends/:friendId/activity - Activité récente d'un ami
router.get('/:friendId/activity', authMiddleware, async (req, res) => {
  try {
    const friendId = req.params.friendId;

    // Vérifier que c'est bien un ami
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: req.userId, receiverId: friendId },
          { senderId: friendId, receiverId: req.userId }
        ]
      }
    });

    if (!friendship) {
      return res.status(403).json({ error: 'Cet utilisateur n\'est pas ton ami' });
    }

    // Récupérer les matchs récents de l'ami
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [
          { player1Id: friendId },
          { player2Id: friendId }
        ],
        status: 'COMPLETED'
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        player1: { select: { username: true } },
        player2: { select: { username: true } }
      }
    });

    // Récupérer les streams en cours
    const liveStreams = await prisma.liveStream.findMany({
      where: {
        streamerId: friendId,
        status: 'LIVE'
      }
    });

    res.json({
      recentMatches,
      liveStreams,
      isOnline: liveStreams.length > 0
    });
  } catch (error) {
    console.error('Erreur activité ami:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
