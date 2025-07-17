import { Result, ok, err } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type {
  Game,
  Player,
  CheckIn,
  Transaction,
  UUID,
  GameState,
  AmountCents,
  CreateGameInput,
  JoinGameInput,
  SubmitCheckInInput,
  VerifyCheckInInput,
  CashoutInput,
  StartGameInput,
  EndGameInput,
} from "../types/index.js";
import { CreateGameSchema, MoneyUtils } from "../types/index.js";
import { gameStorage } from "../storage/GameStorage.js";
import {
  GameError,
  PlayerError,
  PaymentError,
  ValidationError,
  GameErrors,
  PlayerErrors,
  PaymentErrors,
} from "../utils/errors.js";

/**
 * Game Service - Handles all game business logic with Result pattern
 */
export class GameService {
  // ================================================================================
  // GAME LIFECYCLE OPERATIONS
  // ================================================================================

  /**
   * Create a new game
   */
  createGame(
    input: CreateGameInput
  ): Result<Game, GameError | ValidationError> {
    try {
      let inputParsed = CreateGameSchema.safeParse(input);
      if (!inputParsed.success) {
        return err(new ValidationError(inputParsed.error.message));
      }
      input = inputParsed.data;
      const gameId = uuidv4() as UUID;
      const now = new Date();
      const endDate = new Date(
        now.getTime() + input.duration * 24 * 60 * 60 * 1000
      );

      const game: Game = {
        id: gameId,
        gameMasterId: input.gameMasterId as UUID,
        title: input.title,
        description: input.description,
        gameType: input.gameType,
        stackSize: input.stackSize, // Already in cents from Zod transform
        maxMultiplier: input.maxMultiplier,
        maxPlayers: input.maxPlayers,
        minPlayers: input.minPlayers,
        startDate: now,
        endDate: endDate,
        totalCheckpoints: input.totalCheckpoints,
        checkpointDescriptions: input.checkpointDescriptions,
        state: "WAITING_FOR_PLAYERS",
        players: [],
        checkIns: [],
        transactions: [],
        totalPool: 0,
        totalCashouts: 0,
        bonusPool: 0,
        createdAt: now,
      };

      gameStorage.createGame(game);
      return ok(game);
    } catch (error) {
      return err(new GameError(`Failed to create game: ${error}`));
    }
  }

  /**
   * Join an existing game
   */
  joinGame(
    gameId: UUID,
    input: JoinGameInput
  ): Result<Game, GameError | PlayerError> {
    const game = gameStorage.getGame(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    if (game.state !== "WAITING_FOR_PLAYERS") {
      return err(GameErrors.GAME_ALREADY_STARTED(gameId));
    }

    if (game.players.length >= game.maxPlayers) {
      return err(
        GameErrors.TOO_MANY_PLAYERS(game.players.length, game.maxPlayers)
      );
    }

    if (game.players.some((p) => p.id === input.playerId)) {
      return err(PlayerErrors.PLAYER_ALREADY_JOINED(input.playerId));
    }

    if (input.multiplier > game.maxMultiplier) {
      return err(
        PlayerErrors.INVALID_MULTIPLIER(input.multiplier, game.maxMultiplier)
      );
    }

    const player: Player = {
      id: input.playerId,
      name: input.playerName,
      multiplier: input.multiplier,
      joinedAt: new Date(),
      checkpointsCompleted: 0,
    };

    const stake = game.stackSize * input.multiplier;

    // Create initial stake transaction
    const transaction: Transaction = {
      id: uuidv4() as UUID,
      playerId: input.playerId,
      gameId: gameId,
      type: "INITIAL_STAKE",
      amount: stake,
      timestamp: new Date(),
      description: `Initial stake: ${MoneyUtils.formatCents(stake)}`,
    };

    const updatedGame = gameStorage.addPlayerToGame(gameId, player);
    if (!updatedGame) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    gameStorage.addTransaction(gameId, transaction);

    // Update total pool
    gameStorage.updateGame(gameId, {
      totalPool: updatedGame.totalPool + stake,
    });

    const finalGame = gameStorage.getGame(gameId)!;
    return ok(finalGame);
  }

  /**
   * Start a game (only game master can do this)
   */
  startGame(input: StartGameInput): Result<Game, GameError> {
    const game = gameStorage.getGame(input.gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(input.gameId));
    }

    if (game.gameMasterId !== input.gameMasterId) {
      return err(GameErrors.UNAUTHORIZED_GAME_MASTER(input.gameMasterId));
    }

    if (game.state !== "WAITING_FOR_PLAYERS") {
      return err(GameErrors.GAME_ALREADY_STARTED(input.gameId));
    }

    if (game.players.length < game.minPlayers) {
      return err(
        GameErrors.NOT_ENOUGH_PLAYERS(game.players.length, game.minPlayers)
      );
    }

    const updatedGame = gameStorage.updateGame(input.gameId, {
      state: "IN_PROGRESS" as GameState,
      startedAt: new Date(),
    });

    if (!updatedGame) {
      return err(GameErrors.GAME_NOT_FOUND(input.gameId));
    }

    return ok(updatedGame);
  }

  // ================================================================================
  // CHECKPOINT AND PROGRESS OPERATIONS
  // ================================================================================

  /**
   * Submit a check-in for verification
   */
  submitCheckIn(
    gameId: UUID,
    input: SubmitCheckInInput
  ): Result<CheckIn, GameError | PlayerError> {
    const game = gameStorage.getGame(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    if (game.state !== "IN_PROGRESS") {
      return err(GameErrors.GAME_NOT_STARTED(gameId));
    }

    const player = gameStorage.getPlayer(gameId, input.playerId);
    if (!player) {
      return err(PlayerErrors.PLAYER_NOT_IN_GAME(input.playerId));
    }

    if (player.foldedAtCheckpoint !== undefined) {
      return err(PlayerErrors.PLAYER_ALREADY_FOLDED(input.playerId));
    }

    if (input.checkpointNumber > game.totalCheckpoints) {
      return err(
        PlayerErrors.INVALID_CHECKPOINT(
          input.checkpointNumber,
          game.totalCheckpoints
        )
      );
    }

    if (input.checkpointNumber <= player.checkpointsCompleted) {
      return err(
        PlayerErrors.CHECKPOINT_ALREADY_COMPLETED(input.checkpointNumber)
      );
    }

    const checkIn: CheckIn = {
      id: uuidv4() as UUID,
      playerId: input.playerId,
      gameId: gameId,
      checkpointNumber: input.checkpointNumber,
      submissionData: input.submissionData,
      submittedAt: new Date(),
      status: "PENDING",
    };

    gameStorage.addCheckIn(gameId, checkIn);
    return ok(checkIn);
  }

  /**
   * Verify a check-in (only game master can do this)
   */
  verifyCheckIn(
    gameId: UUID,
    input: VerifyCheckInInput
  ): Result<CheckIn, GameError | PlayerError> {
    const checkIn = gameStorage.getCheckIn(gameId, input.checkInId);
    if (!checkIn) {
      return err(new GameError(`CheckIn ${input.checkInId} not found`));
    }

    if (checkIn.status !== "PENDING") {
      return err(
        new GameError(`CheckIn ${input.checkInId} has already been processed`)
      );
    }

    const updatedCheckIn = gameStorage.updateCheckIn(gameId, input.checkInId, {
      status: input.status,
      verifiedAt: new Date(),
      notes: input.notes,
    });

    if (!updatedCheckIn) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    // If approved, update player's checkpoint progress
    if (input.status === "APPROVED") {
      const result = this.updatePlayerProgress(
        gameId,
        checkIn.playerId,
        checkIn.checkpointNumber
      );
      if (result.isErr()) {
        return err(result.error);
      }
    }

    const finalCheckIn = gameStorage.getCheckIn(gameId, input.checkInId)!;
    return ok(finalCheckIn);
  }

  /**
   * Cash out at current checkpoint (player exits game)
   */
  cashOut(
    gameId: UUID,
    input: CashoutInput
  ): Result<Transaction, GameError | PlayerError | PaymentError> {
    const game = gameStorage.getGame(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    if (game.state !== "IN_PROGRESS") {
      return err(GameErrors.GAME_NOT_STARTED(gameId));
    }

    const player = gameStorage.getPlayer(gameId, input.playerId);
    if (!player) {
      return err(PlayerErrors.PLAYER_NOT_IN_GAME(input.playerId));
    }

    if (player.foldedAtCheckpoint !== undefined) {
      return err(PlayerErrors.PLAYER_ALREADY_FOLDED(input.playerId));
    }

    if (input.checkpointNumber > player.checkpointsCompleted) {
      return err(
        PlayerErrors.INSUFFICIENT_CHECKPOINTS(
          player.checkpointsCompleted,
          input.checkpointNumber
        )
      );
    }

    // Calculate cashout amount
    const stake = game.stackSize * player.multiplier;
    const cashoutAmount = Math.floor(
      (stake / game.totalCheckpoints) * input.checkpointNumber
    );
    const forfeitedAmount = stake - cashoutAmount;

    // Create cashout transaction
    const transaction: Transaction = {
      id: uuidv4() as UUID,
      playerId: input.playerId,
      gameId: gameId,
      type: "CASHOUT",
      amount: cashoutAmount,
      timestamp: new Date(),
      description: `Cashout at checkpoint ${
        input.checkpointNumber
      }: ${MoneyUtils.formatCents(cashoutAmount)}`,
    };

    // Update player as folded
    gameStorage.updatePlayer(gameId, input.playerId, {
      foldedAtCheckpoint: input.checkpointNumber,
    });

    // Add transaction
    gameStorage.addTransaction(gameId, transaction);

    // Update game financial tracking
    gameStorage.updateGame(gameId, {
      totalCashouts: game.totalCashouts + cashoutAmount,
      bonusPool: game.bonusPool + forfeitedAmount,
    });

    return ok(transaction);
  }

  // ================================================================================
  // GAME COMPLETION AND PAYOUT
  // ================================================================================

  /**
   * End the game and distribute bonuses
   */
  endGame(input: EndGameInput): Result<Game, GameError> {
    const game = gameStorage.getGame(input.gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(input.gameId));
    }

    if (game.gameMasterId !== input.gameMasterId) {
      return err(GameErrors.UNAUTHORIZED_GAME_MASTER(input.gameMasterId));
    }

    if (game.state === "ENDED") {
      return err(GameErrors.GAME_ALREADY_ENDED(input.gameId));
    }

    // Calculate and distribute bonuses to winners
    const winners = game.players.filter(
      (p) => p.foldedAtCheckpoint === undefined
    );

    if (winners.length > 0 && game.bonusPool > 0) {
      const totalWinnerStakes = winners.reduce(
        (sum, player) => sum + game.stackSize * player.multiplier,
        0
      );

      for (const winner of winners) {
        const winnerStake = game.stackSize * winner.multiplier;
        const bonusShare = Math.floor(
          (winnerStake / totalWinnerStakes) * game.bonusPool
        );

        // Update player with bonus
        gameStorage.updatePlayer(input.gameId, winner.id, {
          bonusWon: bonusShare,
        });

        // Create payout transaction
        const payoutTransaction: Transaction = {
          id: uuidv4() as UUID,
          playerId: winner.id,
          gameId: input.gameId,
          type: "PAYOUT",
          amount: winnerStake + bonusShare,
          timestamp: new Date(),
          description: `Final payout: ${MoneyUtils.formatCents(
            winnerStake
          )} stake + ${MoneyUtils.formatCents(bonusShare)} bonus`,
        };

        gameStorage.addTransaction(input.gameId, payoutTransaction);
      }
    }

    // Mark game as ended
    const updatedGame = gameStorage.updateGame(input.gameId, {
      state: "ENDED" as GameState,
      endedAt: new Date(),
    });

    if (!updatedGame) {
      return err(GameErrors.GAME_NOT_FOUND(input.gameId));
    }

    return ok(updatedGame);
  }

  // ================================================================================
  // UTILITY METHODS
  // ================================================================================

  private updatePlayerProgress(
    gameId: UUID,
    playerId: UUID,
    checkpointNumber: number
  ): Result<Player, PlayerError> {
    const player = gameStorage.getPlayer(gameId, playerId);
    if (!player) {
      return err(PlayerErrors.PLAYER_NOT_IN_GAME(playerId));
    }

    const updatedGame = gameStorage.updatePlayer(gameId, playerId, {
      checkpointsCompleted: checkpointNumber,
    });

    if (!updatedGame) {
      return err(PlayerErrors.PLAYER_NOT_FOUND(playerId));
    }

    const updatedPlayer = gameStorage.getPlayer(gameId, playerId)!;
    return ok(updatedPlayer);
  }

  /**
   * Get game by ID
   */
  getGame(gameId: UUID): Result<Game, GameError> {
    const game = gameStorage.getGame(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }
    return ok(game);
  }

  /**
   * Get all games by game master
   */
  getGamesByGameMaster(gameMasterId: UUID): Result<Game[], never> {
    const games = gameStorage.getGamesByGameMaster(gameMasterId);
    return ok(games);
  }
}

// Singleton instance
export const gameService = new GameService();
