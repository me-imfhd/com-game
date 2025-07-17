💪 Enhanced MVP Plan – Commitment Challenge Game

⸻

🎯 Core Goal

Build a minimal backend system that can: 1. Allow GameMasters to create structured games 2. Let Players join, commit stake, and progress through checkpoints 3. Track state in memory with proper validation and logic 4. Distribute stakes and bonuses fairly at game end 5. Use robust error handling with the Result pattern

⸻

🛠️ Technical Stack
• Bun + Express-like routing + TypeScript
• In-memory storage via Map
• Error handling using neverthrow Result/Either pattern
• Zod for runtime validation + type inference
• UUIDs for entity IDs
• Modular structure for services and logic

⸻

## 📊 Current Implementation Status

### ✅ COMPLETED Infrastructure (Foundational Setup)

- **Server Setup**: Express server with TypeScript, middleware, security (helmet, cors)
- **Dependencies**: All required packages installed (neverthrow, express, zod, etc.)
- **Configuration**: Basic config system for port, CORS, API prefix
- **Error Handling**: Basic AppError, NotFoundError, BadRequestError classes
- **Testing**: Jest configuration complete
- **Project Structure**: Proper folder organization in place

### ✅ COMPLETED Data Models & Validation (NEW!)

- **Core Interfaces**: Game, Player, CheckIn, Transaction models with comprehensive business logic
- **Zod Schemas**: Runtime validation + TypeScript inference for all API inputs (CreateGameSchema, JoinGameSchema, etc.)
- **Payment Logic**: Complete cashout calculations, bonus distribution, forfeited amounts
- **Game Flow**: Full game state management (WAITING_FOR_PLAYERS → IN_PROGRESS → ENDED)
- **Financial Tracking**: totalPool, totalCashouts, bonusPool with proper calculations
- **Terminology**: Updated to use "GameMaster" instead of "Captain"
- **Input Validation**: Comprehensive validation rules with clear error messages
- **Monetary System**: Proper cent-based integer amounts to avoid floating-point errors (AmountCents type)

### ✅ COMPLETED Backend Services & Business Logic (NEW!)

- **In-Memory Storage**: Complete GameStorage class with CRUD operations for games, players, check-ins, and transactions
- **Game Service**: Full GameService with business logic for game lifecycle, checkpoints, cashouts, and bonus distribution
- **Result Pattern**: Complete integration with neverthrow for type-safe error handling
- **Error Classes**: Comprehensive game-specific error classes (GameError, PlayerError, PaymentError)
- **Comprehensive Test**: Complete end-to-end test simulating calorie burn challenge with 5 players, cashouts, and bonus distribution

### ❌ TODO: API Routes Implementation

**Remaining functionality to be built:**

- Express API routes connecting to game services
- HTTP request/response handling with Zod validation
- Proper error handling in API layer

⸻

🧩 MVP Components

⸻

1. 🛠 Game Setup & Join Flow (45 mins)

**Status: ❌ NOT STARTED**

✅ Features Needed
• Create new game
• Join game with stake
• Enforce buy-in limits and max stake % per player

🧪 API To Implement
• POST /game/create
• POST /game/:id/join

⚙️ Example GameService (TO BUILD)

```ts
class GameService {
  createGame(input: CreateGameInput): Result<Game, GameError>;
  joinGame(gameId: string, input: JoinGameInput): Result<void, GameError>;
}
```

⸻

2. 🧾 Player Progress & Checkpoints (45 mins)

**Status: ❌ NOT STARTED**

✅ Features Needed
• Players can complete checkpoints
• Fold at any time (lose all)
• Redeem % of stake as they progress

🧪 API To Implement
• POST /game/:id/checkpoint
• POST /game/:id/fold

⚙️ Checkpoint Logic (TO BUILD)

```ts
class ProgressService {
  completeCheckpoint(gameId: string, playerId: string): Result<number, Error>;
  fold(gameId: string, playerId: string): Result<void, Error>;
}
```

3. 🧮 Game Resolution & Payout (30 mins)

**Status: ❌ NOT STARTED**

✅ Features Needed
• At end of game, calculate:
• Full redemptions
• Losers' pool
• Bonus distribution

🧪 API To Implement
• POST /game/:id/finish
• GET /game/:id/state

⚙️ Game Completion Logic (TO BUILD)

```ts
class PayoutService {
  finishGame(gameId: string): Result<GameResult, Error>;
}
```

4. 💾 In-Memory Storage (15 mins)

**Status: 🔄 PARTIALLY COMPLETE**

✅ COMPLETED:
• Complete data model with Game, Player, CheckIn, Transaction interfaces
• Comprehensive financial tracking (totalPool, totalCashouts, bonusPool)
• Full game state management and payment logic
• Zod schemas for all inputs

❌ TODO:
• In-memory storage implementation (Map<string, Game>)
• Storage service with CRUD operations

⚙️ Data Model ✅ COMPLETE (see src/types/index.ts)

⸻

5. 🚦 API Layer (30 mins)

**Status: 🔄 PARTIALLY COMPLETE**

✅ COMPLETED:
• Zod schemas for all input validation (CreateGameSchema, JoinGameSchema, etc.)
• TypeScript types for all API inputs and responses

❌ TODO:
• Register API endpoints in Express router
• Connect routes to service layer
• Wrap service calls with Result pattern
• Return proper HTTP statuses and JSON responses

⸻

6. 🧯 Error Handling with neverthrow (15 mins)

**Status: ❌ NOT STARTED**

✅ Tasks Needed
• Use Result<T, E> for all core services
• Define custom error enums:
• GameError (e.g., "GameNotFound", "StakeTooHigh")
• PlayerError (e.g., "AlreadyFolded", "NotInGame")

⚙️ Example (TO IMPLEMENT)

```ts
if (game.players.find((p) => p.id === input.playerId))
  return err(new GameError("PlayerAlreadyJoined"));
```

🔐 Error Handling Strategy (TO BUILD)
• All functions return Result<T, E>
• Clear error enums per service
• Prevent:
• Over-betting
• Duplicate joins
• Checkpoint overflows
• Folding after already folded
• Joining after game end

⸻

| Step | Action                       | API                       |
| ---- | ---------------------------- | ------------------------- |
| 1    | Captain creates game         | POST /game/create         |
| 2    | Players join                 | POST /game/:id/join       |
| 3    | Game starts (auto)           | -                         |
| 4    | Players complete checkpoints | POST /game/:id/checkpoint |
| 5    | Players fold (if any)        | POST /game/:id/fold       |
| 6    | Game ends (captain or auto)  | POST /game/:id/finish     |
| 7    | Get game state/results       | GET /game/:id/state       |

⸻

⸻

## 🚀 Next Steps - Implementation Roadmap

### ✅ COMPLETED: Core Game Models & Validation

~~1. Create `src/types/` directory with Game and Player interfaces~~  
~~2. Zod schemas for input validation with type inference~~  
~~3. Payment logic and financial tracking~~

### ✅ COMPLETED: In-Memory Storage

~~1. Create `src/storage/` directory with GameStorage class~~
~~2. Implement Map<string, Game> with CRUD operations~~
~~3. Add helper methods for game state management~~

### ✅ COMPLETED: Game Service Layer

~~1. Build GameService with createGame, joinGame methods~~
~~2. Implement comprehensive checkpoint and cashout logic~~
~~3. Create bonus distribution and game completion system~~
~~4. Use Result<T, E> pattern throughout with neverthrow~~
~~5. Create game-specific error classes (GameError, PlayerError)~~

### Priority 1: API Routes (25 mins)

1. Add game routes to server.ts: /game/create, /game/:id/join, etc.
2. Connect routes to services with Zod validation
3. Proper HTTP status codes and error handling

### Priority 4: Testing & Validation (15 mins)

1. Test the complete game flow with 1 GameMaster + 3 players
2. Verify bonus calculations and distributions work correctly

⸻

✅ MVP Is Done When:
• You can simulate 1 full game with:
• 1 GameMaster
• 3 Players
• 3 checkpoints
• 1 cashout, 2 completions
• Output shows correct bonus + cashout split

## 📝 Updated Status Summary

**Infrastructure: ✅ COMPLETE** - Server, dependencies, config all set up  
**Data Models & Validation: ✅ COMPLETE** - Types, schemas, payment logic all done  
**Storage & Services: ✅ COMPLETE** - In-memory storage and complete business logic implemented  
**API Routes: ❌ NOT STARTED** - Need Express routes connecting to services

**Progress: ~85% COMPLETE** 🚀
**Estimated Remaining Time: ~25 minutes** to complete API routes

### 🎉 **MAJOR MILESTONE ACHIEVED!**

**Complete game simulation successfully tested:**

- ✅ 5 players with different stakes ($10-$30)
- ✅ Calorie burn challenge (1000 calories, 5 checkpoints)
- ✅ Players submit proofs, GameMaster verifies
- ✅ 3 players cash out early with partial returns
- ✅ 2 players complete all checkpoints and win bonuses
- ✅ Perfect financial calculations and distributions
- ✅ All business logic working flawlessly with Result pattern
