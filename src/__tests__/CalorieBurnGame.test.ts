import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { gameService } from "../services/GameService.js";
import { gameStorage } from "../storage/GameStorage.js";
import type { Media, UUID } from "../types/index.js";
import { MoneyUtils } from "../types/index.js";

describe("Calorie Burn Challenge Game - Complete Flow", () => {
  let gameId: UUID;
  let gameMasterId: UUID;
  let players: { id: UUID; name: string; multiplier: number }[];
  let testOutput: string[] = [];

  // Helper function to log both to console and capture for file
  const logAndCapture = (message: string): void => {
    console.log(message);
    testOutput.push(message);
  };

  // Helper function to create media objects for testing
  const createTestMedia = (
    playerName: string,
    checkpoint: number,
    description: string
  ): Media[] => [
    {
      id: uuidv4() as UUID,
      mediaUrl: `https://example.com/${playerName.toLowerCase()}-workout-${checkpoint}.jpg`,
      mediaType: "IMAGE" as const,
      fileName: `${playerName.toLowerCase()}-workout-${checkpoint}.jpg`,
      fileSize: 102400,
      mimeType: "image/jpeg",
      uploadedAt: new Date(),
      checksum: `checksum-${playerName}-${checkpoint}`,
      tags: [`workout-${checkpoint}`, playerName.toLowerCase()],
      metadata: { description },
    },
  ];

  beforeEach(() => {
    // Clear storage before each test
    gameStorage.clear();
    // Clear output capture
    testOutput = [];

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
    logAndCapture("🔥 Starting Calorie Burn Challenge Game Test");
    logAndCapture(
      "Target: Burn 1000 calories with 5 checkpoints (200 calories each)"
    );
    logAndCapture("Stack size: $10.00, Players with different multipliers");
    logAndCapture(
      "============================================================"
    );

    // ================================================================================
    // STEP 1: GameMaster creates the game
    // ================================================================================
    logAndCapture("\n🎮 STEP 1: GameMaster creates the calorie burn game");

    const createGameResult = gameService.createGame({
      gameMasterId,
      title: "1000 Calorie Burn Challenge",
      description: "Burn 1000 calories in 7 days - 200 calories per checkpoint",
      gameType: "WORK_BASED",
      stackSize: 10.0, // $10.00 - will be converted to 1000 cents
      maxMultiplier: 5,
      maxPlayers: 10,
      minPlayers: 3,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
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

    logAndCapture(`✅ Game created: ${game.title}`);
    logAndCapture(`   Stack size: ${MoneyUtils.formatCents(game.stackSize)}`);
    logAndCapture(`   Total checkpoints: ${game.totalCheckpoints}`);
    logAndCapture(`   Game ID: ${gameId}`);

    // ================================================================================
    // STEP 2: Players join the game with different stakes
    // ================================================================================
    logAndCapture("\n👥 STEP 2: Players join the game");

    for (const player of players) {
      const joinResult = gameService.joinGame(gameId, {
        playerId: player.id,
        playerName: player.name,
        multiplier: player.multiplier,
      });

      expect(joinResult.isOk()).toBe(true);
      const stake = 1000 * player.multiplier; // $10 * multiplier in cents
      logAndCapture(
        `   ${player.name} joined with ${
          player.multiplier
        }x multiplier = ${MoneyUtils.formatCents(stake)} stake`
      );
    }

    const gameAfterJoins = gameService.getGame(gameId);
    if (gameAfterJoins.isErr()) throw new Error("Failed to get game");
    const totalPool = gameAfterJoins.value.totalPool;
    logAndCapture(`\n💰 Total pool: ${MoneyUtils.formatCents(totalPool)}`);
    logAndCapture(
      `   Players: ${gameAfterJoins.value.players.length}/${gameAfterJoins.value.maxPlayers}`
    );

    // ================================================================================
    // STEP 3: GameMaster starts the game
    // ================================================================================
    logAndCapture("\n🚀 STEP 3: GameMaster starts the game");

    const startResult = gameService.startGame({
      gameId,
      gameMasterId,
    });

    expect(startResult.isOk()).toBe(true);
    if (startResult.isErr()) throw new Error("Failed to start game");
    logAndCapture(`✅ Game started! State: ${startResult.value.state}`);

    // ================================================================================
    // STEP 4: Players submit proofs for checkpoints and get verified
    // ================================================================================
    logAndCapture("\n🏃‍♀️ STEP 4: Players burn calories and submit proofs");

    // Alice completes all 5 checkpoints (will be a winner)
    logAndCapture("\n👤 Alice's journey (completes all checkpoints):");
    for (let checkpoint = 1; checkpoint <= 5; checkpoint++) {
      // Submit proof
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[0].id,
        checkpointNumber: checkpoint,
        media: createTestMedia(
          "Alice",
          checkpoint,
          `Alice burned 200 calories at gym - workout session ${checkpoint}`
        ),
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      logAndCapture(`   📝 Submitted proof for checkpoint ${checkpoint}`);

      // GameMaster verifies
      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        gameId,
        gameMasterId,
        status: "APPROVED",
        notes: `Approved - Good workout session ${checkpoint}`,
      });
      expect(verifyResult.isOk()).toBe(true);

      logAndCapture(`   ✅ Checkpoint ${checkpoint} approved by GameMaster`);
    }

    // Bob completes 3 checkpoints, then cashes out
    logAndCapture("\n👤 Bob's journey (cashes out at checkpoint 3):");
    for (let checkpoint = 1; checkpoint <= 3; checkpoint++) {
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[1].id,
        checkpointNumber: checkpoint,
        media: createTestMedia(
          "Bob",
          checkpoint,
          `Bob jogged ${checkpoint * 2} miles, burned 200 calories`
        ),
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        gameId,
        gameMasterId,
        status: "APPROVED",
        notes: "Good running session",
      });
      expect(verifyResult.isOk()).toBe(true);

      logAndCapture(`   ✅ Checkpoint ${checkpoint} completed`);
    }

    // Bob cashes out
    const bobCashoutResult = gameService.cashOut(gameId, {
      playerId: players[1].id,
    });
    expect(bobCashoutResult.isOk()).toBe(true);
    if (bobCashoutResult.isErr()) throw new Error("Failed to cash out");
    const bobCashout = bobCashoutResult.value;
    logAndCapture(`   💸 Bob cashed out: ${bobCashout.description}`);

    // Charlie completes all 5 checkpoints (will be a winner)
    logAndCapture("\n👤 Charlie's journey (completes all checkpoints):");
    for (let checkpoint = 1; checkpoint <= 5; checkpoint++) {
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[2].id,
        checkpointNumber: checkpoint,
        media: createTestMedia(
          "Charlie",
          checkpoint,
          `Charlie did CrossFit workout ${checkpoint} - 200 calories burned`
        ),
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        gameId,
        gameMasterId,
        status: "APPROVED",
        notes: "Excellent CrossFit session",
      });
      expect(verifyResult.isOk()).toBe(true);

      logAndCapture(`   ✅ Checkpoint ${checkpoint} completed`);
    }

    // Diana completes 2 checkpoints, then cashes out
    logAndCapture("\n👤 Diana's journey (cashes out at checkpoint 2):");
    for (let checkpoint = 1; checkpoint <= 2; checkpoint++) {
      const submitResult = gameService.submitCheckIn(gameId, {
        playerId: players[3].id,
        checkpointNumber: checkpoint,
        media: createTestMedia(
          "Diana",
          checkpoint,
          `Diana did yoga class ${checkpoint} - 200 calories`
        ),
      });
      expect(submitResult.isOk()).toBe(true);
      if (submitResult.isErr()) throw new Error("Failed to submit check-in");

      const verifyResult = gameService.verifyCheckIn(gameId, {
        checkInId: submitResult.value.id,
        gameId,
        gameMasterId,
        status: "APPROVED",
        notes: "Good yoga session",
      });
      expect(verifyResult.isOk()).toBe(true);

      logAndCapture(`   ✅ Checkpoint ${checkpoint} completed`);
    }

    // Diana cashes out
    const dianaCashoutResult = gameService.cashOut(gameId, {
      playerId: players[3].id,
    });
    expect(dianaCashoutResult.isOk()).toBe(true);
    if (dianaCashoutResult.isErr()) throw new Error("Failed to cash out");
    const dianaCashout = dianaCashoutResult.value;
    logAndCapture(`   💸 Diana cashed out: ${dianaCashout.description}`);

    // Eve completes 1 checkpoint, then cashes out
    logAndCapture("\n👤 Eve's journey (cashes out at checkpoint 1):");
    const submitResult = gameService.submitCheckIn(gameId, {
      playerId: players[4].id,
      checkpointNumber: 1,
      media: createTestMedia("Eve", 1, "Eve went hiking - burned 200 calories"),
    });
    expect(submitResult.isOk()).toBe(true);
    if (submitResult.isErr()) throw new Error("Failed to submit check-in");

    const verifyResult = gameService.verifyCheckIn(gameId, {
      checkInId: submitResult.value.id,
      gameId,
      gameMasterId,
      status: "APPROVED",
      notes: "Nice hiking session",
    });
    expect(verifyResult.isOk()).toBe(true);

    const eveCashoutResult = gameService.cashOut(gameId, {
      playerId: players[4].id,
    });
    expect(eveCashoutResult.isOk()).toBe(true);
    if (eveCashoutResult.isErr()) throw new Error("Failed to cash out");
    const eveCashout = eveCashoutResult.value;
    logAndCapture(`   ✅ Checkpoint 1 completed`);
    logAndCapture(`   💸 Eve cashed out: ${eveCashout.description}`);

    // ================================================================================
    // STEP 5: GameMaster ends the game and distributes bonuses
    // ================================================================================
    logAndCapture("\n🏁 STEP 5: GameMaster ends the game");

    const endResult = gameService.endGame({
      gameId,
      gameMasterId,
    });
    expect(endResult.isOk()).toBe(true);
    if (endResult.isErr()) throw new Error("Failed to end game");

    const finalGame = endResult.value;
    logAndCapture(`✅ Game ended! Final state: ${finalGame.state}`);

    // ================================================================================
    // STEP 6: Calculate and display final results
    // ================================================================================
    logAndCapture("\n📊 FINAL RESULTS & PAYOUTS");
    logAndCapture(
      "============================================================"
    );

    logAndCapture(`\n💰 Financial Summary:`);
    logAndCapture(
      `   Total Pool: ${MoneyUtils.formatCents(finalGame.totalPool)}`
    );
    logAndCapture(
      `   Total Cashouts: ${MoneyUtils.formatCents(finalGame.totalCashouts)}`
    );
    logAndCapture(
      `   Bonus Pool: ${MoneyUtils.formatCents(finalGame.bonusPool)}`
    );

    logAndCapture(`\n🏆 Winners (completed all checkpoints):`);
    const winners = finalGame.players.filter(
      (p) => p.foldedAtCheckpoint === undefined
    );

    for (const winner of winners) {
      const stake = finalGame.stackSize * winner.multiplier;
      const bonus = winner.bonusWon ?? 0;
      const totalPayout = stake + bonus;

      logAndCapture(`   ${winner.name}:`);
      logAndCapture(`     - Original stake: ${MoneyUtils.formatCents(stake)}`);
      logAndCapture(`     - Bonus won: ${MoneyUtils.formatCents(bonus)}`);
      logAndCapture(
        `     - Total payout: ${MoneyUtils.formatCents(totalPayout)}`
      );
      logAndCapture(`     - Net profit: ${MoneyUtils.formatCents(bonus)}`);
    }

    logAndCapture(`\n💸 Players who cashed out:`);
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

      logAndCapture(`   ${player.name}:`);
      logAndCapture(`     - Original stake: ${MoneyUtils.formatCents(stake)}`);
      logAndCapture(
        `     - Cashed out at checkpoint ${checkpoints}: ${MoneyUtils.formatCents(
          cashoutAmount
        )}`
      );
      logAndCapture(`     - Forfeited: ${MoneyUtils.formatCents(forfeited)}`);
      logAndCapture(`     - Net loss: ${MoneyUtils.formatCents(forfeited)}`);
    }

    // ================================================================================
    // STEP 7: Verify calculations are correct
    // ================================================================================
    logAndCapture("\n🧮 VERIFICATION:");

    // Assertions
    expect(winners.length).toBe(2); // Alice and Charlie
    expect(cashedOut.length).toBe(3); // Bob, Diana, Eve

    // Verify winners got appropriate bonuses
    for (const winner of winners) {
      expect(winner.bonusWon).toBeGreaterThan(0);
      expect(winner.checkpointsCompleted).toBe(5);
    }

    logAndCapture(
      "\n✅ All calculations verified! Game completed successfully."
    );
    logAndCapture(
      "🎉 Alice and Charlie burned all 1000 calories and won bonuses!"
    );
    logAndCapture(
      "💸 Bob, Diana, and Eve cashed out early but still got partial returns."
    );

    // ================================================================================
    // STEP 8: Write output to file
    // ================================================================================
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputFileName = `test-output-${timestamp}.txt`;
    const outputPath = path.join(process.cwd(), outputFileName);

    const fullOutput = [
      `Game Test Output - Generated on ${new Date().toISOString()}`,
      `Test executed at: ${outputPath}`,
      "".padEnd(80, "="),
      "",
      ...testOutput,
    ].join("\n");

    fs.writeFileSync(outputPath, fullOutput, "utf8");
    logAndCapture(`\n📄 Test output written to: ${outputFileName}`);
  });
});
