import { gameStorage } from "../storage/GameStorage.js";
import type { Game, UUID } from "../types/index.js";
import { gameService } from "./GameService.js";

/**
 * Background Worker Service
 * Handles automated game lifecycle management:
 * - Starting games when startDate is reached
 * - Ending games when endDate is reached
 * - Processing checkpoint expiry
 * - Force cashouts for missed checkpoints
 */
export class BackgroundWorkerService {
  private static instance: BackgroundWorkerService;
  private isRunning = false;
  private intervalId: globalThis.NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): BackgroundWorkerService {
    if (!BackgroundWorkerService.instance) {
      BackgroundWorkerService.instance = new BackgroundWorkerService();
    }
    return BackgroundWorkerService.instance;
  }

  /**
   * Start the background worker
   */
  start(): void {
    if (this.isRunning) {
      console.log("Background worker is already running");
      return;
    }

    this.isRunning = true;
    console.log("Starting background worker...");

    // Run immediately, then every 5 minutes
    this.processGames();
    this.intervalId = global.setInterval(() => {
      this.processGames();
    }, this.CHECK_INTERVAL_MS);

    console.log(
      `Background worker started - checking every ${this.CHECK_INTERVAL_MS / 1000}s`
    );
  }

  /**
   * Stop the background worker
   */
  stop(): void {
    if (!this.isRunning) {
      console.log("Background worker is not running");
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      global.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("Background worker stopped");
  }

  /**
   * Process all games for lifecycle events
   */
  private processGames(): void {
    const now = new Date();
    const activeGames = gameStorage.getActiveGamesCopy();

    console.log(
      `Background worker processing ${activeGames.length} games at ${now.toISOString()}`
    );

    for (const game of activeGames) {
      try {
        // 1. Start games that are ready
        if (game.state === "WAITING_FOR_PLAYERS" && now >= game.startDate) {
          this.startGameIfReady(game);
        } else if (game.state === "IN_PROGRESS" && now >= game.endDate) {
          this.endGame(game);
        } else if (game.state === "IN_PROGRESS") {
          this.processCheckpointExpiry(game, now);
        }
      } catch (error) {
        console.error(`Error processing game ${game.id}:`, error);
      }
    }
  }

  /**
   * Start a game if it has enough players
   */
  private startGameIfReady(game: Game): void {
    console.log(
      `Starting game ${game.id} - ${game.players.length}/${game.maxPlayers} players joined`
    );

    const startResult = gameService.startGame({
      gameId: game.id,
      gameMasterId: game.gameMasterId,
    });

    if (startResult.isErr()) {
      console.error(
        `Failed to start game ${game.id}:`,
        startResult.error.message
      );
    } else {
      console.log(`✅ Game ${game.id} started successfully`);
    }
  }

  /**
   * End a game that has reached its end time
   */
  private endGame(game: Game): void {
    console.log(
      `Ending game ${game.id} - end time reached: ${game.endDate.toISOString()}`
    );

    const endResult = gameService.endGame({
      gameId: game.id,
      gameMasterId: game.gameMasterId,
    });

    if (endResult.isErr()) {
      console.error(`Failed to end game ${game.id}:`, endResult.error.message);
    } else {
      console.log(`✅ Game ${game.id} ended successfully`);
    }
  }

  /**
   * Process checkpoint expiry for all active games
   * Assumes game is in IN_PROGRESS state
   */
  private processCheckpointExpiry(game: Game, now: Date): void {
    // Check each checkpoint for expiry
    for (
      let checkpointIndex = 0;
      checkpointIndex < game.checkpoints.length;
      checkpointIndex++
    ) {
      const checkpoint = game.checkpoints[checkpointIndex];
      const checkpointNumber = checkpointIndex + 1;

      // Skip if checkpoint hasn't expired yet
      if (now < checkpoint.expiryDate) {
        continue;
      }

      console.log(
        `Checkpoint ${checkpointNumber} expired in game ${game.id} at ${checkpoint.expiryDate.toISOString()}`
      );

      // Process expiry for each player
      this.processExpiredCheckpointForPlayers(game, checkpointNumber);

      // Special handling for the last checkpoint
      if (checkpointNumber === game.checkpoints.length) {
        this.handleLastCheckpointExpiry(game, now);
      }
    }
  }

  /**
   * Process expired checkpoint for all players who haven't completed it
   * NOTE: If there's a pending check-in, it will be approved automatically because the game master wasn't able to verify it
   */
  private processExpiredCheckpointForPlayers(
    game: Game,
    checkpointNumber: number
  ): void {
    for (const player of game.players) {
      // Skip players who are already folded
      if (player.foldedAtCheckpoint !== undefined) {
        continue;
      }

      // Check if player has a PENDING or APPROVED check-in for this checkpoint
      const playerCheckIns = gameStorage.getPlayerCheckInsCopy(
        game.id,
        player.id
      );
      const checkpointCheckIn = playerCheckIns.find(
        (c) =>
          c.checkpointNumber === checkpointNumber &&
          (c.status === "APPROVED" || c.status === "PENDING")
      );

      // If player has completed this checkpoint, skip
      if (checkpointCheckIn) {
        if (checkpointCheckIn.status === "PENDING") {
          // Safe because game and checkpoint both exist
          gameService.verifyCheckIn(game.id, {
            checkInId: checkpointCheckIn.id,
            gameId: game.id,
            gameMasterId: game.gameMasterId,
            verifiedBy: "TIMEOUT_APPROVAL",
            status: "APPROVED",
            notes:
              "Automated approval because of game master did not verify in time",
          });
          console.log(
            `✅ Check-in ${checkpointCheckIn.id} for player ${player.name} in game ${game.id} approved automatically because of timeout`
          );
        }
        continue;
      }

      // Player missed this checkpoint
      console.log(
        `Player ${player.name} missed checkpoint ${checkpointNumber} in game ${game.id}`
      );

      // Force cashout if enabled
      if (game.forceCashoutOnMiss) {
        this.forceCashoutPlayer(
          game.id,
          player.id,
          `Missed checkpoint ${checkpointNumber}`
        );
      }
    }
  }

  /**
   * Handle the last checkpoint expiry - may need to end the game
   */
  private handleLastCheckpointExpiry(game: Game, now: Date): void {
    const remainingTime = game.endDate.getTime() - now.getTime();
    if (remainingTime > 0) {
      console.log(
        `Last checkpoint expired for game ${game.id}. Scheduling game end in ${remainingTime} milliseconds.`
      );
    }
    global.setTimeout(() => {
      console.log(`Game end time reached for game ${game.id} - ending game`);
      this.endGame(game);
    }, remainingTime);
  }

  /**
   * Force cashout a player who missed a checkpoint
   */
  private forceCashoutPlayer(
    gameId: UUID,
    playerId: UUID,
    reason: string
  ): void {
    console.log(
      `Force cashing out player ${playerId} from game ${gameId}: ${reason}`
    );

    const cashoutResult = gameService.cashOut(gameId, {
      playerId,
    });

    if (cashoutResult.isErr()) {
      console.error(
        `Failed to force cashout player ${playerId}:`,
        cashoutResult.error.message
      );
    } else {
      console.log(`✅ Player ${playerId} force cashed out: ${reason}`);
    }
  }

  /**
   * Get worker status
   */
  getStatus(): { isRunning: boolean; checkInterval: number } {
    return {
      isRunning: this.isRunning,
      checkInterval: this.CHECK_INTERVAL_MS,
    };
  }
}

// Export singleton instance
export const backgroundWorker = BackgroundWorkerService.getInstance();
