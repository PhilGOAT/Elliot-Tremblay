import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get user notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await req.prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get unread count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const count = await req.prisma.notification.count({
      where: { userId: req.userId, read: false }
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await req.prisma.notification.findUnique({
      where: { id: req.params.id }
    });

    if (!notification || notification.userId !== req.userId) {
      return res.status(404).json({ error: 'Notification non trouvée' });
    }

    await req.prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mark all as read
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await req.prisma.notification.updateMany({
      where: { userId: req.userId, read: false },
      data: { read: true }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Helper function to create notification (used by other routes)
export async function createNotification(prisma, userId, type, title, message, matchId = null) {
  return prisma.notification.create({
    data: { userId, type, title, message, matchId }
  });
}

export default router;
