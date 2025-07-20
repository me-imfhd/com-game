import { z } from "zod";
import { SecureAIPromptSchema } from "./security";

/**
 * BASIC TYPES
 */

/**
 * COMMITMENT CHALLENGE GAME - TYPE DEFINITIONS
 *
 * Game Flow:
 * 1. GameMaster creates game with stakes, checkpoints, timespan
 * 2. Players join by choosing multiplier (stake = stackSize × multiplier)
 * 3. GameMaster starts game when enough players joined
 * 4. Players complete checkpoints during game timespan
 * 5. Players can REDEEM at any checkpoint = CASHOUT = FOLD (exit game)
 * 6. Game ends after timespan, bonuses distributed to players who completed without Cashout
 *
 * Payment Logic (all amounts in cents):
 * - Cashout = (initialStake / totalCheckpoints) × checkpointsCompleted
 * - Forfeited = initialStake - redeemed (goes to bonus pool)
 * - Bonus = (playerStake / totalWinnerStakes) × availableBonusPool
 * - Winners get: initialStake + bonusShare
 * - Folders get: CashoutAmount only
 *
 * Money Handling:
 * - All amounts stored as integers representing cents (e.g., $10.50 = 1050)
 * - Use MoneyUtils for conversion between dollars and cents
 */

export type GameType = z.infer<typeof GameTypeSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type CheckInStatus = z.infer<typeof CheckInStatusSchema>;
export type UUID = z.infer<typeof UUIDSchema>;
export type Media = z.infer<typeof MediaSchema>;
export type MediaFormat = z.infer<typeof MediaFormatSchema>;
export type AIVerification = z.infer<typeof AIVerificationSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type Proof = z.infer<typeof ProofSchema>;

// ================================================================================
// MONETARY TYPES - All amounts stored as cents (integers) to avoid floating point issues
// ================================================================================

/**
 * Monetary amount stored as cents (integer)
 * Example: $10.50 = 1050 cents
 * Example: $1.00 = 100 cents
 * Example: $0.01 = 1 cent
 */
export type AmountCents = number;

// Utility functions for money conversion
export const MoneyUtils = {
  /** Convert dollars to cents: $10.50 -> 1050 */
  dollarsToCents: (dollars: number): AmountCents => Math.round(dollars * 100),

  /** Convert cents to dollars: 1050 -> 10.50 */
  centsToDollars: (cents: AmountCents): number => cents / 100,

  /** Format cents as currency string: 1050 -> "$10.50" */
  formatCents: (cents: AmountCents): string => {
    const dollars = cents / 100;
    return `$${dollars.toFixed(2)}`;
  },

  /** Parse currency string to cents: "$10.50" -> 1050 */
  parseCurrency: (currencyString: string): AmountCents => {
    const cleaned = currencyString.replace(/[$,]/g, "");
    return Math.round(parseFloat(cleaned) * 100);
  },
};
// Core Data Models
export interface CheckIn {
  id: UUID;
  playerId: UUID;
  gameId: UUID;
  checkpointNumber: number; // Which checkpoint this is for
  // Media
  proof: Proof;
  submittedAt: Date;
  status: CheckInStatus;
  verifiedAt?: Date;
  verifiedBy?: "GAMEMASTER" | "AI" | "TIMEOUT_APPROVAL"; // Who verified this check-in
  aiConfidence?: number; // AI confidence level if verified by AI
  notes?: string; // GameMaster's verification notes
}

// Verification method for the game
export type VerificationMethod = "GAMEMASTER" | "AI";

// Transaction Types for All Payments
export type TransactionType = "INITIAL_STAKE" | "CASHOUT" | "PAYOUT" | "REFUND";

export interface Transaction {
  id: UUID;
  playerId: UUID;
  gameId: UUID;
  type: TransactionType;
  amount: AmountCents; // Stored as cents to avoid floating point issues
  timestamp: Date;
  description?: string;
}

export interface Player {
  id: UUID;
  name: string;

  // Multiplier chosen by player (e.g., 1x, 2x, 3x)
  multiplier: number; // gives stake = game.stackSize * multiplier

  foldedAtCheckpoint?: number; // undefined if not folded // gives amount forfeited to bonus pool = stake - redeemed (redeemed = Math.floor(stake / totalCheckpoints) * checkpointsCompleted)

  // Set only when the game ends, derived from forfeited stakes of folded players
  bonusWon?: AmountCents; // calculated as [bonusWonⱼ = (stakeⱼ / totalWinningStake) × bonusPool] where totalWinningStake = sum of stakes of all players who completed the game

  // Player metadata
  joinedAt: Date;
  checkpointsCompleted: number; // Number of checkpoints successfully passed
}

export interface Game {
  readonly id: UUID;
  readonly gameMasterId: UUID;
  readonly title: string;
  readonly description?: string;

  // Game Configuration
  readonly gameType: GameType;
  readonly stackSize: AmountCents; // Base stake amount in cents (e.g., 1000 = $10.00)
  readonly maxMultiplier: number; // Max multiplier players can choose (e.g., 10x)
  readonly maxPlayers: number; // Maximum players allowed
  readonly minPlayers: number; // Minimum players required (default 5)

  // Time Configuration
  readonly startDate: Date;
  readonly endDate: Date;

  // Checkpoints Configuration
  readonly checkpoints: Checkpoint[]; // Description of each checkpoint
  readonly forceCashoutOnMiss: boolean; // If true, players will be forced to cash out if they miss a checkpoint

  // Verification Configuration
  readonly verificationMethod: VerificationMethod; // How check-ins are verified
  readonly aiVerification?: AIVerification; // AI verification settings if enabled

  // Human-Readable Game Definition
  readonly objective: string; // e.g., "Avoid using your phone for more than 1 hour/day"
  readonly playerAction: string; // e.g., "Submit a daily screenshot of Screen Time showing <1h"
  readonly rewardDescription: string; // e.g., "Win 3x your stake if you complete all 3 days"
  readonly failureCondition: string; // e.g., "Submitting a screen time above 1h will forfeit your stake"

  // Game State
  state: GameState;
  players: Player[];
  checkIns: CheckIn[];
  transactions: Transaction[]; // All financial transactions

  // Financial Tracking
  totalPool: AmountCents; // Sum of all initial stakes in cents
  totalCashouts: AmountCents; // Total amount paid out via cashouts in cents
  bonusPool: AmountCents; // Forfeited stakes available for distribution in cents

  endedAt?: Date; // When game actually ended
}

// ================================================================================
// ZOD SCHEMAS FOR INPUT VALIDATION WITH TYPE INFERENCE
// ================================================================================

// Game Type and Status Schemas
export const UUIDSchema = z.uuid("Invalid UUID");
export const GameTypeSchema = z.enum(["TIME_BASED", "WORK_BASED"]);
export const GameStateSchema = z.enum([
  "WAITING_FOR_PLAYERS",
  "IN_PROGRESS",
  "ENDED",
  "CANCELLED",
  "ABORTED_MID_GAME",
]);
export const CheckInStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

// Monetary Amount Schema - validates positive integers representing cents
export const AmountCentsSchema = z
  .number()
  .int("Amount must be an integer (cents)")
  .min(1, "Amount must be positive")
  .max(100000000, "Amount too large"); // Max $1,000,000.00

// Helper schema for dollar input that converts to cents
export const DollarAmountSchema = z
  .number()
  .positive("Amount must be positive")
  .max(1000000, "Amount too large") // Max $1,000,000.00
  .transform((dollars) => MoneyUtils.dollarsToCents(dollars));

export const JoinGameSchema = z.object({
  playerId: UUIDSchema,
  playerName: z
    .string()
    .min(1, "Player name is required")
    .max(50, "Name too long"),
  multiplier: z.number().int().min(1, "Multiplier must be at least 1"),
});

export const MediaFormatSchema = z.enum([
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "TEXT",
  "CODE",
  "DOCUMENT",
  "OTHER",
]);

// Supported media types for AI verification
const AI_SUPPORTED_MEDIA_TYPES = ["IMAGE", "TEXT"];

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1MB

// Supported image formats for AI processing
const SUPPORTED_IMAGE_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export const MediaSchema = z
  .object({
    id: UUIDSchema,
    mediaUrl: z.string().min(1, "Media URL is required"),
    mediaType: MediaFormatSchema,
    fileName: z.string().min(1, "File name is required"),
    fileSize: z.number().int().min(1, "File size is required"),
    mimeType: z.string().min(1, "Mime type is required"),
    uploadedAt: z.date().min(new Date(), "Uploaded at must be in the future"),
    checksum: z.string().min(1, "Checksum is required"),
    tags: z.array(z.string()).min(1, "Tags are required"),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    (media) => {
      // For AI verification, only IMAGE and TEXT are supported
      if (!AI_SUPPORTED_MEDIA_TYPES.includes(media.mediaType)) {
        return false;
      }
      return true;
    },
    {
      message: `Unsupported media type for AI verification. Supported types: ${AI_SUPPORTED_MEDIA_TYPES.join(", ")}`,
      path: ["mediaType"],
    }
  )
  .refine(
    (media) => {
      // Validate image formats
      if (media.mediaType === "IMAGE") {
        if (!SUPPORTED_IMAGE_FORMATS.includes(media.mimeType.toLowerCase())) {
          return false;
        }
      }
      return true;
    },
    {
      message: `Unsupported image format. Supported: ${SUPPORTED_IMAGE_FORMATS.join(", ")}`,
      path: ["mimeType"],
    }
  )
  .refine(
    (media) => {
      // Validate file sizes
      if (media.mediaType === "IMAGE" && media.fileSize > MAX_IMAGE_SIZE) {
        return false;
      }
      if (media.mediaType === "TEXT" && media.fileSize > MAX_TEXT_SIZE) {
        return false;
      }
      return true;
    },
    {
      message: "File size exceeds maximum allowed for media type",
      path: ["fileSize"],
    }
  )
  .refine(
    (media) => {
      // Validate metadata description length
      if (
        media.metadata?.description &&
        media.metadata.description.length > 2000
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Media description too long. Maximum: 2000 characters",
      path: ["metadata", "description"],
    }
  );

export const ProofSchema = z
  .object({
    description: z
      .string()
      .min(1, "Proof description required")
      .max(1000, "Proof description too long. Maximum: 1000 characters")
      .transform((text) => {
        if (!text) return "";

        return text
          .replace(/[<>]/g, "") // Remove angle brackets
          .replace(/\{[^}]*"decision"[^}]*\}/gi, "[REMOVED_SUSPICIOUS_JSON]") // Remove JSON-like structures
          .replace(/```[\s\S]*?```/g, "[REMOVED_CODE_BLOCK]") // Remove code blocks
          .replace(/\[SYSTEM\]/gi, "[REMOVED]")
          .replace(/\[ADMIN\]/gi, "[REMOVED]")
          .replace(/\[OVERRIDE\]/gi, "[REMOVED]")
          .trim();
      }),
    media: z.array(MediaSchema).min(1, "At least one media item is required"),
    annotations: z
      .array(
        z
          .string()
          .max(500, "Annotation too long. Maximum: 500 characters")
          .transform((text) => {
            if (!text) return "";

            return text
              .replace(/[<>]/g, "") // Remove angle brackets
              .replace(
                /\{[^}]*"decision"[^}]*\}/gi,
                "[REMOVED_SUSPICIOUS_JSON]"
              ) // Remove JSON-like structures
              .replace(/```[\s\S]*?```/g, "[REMOVED_CODE_BLOCK]") // Remove code blocks
              .replace(/\[SYSTEM\]/gi, "[REMOVED]")
              .replace(/\[ADMIN\]/gi, "[REMOVED]")
              .replace(/\[OVERRIDE\]/gi, "[REMOVED]")
              .trim();
          })
      )
      .optional(),
  })
  .refine(
    (proof) => {
      // Ensure proof has meaningful content
      const hasDescription = proof.description.trim().length > 0;
      const hasMedia = proof.media.length > 0;
      const hasAnnotations = proof.annotations && proof.annotations.length > 0;

      return hasDescription || hasMedia || hasAnnotations;
    },
    {
      message: "Proof must contain description, media, or annotations",
      path: ["description"],
    }
  )
  .refine(
    (proof) => {
      // Validate game type compatibility - all media must be IMAGE or TEXT for AI verification
      const hasValidMediaTypes = proof.media.every((media) =>
        ["IMAGE", "TEXT"].includes(media.mediaType)
      );
      return hasValidMediaTypes;
    },
    {
      message: "All media must be IMAGE or TEXT type for AI verification",
      path: ["media"],
    }
  );

export const SubmitCheckInSchema = z.object({
  playerId: UUIDSchema,
  checkpointNumber: z.number().int().min(1, "Invalid checkpoint number"),
  proof: ProofSchema,
});

// AI Verification Configuration
export const AIVerificationSchema = z.object({
  // AI Prompting
  prompt: SecureAIPromptSchema,
  criteria: z
    .array(z.string())
    .min(1, "Criteria are required")
    .max(1000, "Criteria must be less than 1000"),
  trustThreshold: z.number().int().min(0).max(100), // 0–100 score from AI verifier
  // Take sample proofs from checkpoints
});

export const VerifyCheckInSchema = z.object({
  checkInId: UUIDSchema,
  gameId: UUIDSchema,
  gameMasterId: UUIDSchema,
  verifiedBy: z.enum(["GAMEMASTER", "AI", "TIMEOUT_APPROVAL"]),
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional(),
});

export const CashoutSchema = z.object({
  playerId: UUIDSchema,
});

export const EndGameSchema = z.object({
  gameId: UUIDSchema,
  gameMasterId: UUIDSchema,
});

export const AbortGameSchema = z.object({
  gameId: UUIDSchema,
  gameMasterId: UUIDSchema,
});

export const StartGameSchema = z.object({
  gameId: UUIDSchema,
  gameMasterId: UUIDSchema,
});

const CheckpointSchema = z.object({
  description: z.string().min(10, "Checkpoint description is required"),
  expiryDate: z.date(), // set to endDate if not provided
  sampleApproval: ProofSchema.optional(),
  sampleRejection: ProofSchema.optional(),
});

// API Input Schemas
export const CreateGameSchema = z
  .object({
    gameMasterId: z.string().min(1, "GameMaster ID is required"),
    title: z.string().min(1, "Title is required").max(100, "Title too long"),
    description: z.string().optional(),
    gameType: GameTypeSchema,
    stackSize: DollarAmountSchema, // Accepts dollars, converts to cents
    maxMultiplier: z
      .number()
      .int()
      .min(1, "Max multiplier must be at least 1")
      .max(100, "Max multiplier too high"),
    maxPlayers: z
      .number()
      .int()
      .min(2, "Need at least 2 players")
      .max(1000, "Too many players"),
    minPlayers: z.number().int().min(2, "Need at least 2 players").default(5),
    startDate: z.date().min(new Date(), "Start date must be in the future"),
    endDate: z.date().min(new Date(), "End date must be in the future"),

    checkpoints: z.array(CheckpointSchema).min(1, "Need at least 1 checkpoint"),

    // Verification Configuration
    verificationMethod: z.enum(["GAMEMASTER", "AI"]).default("GAMEMASTER"),
    aiVerification: AIVerificationSchema.optional(),
    // Human-Readable Game Definition
    objective: z.string().min(10, "Objective is required"), // e.g., "Avoid using your phone for more than 1 hour/day"
    playerAction: z.string().min(10, "Action players must take"), // e.g., "Submit a daily screenshot of Screen Time showing <1h"
    rewardDescription: z.string().min(5, "Reward must be defined"), // e.g., "Win 3x your stake if you complete all 3 days"
    failureCondition: z.string().min(5, "Define what constitutes failure"), // e.g., "Submitting a screen time above 1h will forfeit your stake"

    forceCashoutOnMiss: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // If AI verification is selected, aiVerification settings must be provided
      if (data.verificationMethod === "AI" && !data.aiVerification) {
        return false;
      }
      return true;
    },
    {
      message:
        "AI verification settings are required when verification method is AI",
      path: ["aiVerification"],
    }
  )
  .refine(
    (data) => {
      const { startDate, endDate } = data;

      // Rule 1: Game must be at least 1 hour long
      if (
        endDate <= startDate ||
        endDate.getTime() - startDate.getTime() < 3600000
      ) {
        return false;
      }

      return true;
    },
    {
      message: "Game must be at least 1 hour long",
      path: ["endDate"],
    }
  )
  .refine(
    (data) => {
      const { startDate, endDate, checkpoints } = data;

      for (let i = 0; i < checkpoints.length; i++) {
        const expiry = checkpoints[i].expiryDate;

        if (expiry < startDate || expiry > endDate) {
          return false;
        }

        if (i > 0) {
          const prevExpiry = checkpoints[i - 1].expiryDate;
          if (expiry < prevExpiry) {
            return false;
          }
        }
      }

      return true;
    },
    {
      message:
        "Each checkpoint must expire between game start and end, and expiry dates must be in increasing order.",
      path: ["checkpoints"],
    }
  );

// ================================================================================
// INFERRED TYPES FROM ZOD SCHEMAS
// ================================================================================

export type CreateGameInput = z.infer<typeof CreateGameSchema>;
export type JoinGameInput = z.infer<typeof JoinGameSchema>;
export type SubmitCheckInInput = z.infer<typeof SubmitCheckInSchema>;
export type VerifyCheckInInput = z.infer<typeof VerifyCheckInSchema>;
export type CashoutInput = z.infer<typeof CashoutSchema>;
export type StartGameInput = z.infer<typeof StartGameSchema>;
export type EndGameInput = z.infer<typeof EndGameSchema>;
export type AbortGameInput = z.infer<typeof AbortGameSchema>;

// ================================================================================
// USAGE EXAMPLES:
//
// // Money handling:
// const stackSizeInDollars = 10.50; // $10.50
// const stackSizeInCents = MoneyUtils.dollarsToCents(stackSizeInDollars); // 1050
// const formatted = MoneyUtils.formatCents(stackSizeInCents); // "$10.50"
//
// // In service layer:
// const result = CreateGameSchema.safeParse({
//   ...otherData,
//   stackSize: 10.50 // Input as dollars, automatically converted to cents
// });
// if (!result.success) {
//   return err(new ValidationError(result.error.message));
// }
// const validatedInput: CreateGameInput = result.data;
// // validatedInput.stackSize is now 1050 (cents)
//
// // TypeScript gets full type safety + runtime validation!
// ================================================================================

// ================================================================================
// RESPONSE/RESULT TYPES
// ================================================================================

export interface GameSummary {
  gameId: UUID;
  title: string;
  state: GameState;
  totalPool: AmountCents; // Sum of all stakes in cents
  totalCashouts: AmountCents; // Amount paid via cashouts in cents
  bonusPool: AmountCents; // Available for winners in cents
  playersCount: number;
  winnersCount: number; // Players who completed without cashing out
  endedAt?: Date;
}

export interface PlayerStats {
  playerId: UUID;
  playerName: string;
  stake: AmountCents; // Calculated as stackSize * multiplier, in cents
  checkpointsCompleted: number;
  status: "active" | "folded" | "completed";
  cashoutAmount?: AmountCents; // If they cashed out, in cents
  bonusWon?: AmountCents; // If they won bonuses, in cents
  totalPayout?: AmountCents; // Total amount received, in cents
}
