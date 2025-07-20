import { cloneDeep } from "lodash";
import type {
  AmountCents,
  CheckIn,
  Game,
  GameState,
  Player,
  Transaction,
  UUID,
} from "../types/index.js";
/**
 * In-memory storage for games using Map
 * This handles all CRUD operations for games and related entities
 */
export class GameStorage {
  private games: Map<UUID, Game> = new Map();
  private static instance: GameStorage;

  private constructor() {}

  public static getInstance(): GameStorage {
    if (!GameStorage.instance) {
      GameStorage.instance = new GameStorage();
    }
    return GameStorage.instance;
  }

  // ================================================================================
  // GAME CRUD OPERATIONS
  // ================================================================================

  createGameMut(game: Game): void {
    this.games.set(game.id, game);
  }

  getGameCopy(gameId: UUID): Game | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;
    return cloneDeep(game);
  }

  /**
   * Adds the amount to the total pool of the game.
   * Panics if the game is not found.
   */
  addToPoolUncheckedMut(gameId: UUID, amount: AmountCents): void {
    const gameMutable = this.games.get(gameId);
    if (!gameMutable) throw new Error("Game not found");
    gameMutable.totalPool += amount;
  }

  /**
   * Deducts the amount from the bonus pool of the game.
   * Panics if the game is not found.
   */
  cleanBonusPoolUncheckedMut(gameId: UUID): void {
    const gameMutable = this.games.get(gameId);
    if (!gameMutable) throw new Error("Game not found");
    gameMutable.bonusPool = 0;
  }

  updateGameStatusUncheckedMut(gameId: UUID, status: GameState): void {
    const gameMutable = this.games.get(gameId);
    if (!gameMutable) throw new Error("Game not found");
    gameMutable.state = status;
  }

  cashoutPlayerUncheckedMut(
    gameId: UUID,
    cashoutAmount: AmountCents,
    forfeitedAmount: AmountCents
  ): void {
    const gameMutable = this.games.get(gameId);
    if (!gameMutable) throw new Error("Game not found");
    gameMutable.totalCashouts += cashoutAmount;
    gameMutable.bonusPool += forfeitedAmount;
    gameMutable.totalPool -= cashoutAmount;
  }

  deleteGameMut(gameId: UUID): boolean {
    return this.games.delete(gameId);
  }

  private getAllGames(): Game[] {
    return Array.from(this.games.values());
  }

  getGamesByGameMasterCopy(gameMasterId: UUID): Game[] {
    return cloneDeep(
      this.getAllGames().filter((game) => game.gameMasterId === gameMasterId)
    );
  }

  // ================================================================================
  // PLAYER OPERATIONS
  // ================================================================================

  /**
   * Adds a player to the game.
   * Panics if the game is not found.
   */
  addPlayerToGameUncheckedMut(gameId: UUID, player: Player): void {
    const gameMutable = this.games.get(gameId);
    if (!gameMutable) throw new Error("Game not found");
    gameMutable.players.push(player);
  }

  getPlayerUncheckedCopy(gameId: UUID, playerId: UUID): Player | undefined {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");
    return cloneDeep(game.players.find((p) => p.id === playerId));
  }

  increasePlayerProgressUncheckedMut(gameId: UUID, playerId: UUID): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");
    const player = game.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Player not found");

    player.checkpointsCompleted += 1;
  }

  foldPlayerUncheckedMut(gameId: UUID, playerId: UUID): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");
    const player = game.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Player not found");
    player.foldedAtCheckpoint = player.checkpointsCompleted;
  }

  addPlayerBonusUncheckedMut(
    gameId: UUID,
    playerId: UUID,
    bonus: AmountCents
  ): void {
    const gameMutable = this.games.get(gameId);
    if (!gameMutable) throw new Error("Game not found");
    const player = gameMutable.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Player not found");
    player.bonusWon = bonus;
  }

  // ================================================================================
  // CHECK-IN OPERATIONS
  // ================================================================================

  addCheckInUncheckedMut(gameId: UUID, checkIn: CheckIn): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");
    game.checkIns.push(checkIn);
  }

  deleteCheckInUncheckedMut(gameId: UUID, checkInId: UUID): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");
    game.checkIns = game.checkIns.filter((c) => c.id !== checkInId);
  }

  approveCheckInUncheckedMut(
    gameId: UUID,
    checkInId: UUID,
    verifiedBy: "GAMEMASTER" | "AI" | "TIMEOUT_APPROVAL",
    aiConfidence?: number,
    notes?: string
  ): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    const checkInIndex = game.checkIns.findIndex((c) => c.id === checkInId);
    if (checkInIndex === -1) throw new Error("Check-in not found");

    const checkIn = game.checkIns[checkInIndex];
    checkIn.verifiedAt = new Date();
    checkIn.verifiedBy = verifiedBy;
    if (aiConfidence !== undefined) {
      checkIn.aiConfidence = aiConfidence;
    }
    checkIn.notes = notes;
    checkIn.status = "APPROVED";
  }

  rejectCheckInUncheckedMut(
    gameId: UUID,
    checkInId: UUID,
    verifiedBy: "GAMEMASTER" | "AI" | "TIMEOUT_APPROVAL",
    aiConfidence?: number,
    notes?: string
  ): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    const checkInIndex = game.checkIns.findIndex((c) => c.id === checkInId);
    if (checkInIndex === -1) throw new Error("Check-in not found");

    const checkIn = game.checkIns[checkInIndex];
    checkIn.status = "REJECTED";
    checkIn.verifiedAt = new Date();
    checkIn.verifiedBy = verifiedBy;
    checkIn.aiConfidence = aiConfidence;
    checkIn.notes = notes;
  }

  needsReviewCheckInUncheckedMut(
    gameId: UUID,
    checkInId: UUID,
    verifiedBy: "GAMEMASTER" | "AI",
    aiConfidence?: number,
    notes?: string
  ): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");

    const checkInIndex = game.checkIns.findIndex((c) => c.id === checkInId);
    if (checkInIndex === -1) throw new Error("Check-in not found");

    const checkIn = game.checkIns[checkInIndex];
    checkIn.status = "PENDING";
    checkIn.verifiedBy = verifiedBy;
    checkIn.aiConfidence = aiConfidence;
    checkIn.notes = notes;
  }

  getCheckInUncheckedCopy(gameId: UUID, checkInId: UUID): CheckIn | undefined {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found");
    return cloneDeep(game.checkIns.find((c) => c.id === checkInId));
  }

  getPlayerCheckInsCopy(gameId: UUID, playerId: UUID): CheckIn[] {
    const game = this.games.get(gameId);
    if (!game) return [];
    return cloneDeep(game.checkIns.filter((c) => c.playerId === playerId));
  }

  // ================================================================================
  // TRANSACTION OPERATIONS
  // ================================================================================

  addTransactionUncheckedMut(gameId: UUID, transaction: Transaction): void {
    const gameMutable = this.games.get(gameId);
    if (!gameMutable) throw new Error("Game not found");
    gameMutable.transactions.push(transaction);
  }

  getGameTransactionsCopy(gameId: UUID): Transaction[] {
    const game = this.games.get(gameId);
    if (!game) return [];
    return cloneDeep(game.transactions);
  }

  getPlayerTransactionsCopy(gameId: UUID, playerId: UUID): Transaction[] {
    const game = this.games.get(gameId);
    if (!game) return [];
    return cloneDeep(game.transactions.filter((t) => t.playerId === playerId));
  }

  // ================================================================================
  // UTILITY METHODS
  // ================================================================================

  clear(): void {
    this.games.clear();
  }

  size(): number {
    return this.games.size;
  }

  exists(gameId: UUID): boolean {
    return this.games.has(gameId);
  }

  /**
   * Get all games (deep cloned for safety)
   */
  getActiveGamesCopy(): Game[] {
    return Array.from(this.games.values())
      .filter((game) => game.state !== "ENDED")
      .map((game) => cloneDeep(game));
  }
}

// Singleton instance for the application
export const gameStorage = GameStorage.getInstance();
