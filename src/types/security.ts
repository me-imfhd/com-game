// ================================================================================
// SECURITY PATTERNS AND VALIDATION
// ================================================================================

import z from "zod";

const DANGEROUS_PATTERNS = [
  // Direct instruction attempts
  /ignore\s+(?:previous|above|all)\s+instructions?/gi,
  /forget\s+(?:previous|above|all)\s+instructions?/gi,
  /disregard\s+(?:previous|above|all)\s+instructions?/gi,

  // Role manipulation
  /you\s+are\s+now\s+(?:a|an)\s+/gi,
  /act\s+(?:as|like)\s+(?:a|an)\s+/gi,
  /pretend\s+(?:to\s+be|you\s+are)\s+/gi,
  /roleplay\s+(?:as|being)\s+/gi,

  // System manipulation
  /system\s*:?\s*(?:override|change|modify)/gi,
  /admin\s*:?\s*(?:override|change|modify)/gi,
  /developer\s*:?\s*(?:override|change|modify)/gi,

  // Response format manipulation
  /respond\s+with\s+(?:only|just)\s+/gi,
  /output\s+(?:only|just)\s+/gi,
  /return\s+(?:only|just)\s+/gi,
  /say\s+(?:only|just)\s+/gi,

  // JSON manipulation attempts
  /\{\s*"decision"\s*:\s*"[^"]*"\s*\}/gi,
  /decision\s*=\s*(?:APPROVED|REJECTED)/gi,

  // Code injection attempts
  /<script>/gi,
  /javascript:/gi,
  /eval\s*\(/gi,
  /function\s*\(/gi,

  // Bypass attempts
  /\[SYSTEM\]/gi,
  /\[ADMIN\]/gi,
  /\[OVERRIDE\]/gi,
  /\[IGNORE\]/gi,
];

const SUSPICIOUS_KEYWORDS = [
  "ignore",
  "forget",
  "disregard",
  "override",
  "bypass",
  "hack",
  "jailbreak",
  "prompt",
  "instruction",
  "system",
  "admin",
  "developer",
  "god mode",
  "unlimited",
  "unrestricted",
  "uncensored",
  "roleplay",
  "pretend",
];

const VERIFICATION_KEYWORDS = [
  "check",
  "verify",
  "ensure",
  "validate",
  "confirm",
  "must",
  "should",
  "require",
  "need",
  "expect",
  "look for",
  "criteria",
  "standard",
  "measure",
  "evaluate",
  "assess",
  "determine",
  "examine",
];

// Secure AI Prompt Schema with built-in sanitization and validation
export const SecureAIPromptSchema = z
  .string()
  .min(10, "AI verification prompt must be at least 10 characters")
  .max(2000, "AI verification prompt must be less than 2000 characters")
  .refine(
    (prompt) => {
      // Check for dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(prompt)) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "Verification prompt contains potentially malicious instructions. Please revise your prompt.",
    }
  )
  .refine(
    (prompt) => {
      // Count suspicious keywords
      const suspiciousCount = SUSPICIOUS_KEYWORDS.reduce((count, keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, "gi");
        return count + (prompt.match(regex)?.length ?? 0);
      }, 0);
      return suspiciousCount <= 3;
    },
    {
      message:
        "Verification prompt contains too many suspicious keywords. Please simplify your verification criteria.",
    }
  )
  .refine(
    (prompt) => {
      // Ensure the prompt focuses on verification criteria
      const textLower = prompt.toLowerCase();
      return VERIFICATION_KEYWORDS.some((keyword) =>
        textLower.includes(keyword)
      );
    },
    {
      message:
        "Verification prompt must contain clear verification criteria (e.g., 'check if', 'verify that', 'ensure', 'validate')",
    }
  )
  .transform((prompt) => {
    // Sanitize the prompt by removing dangerous characters
    return prompt
      .replace(/[<>]/g, "") // Remove angle brackets
      .replace(/\{[^}]*"decision"[^}]*\}/gi, "[REMOVED_SUSPICIOUS_JSON]") // Remove JSON-like structures
      .replace(/```[\s\S]*?```/g, "[REMOVED_CODE_BLOCK]") // Remove code blocks
      .trim();
  });
