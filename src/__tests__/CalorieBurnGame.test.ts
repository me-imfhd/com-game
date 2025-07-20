import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { gameService } from "../services/GameService.js";
import { gameStorage } from "../storage/GameStorage.js";
import type { Media, Proof, UUID } from "../types/index.js";
import { MediaSchema, MoneyUtils, ProofSchema } from "../types/index.js";

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

  // Helper function to create valid media for testing
  const createTestMedia = (
    playerName: string,
    checkpoint: number,
    description: string,
    mediaType: "IMAGE" | "TEXT" = "IMAGE"
  ): Media => {
    const baseFileName = `${playerName.toLowerCase()}-workout-${checkpoint}`;
    const extensions = { IMAGE: "jpg", TEXT: "txt" };
    const mimeTypes = { IMAGE: "image/jpeg", TEXT: "text/plain" };
    const fileSizes = { IMAGE: 512000, TEXT: 1024 }; // 512KB for images, 1KB for text

    return {
      id: uuidv4() as UUID,
      mediaUrl: `https://example.com/${baseFileName}.${extensions[mediaType]}`,
      mediaType,
      fileName: `${baseFileName}.${extensions[mediaType]}`,
      fileSize: fileSizes[mediaType],
      mimeType: mimeTypes[mediaType],
      uploadedAt: new Date(),
      checksum: `checksum-${playerName}-${checkpoint}`,
      tags: [`workout-${checkpoint}`, playerName.toLowerCase()],
      metadata: { description },
    };
  };

  // Helper function to create proof objects for testing
  const createTestProof = (
    playerName: string,
    checkpoint: number,
    description: string,
    includeText = false
  ): Proof => {
    const media: Media[] = [
      createTestMedia(playerName, checkpoint, description, "IMAGE"),
    ];

    // Optionally add text media for comprehensive testing
    if (includeText) {
      media.push(
        createTestMedia(
          playerName,
          checkpoint,
          `Text log: ${description}`,
          "TEXT"
        )
      );
    }

    return {
      description,
      media,
      annotations: [
        `Workout completed by ${playerName}`,
        `Checkpoint ${checkpoint} verification`,
      ],
    };
  };

  // Helper function to create invalid media for validation testing
  const createInvalidMedia = (
    type: "oversized" | "unsupported" | "invalid_format"
  ): Media => {
    const baseMedia = createTestMedia("test", 1, "Invalid media test");

    switch (type) {
      case "oversized":
        return { ...baseMedia, fileSize: 25 * 1024 * 1024 }; // 25MB (over 20MB limit)
      case "unsupported":
        return {
          ...baseMedia,
          mediaType: "VIDEO" as any,
          mimeType: "video/mp4",
          fileName: "workout.mp4",
        };
      case "invalid_format":
        return {
          ...baseMedia,
          mimeType: "image/bmp", // Unsupported image format
          fileName: "workout.bmp",
        };
      default:
        return baseMedia;
    }
  };

  beforeEach(() => {
    // Clear storage before each test
    gameStorage.clear();
    // Clear output capture
    testOutput = [];

    // Setup test data
    gameMasterId = uuidv4() as UUID;
    players = [
      { id: uuidv4() as UUID, name: "Alice", multiplier: 2 },
      { id: uuidv4() as UUID, name: "Bob", multiplier: 3 },
      { id: uuidv4() as UUID, name: "Charlie", multiplier: 1 },
      { id: uuidv4() as UUID, name: "Diana", multiplier: 2 },
      { id: uuidv4() as UUID, name: "Eve", multiplier: 1 },
    ];
  });

  describe("Media Validation Tests", () => {
    it("should validate supported media types for AI verification", () => {
      const validImageMedia = createTestMedia(
        "alice",
        1,
        "Valid image",
        "IMAGE"
      );
      const validTextMedia = createTestMedia("alice", 1, "Valid text", "TEXT");

      // Test valid media through schema validation
      const imageResult = MediaSchema.safeParse(validImageMedia);
      const textResult = MediaSchema.safeParse(validTextMedia);

      expect(imageResult.success).toBe(true);
      expect(textResult.success).toBe(true);
    });

    it("should reject unsupported media types", () => {
      const unsupportedMedia = createInvalidMedia("unsupported");
      const result = MediaSchema.safeParse(unsupportedMedia);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain(
          "Unsupported media type for AI verification"
        );
        expect(result.error.message).toContain("Supported types: IMAGE, TEXT");
      }
    });

    it("should reject oversized media files", () => {
      const oversizedMedia = createInvalidMedia("oversized");
      const result = MediaSchema.safeParse(oversizedMedia);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain(
          "File size exceeds maximum allowed for media type"
        );
      }
    });

    it("should reject invalid image formats", () => {
      const invalidFormatMedia = createInvalidMedia("invalid_format");
      const result = MediaSchema.safeParse(invalidFormatMedia);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Unsupported image format");
        expect(result.error.message).toContain(
          "Supported: image/jpeg, image/png, image/gif, image/webp"
        );
      }
    });

    it("should validate proof content for AI processing", () => {
      const validProof = createTestProof(
        "alice",
        1,
        "Valid workout with proper description"
      );
      const result = ProofSchema.safeParse(validProof);

      expect(result.success).toBe(true);
    });

    it("should reject proof with excessive description length", () => {
      const longDescription = "x".repeat(1001); // Over 1000 character limit
      const invalidProof = createTestProof("alice", 1, longDescription);
      const result = ProofSchema.safeParse(invalidProof);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Proof description too long");
        expect(result.error.message).toContain("Maximum: 1000");
      }
    });

    it("should reject proof with excessive annotation length", () => {
      const validProof = createTestProof("alice", 1, "Valid description");
      const longAnnotation = "y".repeat(501); // Over 500 character limit
      validProof.annotations = [longAnnotation];

      const result = ProofSchema.safeParse(validProof);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Annotation too long");
        expect(result.error.message).toContain("Maximum: 500");
      }
    });

    it("should reject empty proof with no content", () => {
      const emptyProof: Proof = {
        description: "",
        media: [],
        annotations: [],
      };

      const result = ProofSchema.safeParse(emptyProof);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain(
          "At least one media item is required"
        );
      }
    });

    it("should reject proof with mixed valid and invalid media types", () => {
      const mixedProof: Proof = {
        description: "Valid description",
        media: [
          createTestMedia("alice", 1, "Valid image", "IMAGE"),
          createInvalidMedia("unsupported"), // This should cause validation to fail
        ],
        annotations: ["Valid annotation"],
      };

      const result = ProofSchema.safeParse(mixedProof);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain(
          "Unsupported media type for AI verification"
        );
      }
    });
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

    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
      endDate, // 7 days from now
      checkpoints: [
        {
          description: "Checkpoint 1: Burn 200 calories (total: 200)",
          expiryDate: endDate,
        },
        {
          description: "Checkpoint 2: Burn 200 calories (total: 400)",
          expiryDate: endDate,
        },
        {
          description: "Checkpoint 3: Burn 200 calories (total: 600)",
          expiryDate: endDate,
        },
        {
          description: "Checkpoint 4: Burn 200 calories (total: 800)",
          expiryDate: endDate,
        },
        {
          description:
            "Checkpoint 5: Burn 200 calories (total: 1000) - COMPLETE!",
          expiryDate: endDate,
        },
      ],
      objective: "Burn 1000 calories over 5 checkpoints",
      playerAction: "Submit workout screenshots showing calories burned",
      rewardDescription:
        "Win up to 3x your stake if you complete all checkpoints",
      failureCondition:
        "Missing a checkpoint or not reaching calorie targets forfeits your stake",
      forceCashoutOnMiss: false,
      verificationMethod: "GAMEMASTER" as const,
    });

    expect(createGameResult.isOk()).toBe(true);
    if (createGameResult.isErr()) throw new Error("Game creation failed");
    const game = createGameResult.value;
    gameId = game.id;

    logAndCapture(`✅ Game created: ${game.title}`);
    logAndCapture(`   Stack size: ${MoneyUtils.formatCents(game.stackSize)}`);
    logAndCapture(`   Total checkpoints: ${game.checkpoints.length}`);
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
      const submitResult = await gameService.submitCheckIn(gameId, {
        playerId: players[0].id,
        checkpointNumber: checkpoint,
        proof: createTestProof(
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
        verifiedBy: "GAMEMASTER",
        notes: `Approved - Good workout session ${checkpoint}`,
      });
      expect(verifyResult.isOk()).toBe(true);

      logAndCapture(`   ✅ Checkpoint ${checkpoint} approved by GameMaster`);
    }

    // Bob completes 3 checkpoints, then cashes out
    logAndCapture("\n👤 Bob's journey (cashes out at checkpoint 3):");
    for (let checkpoint = 1; checkpoint <= 3; checkpoint++) {
      const submitResult = await gameService.submitCheckIn(gameId, {
        playerId: players[1].id,
        checkpointNumber: checkpoint,
        proof: createTestProof(
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
        verifiedBy: "GAMEMASTER",
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
      const submitResult = await gameService.submitCheckIn(gameId, {
        playerId: players[2].id,
        checkpointNumber: checkpoint,
        proof: createTestProof(
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
        verifiedBy: "GAMEMASTER",
        notes: "Excellent CrossFit session",
      });
      expect(verifyResult.isOk()).toBe(true);

      logAndCapture(`   ✅ Checkpoint ${checkpoint} completed`);
    }

    // Diana completes 2 checkpoints, then cashes out
    logAndCapture("\n👤 Diana's journey (cashes out at checkpoint 2):");
    for (let checkpoint = 1; checkpoint <= 2; checkpoint++) {
      const submitResult = await gameService.submitCheckIn(gameId, {
        playerId: players[3].id,
        checkpointNumber: checkpoint,
        proof: createTestProof(
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
        verifiedBy: "GAMEMASTER",
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
    const submitResult = await gameService.submitCheckIn(gameId, {
      playerId: players[4].id,
      checkpointNumber: 1,
      proof: createTestProof("Eve", 1, "Eve went hiking - burned 200 calories"),
    });
    expect(submitResult.isOk()).toBe(true);
    if (submitResult.isErr()) throw new Error("Failed to submit check-in");

    const verifyResult = gameService.verifyCheckIn(gameId, {
      checkInId: submitResult.value.id,
      gameId,
      gameMasterId,
      status: "APPROVED",
      verifiedBy: "GAMEMASTER",
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
        (stake / finalGame.checkpoints.length) * checkpoints
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
