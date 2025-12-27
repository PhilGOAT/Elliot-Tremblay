import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// Inscription
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, xboxGamertag, psnId, eaId, nintendoId, steamName, twitchUsername, streamingConsent, streamVisibility } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Vérifier qu'au moins un gamertag est fourni
    if (!xboxGamertag && !psnId && !eaId && !nintendoId && !steamName && !twitchUsername) {
      return res.status(400).json({ error: 'Au moins un gamertag est requis' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    const user = await req.prisma.user.create({
      data: {
        username: username.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        xboxGamertag: xboxGamertag || null,
        psnId: psnId || null,
        eaId: eaId || null,
        nintendoId: nintendoId || null,
        steamName: steamName || null,
        twitchUsername: twitchUsername || null,
        streamingConsent: streamingConsent || false,
        streamVisibility: streamVisibility || 'private'
      },
      select: {
        id: true,
        username: true,
        email: true,
        balance: true,
        wins: true,
        losses: true,
        xboxGamertag: true,
        psnId: true,
        eaId: true,
        nintendoId: true,
        steamName: true,
        twitchUsername: true,
        streamingConsent: true,
        streamVisibility: true,
        createdAt: true
      }
    });

    // Générer le token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'xbox-betting-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Trouver l'utilisateur
    const user = await req.prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Générer le token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'xbox-betting-secret-key',
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

export default router;
