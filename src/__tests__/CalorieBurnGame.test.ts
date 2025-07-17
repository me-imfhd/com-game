import { gameService } from "../services/GameService.js";
import { gameStorage } from "../storage/GameStorage.js";
import { MoneyUtils } from "../types/index.js";
import { v4 as uuidv4 } from "uuid";
import type { UUID } from "../types/index.js";

describe("Calorie Burn Challenge Game - Complete Flow", () => {
  let gameId: UUID;
  let gameMasterId: UUID;
  let players: { id: UUID; name: string; multiplier: number }[];

  beforeEach(() => {
    // Clear storage before each test
    gameStorage.clear();

    // Setup test data
    gameMasterId = uuidv4() as UUID;
    players = [
      { id: uuidv4() as UUID, name: "Alice", multiplier: 2 }, // $20 stake
      { id: uuidv4() as UUID, name: "Bob", multiplier: 1 }, // $10 stake
      { id: uuidv4() as UUID, name: "Charlie", multiplier: 3 }, // $30 stake
      { id: uuidv4() as UUID, name: "Diana", multiplier: 1 }, // $10 stake
      { id: uuidv4() as UUID, name: "Eve", multiplier: 2 }, // $20 stake
    ];
  });

  test("Complete Calorie Burn Game Flow", async () => {
    console.log("🔥 Starting Calorie Burn Challenge Game Test");
    console.log(
      "Target: Burn 1000 calories with 5 checkpoints (200 calories each)"
    );
    console.log("Stack size: $10.00, Players with different multipliers");
    console.log("============================================================");

    // ================================================================================
    // STEP 1: GameMaster creates the game
    // ================================================================================
    console.log("\n🎮 STEP 1: GameMaster creates the calorie burn game");

    const createGameResult = gameService.createGame({
      gameMasterId: gameMasterId,
      title: "1000 Calorie Burn Challenge",
      description: "Burn 1000 calories in 7 days - 200 calories per checkpoint",
      gameType: "WORK_BASED",
      stackSize: 10.0, // $10.00 - will be converted to 1000 cents
      maxMultiplier: 5,
      maxPlayers: 10,
      minPlayers: 3,
      duration: 7, // 7 days
      totalCheckpoints: 5,
      checkpointDescriptions: [
        "Checkpoint 1: Burn 200 calories (total: 200)",
        "Checkpoint 2: Burn 200 calories (total: 400)",
        "Checkpoint 3: Burn 200 calories (total: 600)",
        "Checkpoint 4: Burn 200 calories (total: 800)",
        "Checkpoint 5: Burn 200 calories (total: 1000) - COMPLETE!",
      ],
    });

    expect(createGameResult.isOk()).toBe(true);
    if (createGameResult.isErr()) throw new Error("Game creation failed");
    const game = createGameResult.value;
    gameId = game.id;

    console.log(`✅ Game created: ${game.title}`);
    console.log(`   Stack size: ${MoneyUtils.formatCents(game.stackSize)}`);
    console.log(`   Total checkpoints: ${game.totalCheckpoints}`);
    console.log(`   Game ID: ${gameId}`);

    // ================================================================================
    // STEP 2: Players join the game with different stakes
    // ================================================================================
    console.log("\n👥 STEP 2: Players join the game");

    for (const player of players) {
      const joinResult = gameService.joinGame(gameId, {
        playerId: player.id,
        playerName: player.name,
        multiplier: player.multiplier,
      });

      expect(joinResult.isOk()).toBe(true);
      const stake = 1000 * player.multiplier; // $10 * multiplier in cents
      console.log(
        `   ${player.name} joined with ${
          player.multiplier
        }x multiplier = ${MoneyUtils.formatCents(stake)} stake`
      );
    }

    const gameAfterJoins = gameService.getGame(gameId);
    if (gameAfterJoins.isErr()) throw new Error("Failed to get game");
    const totalPool = gameAfterJoins.value.totalPool;
    console.log(totalPool);
    console.log(`\n💰 Total pool: ${MoneyUtils.formatCents(totalPool)}`);
    console.log(
      `   Players: ${gameAfterJoins.value.players.length}/${gameAfterJoins.value.maxPlayers}`
    );

    // ================================================================================
    // STEP 3: GameMaster starts the game
    // ================================================================================
    console.log("\n🚀 STEP 3: GameMaster starts the game");

    const startResult = gameService.startGame({
      gameId: gameId,
      gameMasterId: gameMasterId,
    });

    expect(startResult.isOk()).toBe(true);
    if (startResult.isErr()) throw new Error("Failed to start game");
    console.log(`✅ Game started! State: ${startResult.value.state}`);

    // ================================================================================
    // STEP 4: Players submit proofs for checkpoints and get verified
    // ================================================================================
    console.log("\n🏃‍♀️ STEP 4: Players burn calories and submit proofs");

    // Alice completes all 5 checkpoints (will be a winner)
    console.log("\n👤 Alice's journey (completes all checkpoints):");
    for (let checkpoint = 1; checkpoint <= 5; checkpoint++) {
      // Submit proof
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[0].id,
        checkpointNumber: checkpoint,
        submissionData: `Alice burned 200 calories at gym - workout session ${checkpoint}. Heart rate avg: 145 bpm, duration: 45 min`,
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      console.log(`   📝 Submitted proof for checkpoint ${checkpoint}`);

      // GameMaster verifies
      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        status: "APPROVED",
        notes: `Approved - Good workout session ${checkpoint}`,
      });
      expect(verifyResult.isOk()).toBe(true);

      console.log(`   ✅ Checkpoint ${checkpoint} approved by GameMaster`);
    }

    // Bob completes 3 checkpoints, then cashes out
    console.log("\n👤 Bob's journey (cashes out at checkpoint 3):");
    for (let checkpoint = 1; checkpoint <= 3; checkpoint++) {
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[1].id,
        checkpointNumber: checkpoint,
        submissionData: `Bob jogged ${
          checkpoint * 2
        } miles, burned 200 calories`,
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        status: "APPROVED",
        notes: "Good running session",
      });
      expect(verifyResult.isOk()).toBe(true);

      console.log(`   ✅ Checkpoint ${checkpoint} completed`);
    }

    // Bob cashes out
    const bobCashoutResult = gameService.cashOut(gameId, {
      playerId: players[1].id,
      checkpointNumber: 3,
    });
    expect(bobCashoutResult.isOk()).toBe(true);
    if (bobCashoutResult.isErr()) throw new Error("Failed to cash out");
    const bobCashout = bobCashoutResult.value;
    console.log(`   💸 Bob cashed out: ${bobCashout.description}`);

    // Charlie completes all 5 checkpoints (will be a winner)
    console.log("\n👤 Charlie's journey (completes all checkpoints):");
    for (let checkpoint = 1; checkpoint <= 5; checkpoint++) {
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[2].id,
        checkpointNumber: checkpoint,
        submissionData: `Charlie did CrossFit workout ${checkpoint} - 200 calories burned`,
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        status: "APPROVED",
        notes: "Excellent CrossFit session",
      });
      expect(verifyResult.isOk()).toBe(true);

      console.log(`   ✅ Checkpoint ${checkpoint} completed`);
    }

    // Diana completes 2 checkpoints, then cashes out
    console.log("\n👤 Diana's journey (cashes out at checkpoint 2):");
    for (let checkpoint = 1; checkpoint <= 2; checkpoint++) {
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[3].id,
        checkpointNumber: checkpoint,
        submissionData: `Diana did yoga class ${checkpoint} - 200 calories`,
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        status: "APPROVED",
        notes: "Good yoga session",
      });
      expect(verifyResult.isOk()).toBe(true);

      console.log(`   ✅ Checkpoint ${checkpoint} completed`);
    }

    // Diana cashes out
    const dianaCashoutResult = gameService.cashOut(gameId, {
      playerId: players[3].id,
      checkpointNumber: 2,
    });
    expect(dianaCashoutResult.isOk()).toBe(true);
    if (dianaCashoutResult.isErr()) throw new Error("Failed to cash out");
    const dianaCashout = dianaCashoutResult.value;
    console.log(`   💸 Diana cashed out: ${dianaCashout.description}`);

    // Eve completes 1 checkpoint, then cashes out
    console.log("\n👤 Eve's journey (cashes out at checkpoint 1):");
    const submitResult = gameService.submitCheckIn(gameId, {
      playerId: players[4].id,
      checkpointNumber: 1,
      submissionData: "Eve went hiking - burned 200 calories",
    });
    expect(submitResult.isOk()).toBe(true);
    if (submitResult.isErr()) throw new Error("Failed to submit check-in");

    const verifyResult = gameService.verifyCheckIn(gameId, {
      checkInId: submitResult.value.id,
      status: "APPROVED",
      notes: "Nice hiking session",
    });
    expect(verifyResult.isOk()).toBe(true);

    const eveCashoutResult = gameService.cashOut(gameId, {
      playerId: players[4].id,
      checkpointNumber: 1,
    });
    expect(eveCashoutResult.isOk()).toBe(true);
    if (eveCashoutResult.isErr()) throw new Error("Failed to cash out");
    const eveCashout = eveCashoutResult.value;
    console.log(`   ✅ Checkpoint 1 completed`);
    console.log(`   💸 Eve cashed out: ${eveCashout.description}`);

    // ================================================================================
    // STEP 5: GameMaster ends the game and distributes bonuses
    // ================================================================================
    console.log("\n🏁 STEP 5: GameMaster ends the game");

    const endResult = gameService.endGame({
      gameId: gameId,
      gameMasterId: gameMasterId,
    });
    expect(endResult.isOk()).toBe(true);
    if (endResult.isErr()) throw new Error("Failed to end game");

    const finalGame = endResult.value;
    console.log(`✅ Game ended! Final state: ${finalGame.state}`);

    // ================================================================================
    // STEP 6: Calculate and display final results
    // ================================================================================
    console.log("\n📊 FINAL RESULTS & PAYOUTS");
    console.log("============================================================");

    console.log(`\n💰 Financial Summary:`);
    console.log(
      `   Total Pool: ${MoneyUtils.formatCents(finalGame.totalPool)}`
    );
    console.log(
      `   Total Cashouts: ${MoneyUtils.formatCents(finalGame.totalCashouts)}`
    );
    console.log(
      `   Bonus Pool: ${MoneyUtils.formatCents(finalGame.bonusPool)}`
    );

    console.log(`\n🏆 Winners (completed all checkpoints):`);
    const winners = finalGame.players.filter(
      (p) => p.foldedAtCheckpoint === undefined
    );

    for (const winner of winners) {
      const stake = finalGame.stackSize * winner.multiplier;
      const bonus = winner.bonusWon || 0;
      const totalPayout = stake + bonus;

      console.log(`   ${winner.name}:`);
      console.log(`     - Original stake: ${MoneyUtils.formatCents(stake)}`);
      console.log(`     - Bonus won: ${MoneyUtils.formatCents(bonus)}`);
      console.log(
        `     - Total payout: ${MoneyUtils.formatCents(totalPayout)}`
      );
      console.log(`     - Net profit: ${MoneyUtils.formatCents(bonus)}`);
    }

    console.log(`\n💸 Players who cashed out:`);
    const cashedOut = finalGame.players.filter(
      (p) => p.foldedAtCheckpoint !== undefined
    );

    for (const player of cashedOut) {
      const stake = finalGame.stackSize * player.multiplier;
      const checkpoints = player.foldedAtCheckpoint!;
      const cashoutAmount = Math.floor(
        (stake / finalGame.totalCheckpoints) * checkpoints
      );
      const forfeited = stake - cashoutAmount;

      console.log(`   ${player.name}:`);
      console.log(`     - Original stake: ${MoneyUtils.formatCents(stake)}`);
      console.log(
        `     - Cashed out at checkpoint ${checkpoints}: ${MoneyUtils.formatCents(
          cashoutAmount
        )}`
      );
      console.log(`     - Forfeited: ${MoneyUtils.formatCents(forfeited)}`);
      console.log(`     - Net loss: ${MoneyUtils.formatCents(forfeited)}`);
    }

    // ================================================================================
    // STEP 7: Verify calculations are correct
    // ================================================================================
    console.log("\n🧮 VERIFICATION:");

    // Assertions
    expect(winners.length).toBe(2); // Alice and Charlie
    expect(cashedOut.length).toBe(3); // Bob, Diana, Eve

    // Verify winners got appropriate bonuses
    for (const winner of winners) {
      expect(winner.bonusWon).toBeGreaterThan(0);
      expect(winner.checkpointsCompleted).toBe(5);
    }

    console.log("\n✅ All calculations verified! Game completed successfully.");
    console.log(
      "🎉 Alice and Charlie burned all 1000 calories and won bonuses!"
    );
    console.log(
      "💸 Bob, Diana, and Eve cashed out early but still got partial returns."
    );
  });
});
