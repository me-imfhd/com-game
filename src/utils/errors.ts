export class AppError extends Error {
  constructor(
    public statusCode: number,
    public status: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "fail", message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, "fail", message);
  }
}

// ================================================================================
// GAME-SPECIFIC ERROR CLASSES FOR NEVERTHROW RESULT PATTERN
// ================================================================================

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

export class PlayerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

// Specific game error types
export const GameErrors = {
  GAME_NOT_FOUND: (gameId: string) => new GameError(`Game ${gameId} not found`),
  GAME_ALREADY_STARTED: (gameId: string) =>
    new GameError(`Game ${gameId} has already started`),
  GAME_ALREADY_ENDED: (gameId: string) =>
    new GameError(`Game ${gameId} has already ended`),
  GAME_NOT_STARTED: (gameId: string) =>
    new GameError(`Game ${gameId} has not started yet`),
  NOT_ENOUGH_PLAYERS: (current: number, required: number) =>
    new GameError(`Not enough players: ${current}/${required}`),
  TOO_MANY_PLAYERS: (current: number, max: number) =>
    new GameError(`Too many players: ${current}/${max}`),
  UNAUTHORIZED_GAME_MASTER: (gameMasterId: string) =>
    new GameError(`User ${gameMasterId} is not the game master`),
} as const;

export const PlayerErrors = {
  PLAYER_NOT_FOUND: (playerId: string) =>
    new PlayerError(`Player ${playerId} not found`),
  PLAYER_ALREADY_JOINED: (playerId: string) =>
    new PlayerError(`Player ${playerId} already joined this game`),
  PLAYER_ALREADY_FOLDED: (playerId: string) =>
    new PlayerError(`Player ${playerId} has already folded`),
  PLAYER_NOT_IN_GAME: (playerId: string) =>
    new PlayerError(`Player ${playerId} is not in this game`),
  INVALID_MULTIPLIER: (multiplier: number, max: number) =>
    new PlayerError(`Multiplier ${multiplier} exceeds maximum ${max}`),
  INVALID_CHECKPOINT: (checkpoint: number, total: number) =>
    new PlayerError(
      `Invalid checkpoint ${checkpoint}. Game has ${total} checkpoints`
    ),
  CHECKPOINT_ALREADY_COMPLETED: (checkpoint: number) =>
    new PlayerError(`Checkpoint ${checkpoint} already completed`),
  INSUFFICIENT_CHECKPOINTS: (completed: number, required: number) =>
    new PlayerError(
      `Insufficient checkpoints completed: ${completed}/${required}`
    ),
} as const;

export const PaymentErrors = {
  INSUFFICIENT_FUNDS: (required: number, available: number) =>
    new PaymentError(`Insufficient funds: need ${required}, have ${available}`),
  INVALID_AMOUNT: (amount: number) =>
    new PaymentError(`Invalid amount: ${amount}`),
  CASHOUT_NOT_ALLOWED: (reason: string) =>
    new PaymentError(`Cashout not allowed: ${reason}`),
} as const;
