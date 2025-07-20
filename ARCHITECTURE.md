# Game Service Architecture Documentation

## Overview

This document describes the architectural patterns, data flow, and mutation strategies used in the game service codebase.

## Architecture Layers

### 1. Service Layer (`GameService`)

- **Purpose**: Business logic, validation, and orchestration
- **Responsibilities**:
  - Input validation using Zod schemas
  - Business rule enforcement
  - Coordinating multiple storage operations
  - Error handling with Result pattern

### 2. Storage Layer (`GameStorage`)

- **Purpose**: Data persistence and CRUD operations
- **Responsibilities**:
  - In-memory data storage using Map
  - Direct mutations and immutable updates
  - Data retrieval with cloning for safety

### 3. Types Layer

- **Purpose**: Type safety and data contracts
- **Responsibilities**:
  - TypeScript interfaces and types
  - Zod validation schemas
  - Utility functions (e.g., MoneyUtils)

## Data Flow Patterns

### Join Game Example

**Input**: `gameId: UUID`, `JoinGameInput: { playerId, playerName, multiplier }`

**Flow**:

```
1. Service Layer Validation
   ├── Validate Input Via Zod
   ├── Get game copy from storage
   ├── Validate game exists
   ├── Validate game state = "WAITING_FOR_PLAYERS"
   ├── Validate player count < maxPlayers
   ├── Validate player not already in game
   └── Validate multiplier <= maxMultiplier

2. Object Creation
   ├── Create Player object
   └── Create Transaction object (initial stake)

3. Coordinated Mutations (All-or-nothing)
   ├── gameStorage.addPlayerToGameUncheckedMut()
   ├── gameStorage.addTransactionUncheckedMut()
   └── gameStorage.addToPoolUncheckedMut()

4. Return Updated State
   └── gameStorage.getGameCopy() → Result<Game>
```

### Create Game Example

**Input**: `CreateGameInput: { gameMasterId, title, stackSize, checkpoints, etc. }`

**Flow**:

```
1. Service Layer Validation
   ├── Validate Input Via Zod (with dollar-to-cents conversion)
   ├── Validate checkpointDescriptions.length === totalCheckpoints
   └── Validate endDate > startDate

2. Object Creation
   ├── Generate UUID for game
   └── Create Game object with initial state "WAITING_FOR_PLAYERS"

3. Single Mutation
   └── gameStorage.createGameMut()

4. Return Created Game
   └── Return Result<Game>
```

### Start Game Example

**Input**: `StartGameInput: { gameId, gameMasterId }`

**Flow**:

```
1. Service Layer Validation
   ├── Validate Input Via Zod
   ├── Get game copy from storage
   ├── Validate game exists
   ├── Validate gameMasterId === game.gameMasterId (authorization)
   ├── Validate game state = "WAITING_FOR_PLAYERS"
   ├── Validate timing (startDate <= now <= startDate + 1 hour)
   └── Validate players.length >= minPlayers

2. Single Mutation
   └── gameStorage.updateGameStatusUncheckedMut("IN_PROGRESS")

3. Return Updated State
   └── gameStorage.getGameCopy() → Result<Game>
```

### Submit Check-in Example

**Input**: `gameId: UUID`, `SubmitCheckInInput: { playerId, checkpointNumber, submissionData }`

**Flow**:

```
1. Service Layer Validation
   ├── Validate Input Via Zod
   ├── Get game copy from storage
   ├── Validate game exists
   ├── Validate game state = "IN_PROGRESS"
   ├── Get player from storage
   ├── Validate player exists in game
   ├── Validate player not folded
   ├── Validate checkpointNumber <= totalCheckpoints
   ├── Get player's existing check-ins
   ├── Validate no PENDING check-in exists for this checkpoint
   └── Validate no APPROVED check-in exists for this checkpoint

2. Object Creation
   └── Create CheckIn object with status "PENDING"

3. Single Mutation
   └── gameStorage.addCheckInUncheckedMut()

4. Return Created Check-in
   └── gameStorage.getCheckInUncheckedCopy() → Result<CheckIn>
```

### Verify Check-in Example

**Input**: `gameId: UUID`, `VerifyCheckInInput: { checkInId, gameMasterId, status, notes }`

**Flow**:

```
1. Service Layer Validation
   ├── Validate Input Via Zod
   ├── Get game copy from storage
   ├── Get check-in from storage
   ├── Validate game and check-in exist
   ├── Validate gameMasterId === game.gameMasterId (authorization)
   ├── Validate game state ≠ "ENDED" and ≠ "WAITING_FOR_PLAYERS"
   ├── Validate check-in status = "PENDING"
   ├── Get player from storage
   └── Validate player exists and not folded

2. Conditional Mutations Based on Status
   ├── If APPROVED:
   │   ├── gameStorage.approveCheckInUncheckedMut()
   │   └── gameStorage.increasePlayerProgressUncheckedMut()
   └── If REJECTED:
       └── gameStorage.rejectCheckInUncheckedMut()

3. Return Updated Check-in
   └── gameStorage.getCheckInUncheckedCopy() → Result<CheckIn>
```

### Cash Out Example

**Input**: `gameId: UUID`, `CashoutInput: { playerId }`

**Flow**:

```
1. Service Layer Validation
   ├── Get game copy from storage
   ├── Validate game exists
   ├── Validate game state = "IN_PROGRESS"
   ├── Get player from storage
   ├── Validate player exists in game
   └── Validate player not already folded

2. Financial Calculations
   ├── Calculate stake = stackSize × multiplier
   ├── Calculate cashoutAmount = floor((stake × checkpointsCompleted) / totalCheckpoints)
   └── Calculate forfeitedAmount = stake - cashoutAmount

3. Object Creation
   └── Create Transaction object (type: "CASHOUT")

4. Coordinated Mutations (All-or-nothing)
   ├── gameStorage.foldPlayerUncheckedMut()
   ├── gameStorage.addTransactionUncheckedMut()
   └── gameStorage.cashoutPlayerUncheckedMut()

5. Return Transaction
   └── Return Result<Transaction>
```

### End Game Example

**Input**: `EndGameInput: { gameId, gameMasterId }`

**Flow**:

```
1. Service Layer Validation
   ├── Get game copy from storage
   ├── Validate game exists
   ├── Validate gameMasterId === game.gameMasterId (authorization)
   └── Validate game state ≠ "ENDED" && game state ≠ "WAITING_FOR_PLAYERS"

2. Auto Cash-out Incomplete Players
   ├── Identify non-cashed-out players with incomplete checkpoints
   └── For each: call this.cashOut()

3. Bonus Distribution Calculations
   ├── Identify winners (completed all checkpoints, not folded)
   ├── Calculate totalWinnerStakes
   ├── For each winner:
   │   ├── Calculate bonusShare = floor((winnerStake × bonusPool) / totalWinnerStakes)
   │   └── Track totalBonusDistributed

4. Winner Payout Mutations
   ├── For each winner:
   │   ├── gameStorage.addPlayerBonusUncheckedMut()
   │   └── gameStorage.addTransactionUncheckedMut() (type: "PAYOUT")
   └── gameStorage.deductFromBonusPoolUncheckedMut()

5. Game Completion
   └── gameStorage.updateGameStatusUncheckedMut("ENDED")

6. Return Final Game State
   └── gameStorage.getGameCopy() → Result<Game>
```

### Abort Game Example

**Input**: `AbortGameInput: { gameId, gameMasterId }`

**Flow**:

1. Service Layer Validation
   ├── Get game copy from storage
   ├── Validate game exists
   ├── Validate gameMasterId === game.gameMasterId (authorization)
   └── Validate game state ≠ "ENDED" && game state ≠ "WAITING_FOR_PLAYERS"

2. Refund Logic
   ├── For each player in game.players:
   │ ├── if player.status === "FOLDED":
   │ │ └── Refund player's unspent stake (already cashed out portion is kept)
   │ └── else:
   │ ├── Assume player is still in-game (not folded or cashed out)
   │ └── Refund player's **entire stake**
   └── Track total refunds issued (optional sanity check)

3. Player Payout Mutations
   ├── For each player to refund: if refund amount > 0 because they could possibily already cash out
   └── gameStorage.addTransactionUncheckedMut() (type: "REFUND")

4. Bonus Pool Cleanup
   ├── gameStorage.deductFromBonusPoolUncheckedMut(totalBonusPool)
   └── gameStorage.addTransactionUncheckedMut() (type: "BONUS_POOL_CLEARED", reason: "Game Aborted")

5. Game Abortion Finalization
   └── gameStorage.updateGameStatusUncheckedMut("ABORTED")

6. Return Final Game State
   └── gameStorage.getGameCopy() → Result<Game>

## Mutation Patterns

### Immutability Strategy

**Data Retrieval**: All `get*Copy()` methods return deep clones to prevent accidental mutations

```typescript
// Safe - returns cloned data
const game = gameStorage.getGameCopy(gameId);
const checkIns = gameStorage.getPlayerCheckInsCopy(gameId, playerId);
```

**Mutations**: All `*Mut()` methods directly modify internal state

```typescript
// Direct mutation - only called from service layer
gameStorage.addPlayerToGameUncheckedMut(gameId, player);
```

### Error Handling Patterns

**Service Layer**: Uses Result<T, E> pattern with neverthrow

```typescript
// Business logic errors
if (game.state !== "IN_PROGRESS") {
  return err(GameErrors.GAME_NOT_STARTED(gameId));
}
```

**Storage Layer**: Throws exceptions for impossible states

```typescript
// Programming errors - should never happen
if (!game) throw new Error("Game not found");
```

### Validation Layers

1. **Input Validation**: Zod schemas catch malformed data
2. **Business Rules**: Service layer enforces game logic
3. **Data Integrity**: Storage layer ensures consistency

### Transaction Boundaries

**Single Operation**: Simple state changes

```typescript
gameStorage.updateGameStatusUncheckedMut(gameId, "IN_PROGRESS");
```

**Multi-Operation**: Coordinated mutations (no rollback - design ensures consistency)

```typescript
// Join game: 3 related mutations
gameStorage.addPlayerToGameUncheckedMut(gameId, player);
gameStorage.addTransactionUncheckedMut(gameId, transaction);
gameStorage.addToPoolUncheckedMut(gameId, stake);
```

## Financial Integrity

### Money Tracking

All amounts stored as **cents (integers)** to avoid floating-point errors:

```typescript
// Input: $10.50 → Storage: 1050 cents
const stackSize = DollarAmountSchema.parse(10.5); // → 1050
```

### Financial Equations

**Cashout Amount**:

```
cashoutAmount = floor((stake × checkpointsCompleted) / totalCheckpoints)
```

**Forfeited Amount**:

```
forfeitedAmount = stake - cashoutAmount → bonusPool
```

**Bonus Distribution**:

```
bonusShare = floor((winnerStake × bonusPool) / totalWinnerStakes)
```

### Balance Verification

At any point in the game:

```
totalPool = sum(initialStakes) - totalCashouts
bonusPool = sum(forfeitedAmounts) - sum(distributedBonuses)
```
