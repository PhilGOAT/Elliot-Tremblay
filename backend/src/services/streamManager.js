import { Server as SocketServer } from 'socket.io';
import streamCapture from './streamCapture.js';

/**
 * Gestionnaire de streams en temps réel
 * Gère les connexions WebSocket, la capture et l'analyse des streams
 */

class StreamManager {
  constructor() {
    this.io = null;
    this.activeStreams = new Map(); // streamId -> StreamMonitor
    this.prisma = null;
  }

  /**
   * Initialise le serveur WebSocket
   */
  initialize(server, prisma) {
    this.prisma = prisma;
    this.io = new SocketServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.setupSocketHandlers();
    console.log('[StreamManager] WebSocket initialisé');
  }

  /**
   * Configure les handlers WebSocket
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`[WS] Client connecté: ${socket.id}`);

      // Rejoindre un stream
      socket.on('join-stream', async (streamId) => {
        socket.join(`stream:${streamId}`);
        console.log(`[WS] ${socket.id} rejoint stream:${streamId}`);

        // Envoyer l'état actuel du stream
        const stream = this.activeStreams.get(streamId);
        if (stream) {
          socket.emit('stream-state', stream.getState());
        }
      });

      // Quitter un stream
      socket.on('leave-stream', (streamId) => {
        socket.leave(`stream:${streamId}`);
        console.log(`[WS] ${socket.id} quitte stream:${streamId}`);
      });

      // Placer un pari en direct
      socket.on('place-live-bet', async (data, callback) => {
        try {
          const result = await this.placeLiveBet(data);
          callback({ success: true, bet: result });
        } catch (error) {
          callback({ success: false, error: error.message });
        }
      });

      // Déconnexion
      socket.on('disconnect', () => {
        console.log(`[WS] Client déconnecté: ${socket.id}`);
      });
    });
  }

  /**
   * Démarre le monitoring d'un stream
   */
  async startStream(streamId) {
    if (this.activeStreams.has(streamId)) {
      console.log(`[StreamManager] Stream ${streamId} déjà actif`);
      return;
    }

    // Récupérer les infos du stream depuis la DB
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId }
    });

    if (!stream) {
      throw new Error('Stream non trouvé');
    }

    // Créer un nouveau moniteur
    const monitor = new StreamMonitor(stream, this);
    this.activeStreams.set(streamId, monitor);

    // Mettre à jour le statut
    await this.prisma.liveStream.update({
      where: { id: streamId },
      data: { status: 'LIVE', startedAt: new Date() }
    });

    // Démarrer le monitoring
    monitor.start();

    console.log(`[StreamManager] Stream ${streamId} démarré`);
  }

  /**
   * Arrête le monitoring d'un stream
   */
  async stopStream(streamId) {
    const monitor = this.activeStreams.get(streamId);
    if (!monitor) return;

    monitor.stop();
    this.activeStreams.delete(streamId);

    // Mettre à jour le statut
    await this.prisma.liveStream.update({
      where: { id: streamId },
      data: { status: 'ENDED', endedAt: new Date() }
    });

    // Résoudre tous les paris
    await this.settleAllBets(streamId);

    console.log(`[StreamManager] Stream ${streamId} arrêté`);
  }

  /**
   * Met à jour l'état du stream et notifie les clients
   */
  async updateStreamState(streamId, newState) {
    // Mettre à jour la DB
    await this.prisma.liveStream.update({
      where: { id: streamId },
      data: {
        currentScore1: newState.score1,
        currentScore2: newState.score2,
        currentPeriod: newState.period,
        currentTime: newState.time,
        shots1: newState.shots1,
        shots2: newState.shots2,
        hits1: newState.hits1,
        hits2: newState.hits2,
        status: newState.status
      }
    });

    // Notifier tous les clients du stream
    this.io.to(`stream:${streamId}`).emit('stream-update', newState);
  }

  /**
   * Enregistre un événement de match (but, pénalité, etc.)
   */
  async recordEvent(streamId, event) {
    // Sauvegarder l'événement
    const savedEvent = await this.prisma.liveEvent.create({
      data: {
        streamId,
        eventType: event.type,
        period: event.period,
        gameTime: event.time,
        description: event.description,
        player1Score: event.score1,
        player2Score: event.score2
      }
    });

    // Notifier les clients
    this.io.to(`stream:${streamId}`).emit('stream-event', {
      ...savedEvent,
      timestamp: new Date()
    });

    // Gérer les paris liés à cet événement
    if (event.type === 'GOAL') {
      await this.handleGoalEvent(streamId, event);
    }

    return savedEvent;
  }

  /**
   * Gère un événement de but (règle les paris de prochain but, premier but)
   */
  async handleGoalEvent(streamId, event) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId }
    });

    // Régler les paris "prochain but"
    const nextGoalBets = await this.prisma.liveBet.findMany({
      where: {
        streamId,
        betType: 'NEXT_GOAL',
        status: 'PENDING'
      }
    });

    for (const bet of nextGoalBets) {
      const won = bet.prediction === `player${event.team}`;
      await this.settleBet(bet, won);
    }

    // Si c'est le premier but, régler les paris "premier but"
    if (event.score1 + event.score2 === 1) {
      const firstGoalBets = await this.prisma.liveBet.findMany({
        where: {
          streamId,
          betType: 'FIRST_GOAL',
          status: 'PENDING'
        }
      });

      for (const bet of firstGoalBets) {
        const won = bet.prediction === `player${event.team}`;
        await this.settleBet(bet, won);
      }
    }
  }

  /**
   * Place un pari en direct
   */
  async placeLiveBet(data) {
    const { userId, streamId, betType, prediction, amount, odds, spreadValue, totalValue } = data;

    // Vérifier le solde
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.balance < amount) {
      throw new Error('Solde insuffisant');
    }

    // Vérifier que le stream est en cours
    const stream = await this.prisma.liveStream.findUnique({ where: { id: streamId } });
    if (!stream || stream.status !== 'LIVE') {
      throw new Error('Le stream n\'est pas en cours');
    }

    // Déduire le montant du solde
    await this.prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } }
    });

    // Créer le pari
    const bet = await this.prisma.liveBet.create({
      data: {
        userId,
        streamId,
        betType,
        prediction,
        amount,
        odds,
        spreadValue,
        totalValue
      }
    });

    // Notifier le stream d'un nouveau pari
    this.io.to(`stream:${streamId}`).emit('new-bet', {
      betType,
      prediction,
      amount
    });

    return bet;
  }

  /**
   * Règle un pari
   */
  async settleBet(bet, won) {
    const payout = won ? Math.round(bet.amount * bet.odds) : 0;

    // Mettre à jour le pari
    await this.prisma.liveBet.update({
      where: { id: bet.id },
      data: {
        status: won ? 'WON' : 'LOST',
        payout,
        settledAt: new Date()
      }
    });

    // Créditer le gagnant
    if (won && payout > 0) {
      await this.prisma.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: payout } }
      });
    }

    // Notifier le client
    this.io.to(`stream:${bet.streamId}`).emit('bet-settled', {
      betId: bet.id,
      won,
      payout
    });
  }

  /**
   * Règle tous les paris à la fin du match
   */
  async settleAllBets(streamId) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId }
    });

    if (!stream) return;

    const pendingBets = await this.prisma.liveBet.findMany({
      where: { streamId, status: 'PENDING' }
    });

    const winner = stream.currentScore1 > stream.currentScore2 ? 'player1' :
                   stream.currentScore2 > stream.currentScore1 ? 'player2' : 'draw';
    const totalGoals = stream.currentScore1 + stream.currentScore2;

    for (const bet of pendingBets) {
      let won = false;

      switch (bet.betType) {
        case 'MATCH_WINNER':
          won = bet.prediction === winner;
          break;

        case 'SPREAD':
          // Ex: prediction="player1", spreadValue=-1.5
          const score1WithSpread = stream.currentScore1 + (bet.prediction === 'player1' ? bet.spreadValue : 0);
          const score2WithSpread = stream.currentScore2 + (bet.prediction === 'player2' ? bet.spreadValue : 0);
          won = bet.prediction === 'player1' ? score1WithSpread > stream.currentScore2 : score2WithSpread > stream.currentScore1;
          break;

        case 'TOTAL_GOALS':
          won = (bet.prediction === 'over' && totalGoals > bet.totalValue) ||
                (bet.prediction === 'under' && totalGoals < bet.totalValue);
          break;

        case 'EXACT_SCORE':
          won = bet.prediction === `${stream.currentScore1}-${stream.currentScore2}`;
          break;

        case 'TEAM_TOTAL':
          const teamTotal = bet.prediction.startsWith('player1') ? stream.currentScore1 : stream.currentScore2;
          const overUnder = bet.prediction.includes('over') ? 'over' : 'under';
          won = (overUnder === 'over' && teamTotal > bet.totalValue) ||
                (overUnder === 'under' && teamTotal < bet.totalValue);
          break;
      }

      await this.settleBet(bet, won);
    }

    console.log(`[StreamManager] ${pendingBets.length} paris réglés pour stream ${streamId}`);
  }

  /**
   * Obtient la liste des streams actifs
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.keys());
  }
}

/**
 * Moniteur individuel pour un stream
 */
class StreamMonitor {
  constructor(stream, manager) {
    this.stream = stream;
    this.manager = manager;
    this.interval = null;
    this.previousState = null;
    this.captureInterval = 5000; // 5 secondes entre chaque capture
  }

  /**
   * Démarre le monitoring
   */
  start() {
    console.log(`[Monitor] Démarrage monitoring pour ${this.stream.id}`);

    this.interval = setInterval(async () => {
      await this.captureAndAnalyze();
    }, this.captureInterval);
  }

  /**
   * Arrête le monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log(`[Monitor] Arrêt monitoring pour ${this.stream.id}`);
  }

  /**
   * Capture et analyse une frame du stream
   */
  async captureAndAnalyze() {
    try {
      // Capturer une frame
      const imageBuffer = await streamCapture.captureStreamFrame(this.stream.streamUrl);

      // Analyser l'image
      const currentState = await streamCapture.analyzeScreenshot(imageBuffer);

      if (currentState) {
        // Détecter les changements
        await this.processStateChange(currentState);
      }
    } catch (error) {
      console.error(`[Monitor] Erreur capture ${this.stream.id}:`, error.message);
    }
  }

  /**
   * Traite les changements d'état
   */
  async processStateChange(currentState) {
    // Détecter un but
    const goal = streamCapture.detectGoal(this.previousState, currentState);
    if (goal) {
      await this.manager.recordEvent(this.stream.id, {
        type: 'GOAL',
        team: goal.team,
        period: goal.period,
        time: goal.time,
        score1: goal.newScore1,
        score2: goal.newScore2,
        description: `But! Score: ${goal.newScore1} - ${goal.newScore2}`
      });
    }

    // Détecter changement de période
    if (this.previousState && this.previousState.period !== currentState.period) {
      if (currentState.period > this.previousState.period) {
        await this.manager.recordEvent(this.stream.id, {
          type: 'PERIOD_START',
          period: currentState.period,
          time: currentState.time,
          score1: currentState.score1,
          score2: currentState.score2,
          description: `Début période ${currentState.period}`
        });
      }
    }

    // Détecter entre-périodes
    if (currentState.screenType === 'INTERMISSION' &&
        this.previousState?.screenType !== 'INTERMISSION') {
      await this.manager.recordEvent(this.stream.id, {
        type: 'PERIOD_END',
        period: currentState.period,
        time: '00:00',
        score1: currentState.score1,
        score2: currentState.score2,
        description: `Fin période ${currentState.period}`
      });

      // Mettre à jour avec les stats
      await this.manager.updateStreamState(this.stream.id, {
        ...currentState,
        status: 'INTERMISSION'
      });
    }

    // Mettre à jour l'état
    await this.manager.updateStreamState(this.stream.id, {
      score1: currentState.score1,
      score2: currentState.score2,
      period: currentState.period,
      time: currentState.time,
      shots1: currentState.shots1,
      shots2: currentState.shots2,
      status: currentState.screenType === 'INTERMISSION' ? 'INTERMISSION' : 'LIVE'
    });

    this.previousState = currentState;
  }

  /**
   * Retourne l'état actuel
   */
  getState() {
    return {
      streamId: this.stream.id,
      ...this.previousState,
      status: this.stream.status
    };
  }
}

// Singleton
const streamManager = new StreamManager();

export default streamManager;
