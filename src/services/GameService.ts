import { err, ok, Result } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import { gameStorage } from "../storage/GameStorage.js";
import type {
  CashoutInput,
  CheckIn,
  CreateGameInput,
  EndGameInput,
  Game,
  JoinGameInput,
  Player,
  StartGameInput,
  SubmitCheckInInput,
  Transaction,
  UUID,
  VerifyCheckInInput,
} from "../types/index.js";
import {
  CreateGameSchema,
  JoinGameSchema,
  MoneyUtils,
  StartGameSchema,
  SubmitCheckInSchema,
  VerifyCheckInSchema,
} from "../types/index.js";
import {
  GameError,
  GameErrors,
  InvalidSubmissionError,
  LLMError,
  PaymentError,
  PlayerError,
  PlayerErrors,
  ValidationError,
} from "../utils/errors.js";
import {
  createLLM,
  type ModelConfig,
  type VerificationRequest,
} from "./LLMService.js";

/**
 * Game Service - Handles all game business logic with Result pattern
 */
export class GameService {
  private static instance: GameService;

  private constructor() {}

  public static getInstance(): GameService {
    if (!GameService.instance) {
      GameService.instance = new GameService();
    }
    return GameService.instance;
  }

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
      const inputParsed = CreateGameSchema.safeParse(input);
      if (!inputParsed.success) {
        return err(new ValidationError(inputParsed.error.message));
      }
      input = inputParsed.data;
      const gameId = uuidv4() as UUID;

      // Validate that end date is after start date
      if (input.endDate <= input.startDate) {
        return err(new ValidationError("End date must be after start date"));
      }

      // AI verification is already sanitized by Zod schema if provided
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
        startDate: input.startDate,
        endDate: input.endDate,
        checkpoints: input.checkpoints,
        verificationMethod: input.verificationMethod,
        aiVerification: input.aiVerification,
        objective: input.objective,
        playerAction: input.playerAction,
        rewardDescription: input.rewardDescription,
        failureCondition: input.failureCondition,
        forceCashoutOnMiss: input.forceCashoutOnMiss,
        state: "WAITING_FOR_PLAYERS",
        players: [],
        checkIns: [],
        transactions: [],
        totalPool: 0,
        totalCashouts: 0,
        bonusPool: 0,
      };

      gameStorage.createGameMut(game);
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
    const inputParsed = JoinGameSchema.safeParse(input);
    if (!inputParsed.success) {
      return err(new ValidationError(inputParsed.error.message));
    }
    input = inputParsed.data;

    const gameCopy = gameStorage.getGameCopy(gameId);
    if (!gameCopy) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    if (gameCopy.state !== "WAITING_FOR_PLAYERS") {
      return err(GameErrors.GAME_ALREADY_STARTED(gameId));
    }

    if (gameCopy.players.length >= gameCopy.maxPlayers) {
      return err(
        GameErrors.TOO_MANY_PLAYERS(
          gameCopy.players.length,
          gameCopy.maxPlayers
        )
      );
    }

    if (gameCopy.players.some((p) => p.id === input.playerId)) {
      return err(PlayerErrors.PLAYER_ALREADY_JOINED(input.playerId));
    }

    if (input.multiplier > gameCopy.maxMultiplier) {
      return err(
        PlayerErrors.INVALID_MULTIPLIER(
          input.multiplier,
          gameCopy.maxMultiplier
        )
      );
    }

    const player: Player = {
      id: input.playerId,
      name: input.playerName,
      multiplier: input.multiplier,
      joinedAt: new Date(),
      checkpointsCompleted: 0,
    };

    const stake = gameCopy.stackSize * input.multiplier;

    // Create initial stake transaction
    const transaction: Transaction = {
      id: uuidv4() as UUID,
      playerId: input.playerId,
      gameId: gameCopy.id,
      type: "INITIAL_STAKE",
      amount: stake,
      timestamp: new Date(),
      description: `Initial stake of ${MoneyUtils.formatCents(stake)} by ${
        input.playerName
      }`,
    };

    // 1. Add player to game
    gameStorage.addPlayerToGameUncheckedMut(gameCopy.id, player);

    // 2. Add transaction to game
    gameStorage.addTransactionUncheckedMut(gameCopy.id, transaction);

    // 3. Update total pool
    gameStorage.addToPoolUncheckedMut(gameCopy.id, stake);

    // 4. Return the game copy
    const game = gameStorage.getGameCopy(gameCopy.id);
    if (!game) {
      throw new Error("Game not found, this should never happen");
    }
    return ok(game);
  }

  /**
   * Start a game (auto-starts when startTime is reached and has enough players)
   */
  startGame(input: StartGameInput): Result<Game, GameError> {
    const inputParsed = StartGameSchema.safeParse(input);
    if (!inputParsed.success) {
      return err(new ValidationError(inputParsed.error.message));
    }
    input = inputParsed.data;

    const gameCopy = gameStorage.getGameCopy(input.gameId);
    if (!gameCopy) {
      return err(GameErrors.GAME_NOT_FOUND(input.gameId));
    }

    if (gameCopy.gameMasterId !== input.gameMasterId) {
      return err(GameErrors.UNAUTHORIZED_GAME_MASTER(input.gameMasterId));
    }

    if (gameCopy.state !== "WAITING_FOR_PLAYERS") {
      return err(GameErrors.GAME_ALREADY_STARTED(input.gameId));
    }

    const now = new Date();
    const oneHourAfterStart = new Date(
      gameCopy.startDate.getTime() + 60 * 60 * 1000
    );

    if (gameCopy.startDate > now || now > oneHourAfterStart) {
      return err(
        GameErrors.INVALID_START_TIME(input.gameId, now, gameCopy.startDate)
      );
    }

    if (gameCopy.players.length < gameCopy.minPlayers) {
      return err(
        GameErrors.NOT_ENOUGH_PLAYERS(
          gameCopy.players.length,
          gameCopy.minPlayers
        )
      );
    }

    gameStorage.updateGameStatusUncheckedMut(input.gameId, "IN_PROGRESS");
    //  Return the game copy
    const game = gameStorage.getGameCopy(input.gameId);
    if (!game) {
      throw new Error("Game not found, this should never happen");
    }
    return ok(game);
  }

  // ================================================================================
  // CHECKPOINT AND PROGRESS OPERATIONS
  // ================================================================================

  /**
   * Submit a check-in for verification
   */
  async submitCheckIn(
    gameId: UUID,
    input: SubmitCheckInInput
  ): Promise<Result<CheckIn, GameError | PlayerError>> {
    const inputParsed = SubmitCheckInSchema.safeParse(input);
    if (!inputParsed.success) {
      return err(new ValidationError(inputParsed.error.message));
    }
    input = inputParsed.data;

    const game = gameStorage.getGameCopy(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    if (game.state !== "IN_PROGRESS") {
      return err(GameErrors.GAME_NOT_STARTED(gameId));
    }

    const player = gameStorage.getPlayerUncheckedCopy(gameId, input.playerId);
    if (!player) {
      return err(PlayerErrors.PLAYER_NOT_IN_GAME(input.playerId));
    }

    if (player.foldedAtCheckpoint !== undefined) {
      return err(PlayerErrors.PLAYER_ALREADY_FOLDED(input.playerId));
    }

    if (input.checkpointNumber > game.checkpoints.length) {
      return err(
        PlayerErrors.INVALID_CHECKPOINT(
          input.checkpointNumber,
          game.checkpoints.length
        )
      );
    }

    const playersCheckIns = gameStorage.getPlayerCheckInsCopy(
      gameId,
      input.playerId
    );

    // Only add if checkpoint is rejected or not pending or not approved
    if (
      playersCheckIns.some(
        (c) =>
          c.checkpointNumber === input.checkpointNumber &&
          c.status === "PENDING"
      )
    ) {
      return err(
        PlayerErrors.CHECKPOINT_ALREADY_PENDING(input.checkpointNumber)
      );
    }

    if (
      playersCheckIns.some(
        (c) =>
          c.checkpointNumber === input.checkpointNumber &&
          c.status === "APPROVED"
      )
    ) {
      return err(
        PlayerErrors.CHECKPOINT_ALREADY_COMPLETED(input.checkpointNumber)
      );
    }

    if (new Date() > game.checkpoints[input.checkpointNumber - 1].expiryDate) {
      return err(
        GameErrors.CHECKPOINT_EXPIRED(input.checkpointNumber, game.id)
      );
    }

    // Note: All media format validation (supported types, file sizes, format validation, etc.)
    // is now handled automatically by the Zod schemas when input is parsed

    const checkIn: CheckIn = {
      id: uuidv4() as UUID,
      playerId: input.playerId,
      gameId,
      checkpointNumber: input.checkpointNumber,
      proof: input.proof,
      submittedAt: new Date(),
      status: "PENDING",
    };

    // Store the check-in
    gameStorage.addCheckInUncheckedMut(gameId, checkIn);

    // 2. If AI verification is enabled, trigger automatic verification
    if (game.verificationMethod === "AI") {
      // Trigger AI verification asynchronously (don't wait for result)
      const result = await this.verifyCheckInWithAI(gameId, checkIn.id);
      if (result.isErr()) {
        // revert check-in creation and return error
        gameStorage.deleteCheckInUncheckedMut(gameId, checkIn.id);
        return err(result.error);
      }
    }
    // Check if this is the final checkpoint and player completed it
    const isLastCheckpoint =
      checkIn.checkpointNumber === game.checkpoints.length;

    if (isLastCheckpoint && checkIn.status === "APPROVED") {
      // Player completed the final checkpoint successfully
      const completedPlayer = game.players.find(
        (p) => p.id === checkIn.playerId
      );
      if (
        completedPlayer &&
        completedPlayer.checkpointsCompleted === game.checkpoints.length
      ) {
        // Player has completed all checkpoints - they'll get rewards when game ends
        console.log(
          `Player ${completedPlayer.name} completed all checkpoints!`
        );
      }
    }
    // 3. Return the check-in
    const checkInCopy = gameStorage.getCheckInUncheckedCopy(gameId, checkIn.id);
    if (!checkInCopy) {
      throw new Error("Check-in not found, this should never happen");
    }
    return ok(checkInCopy);
  }

  /**
   * Verify a check-in using AI
   */
  private async verifyCheckInWithAI(
    gameId: UUID,
    checkInId: UUID
  ): Promise<Result<CheckIn, GameError | LLMError | InvalidSubmissionError>> {
    const game = gameStorage.getGameCopy(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    if (game.verificationMethod !== "AI" || !game.aiVerification) {
      return err(new GameError("AI verification is not enabled for this game"));
    }

    const checkIn = gameStorage.getCheckInUncheckedCopy(gameId, checkInId);
    if (!checkIn) {
      return err(GameErrors.CHECK_IN_NOT_FOUND(checkInId));
    }

    if (checkIn.status !== "PENDING") {
      return err(new GameError("Check-in is not pending verification"));
    }

    // Get AI configuration from environment
    const aiConfig: ModelConfig = {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      baseUrl:
        process.env.OPENAI_BASE_URL ??
        "https://api.openai.com/v1/chat/completions",
      model: process.env.OPENAI_MODEL ?? "gpt-4",
      provider: "openai",
    };

    if (!aiConfig.apiKey) {
      return err(new LLMError("AI API key not configured"));
    }

    const llm = createLLM(aiConfig);

    // Build verification request
    const verificationRequest: VerificationRequest = {
      objective: game.objective,
      playerAction: game.playerAction,
      rewardDescription: game.rewardDescription,
      failureCondition: game.failureCondition,
      prompt: game.aiVerification.prompt,
      checkpointDescription:
        game.checkpoints[checkIn.checkpointNumber - 1].description,
      submissionData: {
        proof: checkIn.proof,
      },
      sampleApprovals:
        game.checkpoints[checkIn.checkpointNumber - 1].sampleApproval,
      sampleRejections:
        game.checkpoints[checkIn.checkpointNumber - 1].sampleRejection,
    };

    const verificationResult = await llm.verifyCheckIn(verificationRequest);

    if (verificationResult.isErr()) {
      // AI verification failed - mark for manual review
      gameStorage.needsReviewCheckInUncheckedMut(
        gameId,
        checkInId,
        "AI",
        0.0, // Low confidence since AI failed
        `AI verification failed: ${verificationResult.error.message}. Please review manually.`
      );

      const finalCheckIn = gameStorage.getCheckInUncheckedCopy(
        gameId,
        checkInId
      );
      if (!finalCheckIn) {
        throw new Error("Check-in not found, this should never happen");
      }

      return ok(finalCheckIn);
    }

    const verification = verificationResult.value;

    // Update check-in based on AI decision
    if (verification.decision === "APPROVED") {
      gameStorage.approveCheckInUncheckedMut(
        gameId,
        checkInId,
        "AI",
        verification.confidence,
        verification.reasoning
      );

      // Update player progress
      gameStorage.increasePlayerProgressUncheckedMut(gameId, checkIn.playerId);
    } else if (verification.decision === "REJECTED") {
      gameStorage.rejectCheckInUncheckedMut(
        gameId,
        checkInId,
        "AI",
        verification.confidence,
        verification.reasoning
      );
    } else if (verification.decision === "NEEDS_REVIEW") {
      gameStorage.needsReviewCheckInUncheckedMut(
        gameId,
        checkInId,
        "AI",
        verification.confidence,
        verification.reasoning
      );
    } else if (verification.decision === "INVALID_SUBMISSION") {
      // Mark as invalid submission
      return err(
        new InvalidSubmissionError(
          `Invalid submission: ${verification.reasoning}. Please provide clearer verification materials.`,
          verification.confidence
        )
      );
    }

    const finalCheckIn = gameStorage.getCheckInUncheckedCopy(gameId, checkInId);
    if (!finalCheckIn) {
      throw new Error("Check-in not found, this should never happen");
    }

    return ok(finalCheckIn);
  }

  /**
   * Verify a check-in (only game master can do this)
   */
  verifyCheckIn(
    gameId: UUID,
    input: VerifyCheckInInput
  ): Result<CheckIn, GameError | PlayerError> {
    const inputParsed = VerifyCheckInSchema.safeParse(input);
    if (!inputParsed.success) {
      return err(new ValidationError(inputParsed.error.message));
    }
    input = inputParsed.data;

    const gameCopy = gameStorage.getGameCopy(gameId);
    if (!gameCopy) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    const checkIn = gameStorage.getCheckInUncheckedCopy(
      gameId,
      input.checkInId
    );

    if (!checkIn) {
      return err(GameErrors.CHECK_IN_NOT_FOUND(input.checkInId));
    }

    if (gameCopy.gameMasterId !== input.gameMasterId) {
      return err(GameErrors.UNAUTHORIZED_GAME_MASTER(input.gameMasterId));
    }

    if (gameCopy.state === "ENDED") {
      return err(GameErrors.GAME_ALREADY_ENDED(gameId));
    }

    if (gameCopy.state === "WAITING_FOR_PLAYERS") {
      return err(GameErrors.GAME_NOT_STARTED(gameId));
    }

    if (checkIn.status === "APPROVED") {
      return err(GameErrors.CHECK_IN_ALREADY_APPROVED(input.checkInId));
    }

    if (checkIn.status === "REJECTED") {
      return err(GameErrors.CHECK_IN_REJECTED(input.checkInId));
    }

    const player = gameStorage.getPlayerUncheckedCopy(gameId, checkIn.playerId);
    if (!player) {
      return err(PlayerErrors.PLAYER_NOT_IN_GAME(checkIn.playerId));
    }

    if (player.foldedAtCheckpoint !== undefined) {
      return err(PlayerErrors.PLAYER_ALREADY_FOLDED(checkIn.playerId));
    }

    switch (input.status) {
      case "APPROVED":
        gameStorage.approveCheckInUncheckedMut(
          gameId,
          input.checkInId,
          input.verifiedBy,
          undefined,
          input.notes
        );

        // Update player progress
        gameStorage.increasePlayerProgressUncheckedMut(
          gameId,
          checkIn.playerId
        );
        break;

      case "REJECTED":
        gameStorage.rejectCheckInUncheckedMut(
          gameId,
          input.checkInId,
          input.verifiedBy,
          undefined,
          input.notes
        );
        break;
    }

    const finalCheckIn = gameStorage.getCheckInUncheckedCopy(
      gameId,
      input.checkInId
    );
    if (!finalCheckIn) {
      throw new Error("Check-in not found, this should never happen");
    }
    return ok(finalCheckIn);
  }

  /**
   * Cash out at current checkpoint (player exits game)
   */
  cashOut(
    gameId: UUID,
    input: CashoutInput
  ): Result<Transaction, GameError | PlayerError | PaymentError> {
    const game = gameStorage.getGameCopy(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    if (game.state !== "IN_PROGRESS") {
      return err(GameErrors.GAME_NOT_STARTED(gameId));
    }

    const player = gameStorage.getPlayerUncheckedCopy(gameId, input.playerId);
    if (!player) {
      return err(PlayerErrors.PLAYER_NOT_IN_GAME(input.playerId));
    }

    if (player.foldedAtCheckpoint !== undefined) {
      return err(PlayerErrors.PLAYER_ALREADY_FOLDED(input.playerId));
    }

    // Calculate cashout amount
    const stake = game.stackSize * player.multiplier;
    const cashoutAmount = Math.floor(
      (stake * player.checkpointsCompleted) / game.checkpoints.length
    );
    const forfeitedAmount = stake - cashoutAmount;

    // Create cashout transaction
    const transaction: Transaction = {
      id: uuidv4() as UUID,
      playerId: input.playerId,
      gameId,
      type: "CASHOUT",
      amount: cashoutAmount,
      timestamp: new Date(),
      description: `Cashout at checkpoint ${player.checkpointsCompleted} of ${
        game.checkpoints.length
      }: ${MoneyUtils.formatCents(cashoutAmount)} for ${player.name}`,
    };

    // Update player as folded // player exists and is not folded
    gameStorage.foldPlayerUncheckedMut(gameId, input.playerId);

    // Add transaction
    gameStorage.addTransactionUncheckedMut(gameId, transaction);

    // Update game financial tracking
    gameStorage.cashoutPlayerUncheckedMut(
      gameId,
      cashoutAmount,
      forfeitedAmount
    );

    return ok(transaction);
  }

  // ================================================================================
  // READ OPERATIONS
  // ================================================================================

  /**
   * Get a game by ID
   */
  getGame(gameId: UUID): Result<Game, GameError> {
    const game = gameStorage.getGameCopy(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }
    return ok(game);
  }

  /**
   * Get all games for a game master
   */
  getGamesByGameMaster(gameMasterId: UUID): Game[] {
    return gameStorage.getGamesByGameMasterCopy(gameMasterId);
  }

  /**
   * Get check-ins for a specific player in a game
   */
  getPlayerCheckIns(
    gameId: UUID,
    playerId: UUID
  ): Result<CheckIn[], GameError> {
    const game = gameStorage.getGameCopy(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    const checkIns = gameStorage.getPlayerCheckInsCopy(gameId, playerId);
    return ok(checkIns);
  }

  /**
   * Get all transactions for a game
   */
  getGameTransactions(gameId: UUID): Result<Transaction[], GameError> {
    const game = gameStorage.getGameCopy(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    const transactions = gameStorage.getGameTransactionsCopy(gameId);
    return ok(transactions);
  }

  /**
   * Get transactions for a specific player in a game
   */
  getPlayerTransactions(
    gameId: UUID,
    playerId: UUID
  ): Result<Transaction[], GameError> {
    const game = gameStorage.getGameCopy(gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(gameId));
    }

    const transactions = gameStorage.getPlayerTransactionsCopy(
      gameId,
      playerId
    );
    return ok(transactions);
  }

  // ================================================================================
  // GAME COMPLETION AND PAYOUT
  // ================================================================================

  /**
   * End the game and distribute bonuses
   */
  endGame(input: EndGameInput): Result<Game, GameError> {
    const game = gameStorage.getGameCopy(input.gameId);
    if (!game) {
      return err(GameErrors.GAME_NOT_FOUND(input.gameId));
    }

    if (game.gameMasterId !== input.gameMasterId) {
      return err(GameErrors.UNAUTHORIZED_GAME_MASTER(input.gameMasterId));
    }

    if (game.state === "ENDED") {
      return err(GameErrors.GAME_ALREADY_ENDED(input.gameId));
    }

    if (game.state === "WAITING_FOR_PLAYERS") {
      return err(GameErrors.GAME_NOT_STARTED(input.gameId));
    }

    // Calculate and distribute bonuses to winners
    const nonCashedOutPlayers = game.players.filter(
      (p) =>
        p.foldedAtCheckpoint === undefined &&
        p.checkpointsCompleted !== game.checkpoints.length
    );

    for (const player of nonCashedOutPlayers) {
      this.cashOut(game.id, {
        playerId: player.id,
      });
    }

    const winners = game.players.filter(
      (p) =>
        p.foldedAtCheckpoint === undefined &&
        p.checkpointsCompleted === game.checkpoints.length
    );

    if (winners.length > 0 && game.bonusPool > 0) {
      const totalWinnerStakes = winners.reduce(
        (sum, player) => sum + game.stackSize * player.multiplier,
        0
      );

      for (const winner of winners) {
        const winnerStake = game.stackSize * winner.multiplier;
        const bonusShare = Math.floor(
          (winnerStake * game.bonusPool) / totalWinnerStakes
        );

        // Update player with bonus // player exists and is not folded
        gameStorage.addPlayerBonusUncheckedMut(
          input.gameId,
          winner.id,
          bonusShare
        );

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

        gameStorage.addTransactionUncheckedMut(input.gameId, payoutTransaction);
      }
    }

    // Mark game as ended
    gameStorage.updateGameStatusUncheckedMut(input.gameId, "ENDED");

    const gameCopy = gameStorage.getGameCopy(input.gameId);
    if (!gameCopy) {
      throw new Error("Game not found, this should never happen");
    }
    return ok(gameCopy);
  }
}

// Singleton instance
export const gameService = GameService.getInstance();
