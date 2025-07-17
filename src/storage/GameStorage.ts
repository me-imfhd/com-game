import type {
  Game,
  Player,
  CheckIn,
  Transaction,
  UUID,
} from "../types/index.js";

/**
 * In-memory storage for games using Map
 * This handles all CRUD operations for games and related entities
 */
export class GameStorage {
  private games: Map<UUID, Game> = new Map();

  // ================================================================================
  // GAME CRUD OPERATIONS
  // ================================================================================

  createGame(game: Game): void {
    this.games.set(game.id, game);
  }

  getGame(gameId: UUID): Game | undefined {
    return this.games.get(gameId);
  }

  updateGame(gameId: UUID, updates: Partial<Game>): Game | undefined {
    const existingGame = this.games.get(gameId);
    if (!existingGame) return undefined;

    const updatedGame = { ...existingGame, ...updates };
    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  deleteGame(gameId: UUID): boolean {
    return this.games.delete(gameId);
  }

  getAllGames(): Game[] {
    return Array.from(this.games.values());
  }

  getGamesByGameMaster(gameMasterId: UUID): Game[] {
    return this.getAllGames().filter(
      (game) => game.gameMasterId === gameMasterId
    );
  }

  // ================================================================================
  // PLAYER OPERATIONS
  // ================================================================================

  addPlayerToGame(gameId: UUID, player: Player): Game | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;

    const updatedGame = {
      ...game,
      players: [...game.players, player],
    };
    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  updatePlayer(
    gameId: UUID,
    playerId: UUID,
    updates: Partial<Player>
  ): Game | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;

    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return undefined;

    const updatedPlayers = [...game.players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      ...updates,
    };

    const updatedGame = {
      ...game,
      players: updatedPlayers,
    };
    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  getPlayer(gameId: UUID, playerId: UUID): Player | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;
    return game.players.find((p) => p.id === playerId);
  }

  // ================================================================================
  // CHECK-IN OPERATIONS
  // ================================================================================

  addCheckIn(gameId: UUID, checkIn: CheckIn): Game | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;

    const updatedGame = {
      ...game,
      checkIns: [...game.checkIns, checkIn],
    };
    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  updateCheckIn(
    gameId: UUID,
    checkInId: UUID,
    updates: Partial<CheckIn>
  ): Game | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;

    const checkInIndex = game.checkIns.findIndex((c) => c.id === checkInId);
    if (checkInIndex === -1) return undefined;

    const updatedCheckIns = [...game.checkIns];
    updatedCheckIns[checkInIndex] = {
      ...updatedCheckIns[checkInIndex],
      ...updates,
    };

    const updatedGame = {
      ...game,
      checkIns: updatedCheckIns,
    };
    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  getCheckIn(gameId: UUID, checkInId: UUID): CheckIn | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;
    return game.checkIns.find((c) => c.id === checkInId);
  }

  getPlayerCheckIns(gameId: UUID, playerId: UUID): CheckIn[] {
    const game = this.games.get(gameId);
    if (!game) return [];
    return game.checkIns.filter((c) => c.playerId === playerId);
  }

  // ================================================================================
  // TRANSACTION OPERATIONS
  // ================================================================================

  addTransaction(gameId: UUID, transaction: Transaction): Game | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;

    const updatedGame = {
      ...game,
      transactions: [...game.transactions, transaction],
    };
    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  getGameTransactions(gameId: UUID): Transaction[] {
    const game = this.games.get(gameId);
    if (!game) return [];
    return game.transactions;
  }

  getPlayerTransactions(gameId: UUID, playerId: UUID): Transaction[] {
    const game = this.games.get(gameId);
    if (!game) return [];
    return game.transactions.filter((t) => t.playerId === playerId);
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
}

// Singleton instance for the application
export const gameStorage = new GameStorage();
